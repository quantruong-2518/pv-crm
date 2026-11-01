import { Inject, Injectable } from '@nestjs/common'
import { and, count, desc, eq, gt, lt, sql } from 'drizzle-orm'
import type { AssistantEndedBy, AssistantMessageState, AssistantRecordKind } from '@pv/contracts'
import { DB, type Db } from '../db/db.module'
import {
  assistantMessage,
  assistantSession,
  assistantToolCall,
  type AssistantToolCallValues,
} from './assistant.schema'

/** SQL of a turn. Decides nothing the spec has not fixed; no `platform.audit`
 *  and no tool output pass through here (ADR 0133 D8). */

const TURNS_PER_HOUR = 60
/* Above the 60 s turn cap, so a live turn is never swept as a crash. */
const STALE_AFTER = sql`now() - interval '90 seconds'`
const LAST_HOUR = sql`now() - interval '1 hour'`
/* Six turns, two rows each: every turn writes its user and assistant rows together. */
const HISTORY_ROWS = 12

export type TurnLine = { role: 'user' | 'assistant'; body: string }

export type TurnBegun = {
  ok: true
  turnId: string
  summary: string | null
  subject: { kind: AssistantRecordKind; code: string } | null
  history: readonly TurnLine[]
}
export type TurnRefused = { ok: false; reason: 'no-session' | 'hourly-limit' | 'running' }

export type TurnFinish = {
  state: Exclude<AssistantMessageState, 'running'>
  endedBy: AssistantEndedBy
  body: string
  model: string | null
  rounds: number
  toolTokens: number
  firstTextMs: number | null
  promptVersion: string
}

@Injectable()
export class AssistantRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** The running row goes in first, because it is the fence: when the partial
   *  unique index refuses it nothing else was written, so a refused turn leaves
   *  no user row to count against the hourly limit or to replay as history.
   *  `FOR UPDATE` serialises `seq`, and the sweep commits even on a refusal, so
   *  a crashed turn cannot hold its session shut. */
  beginTurn(
    actorId: string,
    sessionId: string,
    question: string,
  ): Promise<TurnBegun | TurnRefused> {
    return this.db.transaction(async (tx) => {
      await this.sweepStale(tx)
      const [session] = await tx
        .select()
        .from(assistantSession)
        .where(and(eq(assistantSession.id, sessionId), eq(assistantSession.ownerId, actorId)))
        .for('update')
      if (!session) return { ok: false, reason: 'no-session' }
      if ((await this.turnsLastHour(tx, actorId)) >= TURNS_PER_HOUR) {
        return { ok: false, reason: 'hourly-limit' }
      }

      const rows = await tx
        .select()
        .from(assistantMessage)
        .where(eq(assistantMessage.sessionId, sessionId))
        .orderBy(desc(assistantMessage.seq))
        .limit(HISTORY_ROWS)
      const seq = rows[0]?.seq ?? 0
      const [turn] = await tx
        .insert(assistantMessage)
        .values({
          sessionId,
          actorId,
          seq: seq + 2,
          role: 'assistant',
          state: 'running',
        })
        .onConflictDoNothing()
        .returning({ id: assistantMessage.id })
      if (!turn) return { ok: false, reason: 'running' }
      await tx.insert(assistantMessage).values({
        sessionId,
        actorId,
        seq: seq + 1,
        role: 'user',
        body: question,
        state: 'done',
        finishedAt: sql`now()`,
      })

      const { summary, summaryThrough, subjectKind, subjectCode } = session
      return {
        ok: true,
        turnId: turn.id,
        summary,
        subject: subjectKind && subjectCode ? { kind: subjectKind, code: subjectCode } : null,
        history: replayable(rows.filter((r) => r.seq > (summaryThrough ?? 0))),
      }
    })
  }

  /** `state = 'running'`: a turn the sweep already called a crash stays one. */
  async finishTurn(turnId: string, end: TurnFinish): Promise<void> {
    await this.db
      .update(assistantMessage)
      .set({ ...end, finishedAt: sql`now()` })
      .where(and(eq(assistantMessage.id, turnId), eq(assistantMessage.state, 'running')))
  }

  /** After the tools return: `outcome` is NOT NULL, so a call has no row before. */
  async recordToolCalls(rows: readonly AssistantToolCallValues[]): Promise<void> {
    if (rows.length > 0) await this.db.insert(assistantToolCall).values([...rows])
  }

  /** `finished_at` in the same UPDATE: the table refuses a finished state without it. */
  private async sweepStale(tx: Db): Promise<void> {
    await tx
      .update(assistantMessage)
      .set({ state: 'failed', endedBy: 'crash', finishedAt: sql`now()` })
      .where(
        and(eq(assistantMessage.state, 'running'), lt(assistantMessage.createdAt, STALE_AFTER)),
      )
  }

  private async turnsLastHour(tx: Db, actorId: string): Promise<number> {
    const [row] = await tx
      .select({ n: count() })
      .from(assistantMessage)
      .where(
        and(
          eq(assistantMessage.actorId, actorId),
          eq(assistantMessage.role, 'user'),
          gt(assistantMessage.createdAt, LAST_HOUR),
        ),
      )
    return row?.n ?? 0
  }
}

/** Oldest first, whole turns only. A turn that died before its first text has
 *  no answer, and a blank text block is a 400 at Anthropic. */
function replayable(newestFirst: readonly (typeof assistantMessage.$inferSelect)[]): TurnLine[] {
  const lines: TurnLine[] = []
  for (const [i, row] of newestFirst.entries()) {
    const question = newestFirst[i + 1]
    if (row.role !== 'assistant' || question?.role !== 'user') continue
    if (row.body.trim() === '' || question.body.trim() === '') continue
    lines.unshift({ role: 'assistant', body: row.body })
    lines.unshift({ role: 'user', body: question.body })
  }
  return lines
}
