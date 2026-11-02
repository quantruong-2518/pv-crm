import { Inject, Injectable } from '@nestjs/common'
import { and, asc, count, desc, eq, gt, isNull, lt, ne, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { AssistantEndedBy, AssistantMessageState, AssistantRecordKind } from '@pv/contracts'
import { DB, type Db } from '../db/db.module'
import { CUT_SHORT } from './assistant-context'
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
/* The ceiling on replay: the summary route is seeded off, so nothing else bounds a chat. */
const REPLAY_TURNS = 10
/* Two rows a turn, doubled: a turn that died with no text takes rows and replays nothing. */
const HISTORY_ROWS = REPLAY_TURNS * 4

export type TurnLine = { role: 'user' | 'assistant'; body: string }

/** An exchange with text on both sides; `seq` is its assistant row's, its last. */
export type WholeTurn = { seq: number; question: string; answer: string }

/** The summary, its mark, and the oldest turns the mark does not cover yet. */
export type Unsummarised = {
  summary: string | null
  through: number | null
  turns: readonly WholeTurn[]
}

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
        history: replayable(rows.filter((r) => r.seq > (summaryThrough ?? 0)))
          .slice(-REPLAY_TURNS)
          .flatMap(linesOf),
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

  /** Oldest first, and `limit` counts whole turns, not rows: a run of dead turns holds
   *  rows and no turn, so a row cap would hide the chat from the mark for good. The
   *  mark cannot move past them on its own, because `summary_through` needs a summary:
   *  a fold passes them when it lands. `null` = the session is gone. */
  async unsummarised(sessionId: string, limit: number): Promise<Unsummarised | null> {
    const [session] = await this.db
      .select({ summary: assistantSession.summary, through: assistantSession.summaryThrough })
      .from(assistantSession)
      .where(eq(assistantSession.id, sessionId))
    if (!session) return null
    const answer = assistantMessage
    const question = alias(assistantMessage, 'question')
    const turns = await this.db
      .select({ seq: answer.seq, question: question.body, answer: answer.body })
      .from(answer)
      .innerJoin(
        question,
        and(
          eq(question.sessionId, answer.sessionId),
          eq(question.role, 'user'),
          eq(question.seq, sql`${answer.seq} - 1`),
        ),
      )
      .where(
        and(
          eq(answer.sessionId, sessionId),
          eq(answer.role, 'assistant'),
          gt(answer.seq, session.through ?? 0),
          ne(answer.body, CUT_SHORT),
          sql`${answer.body} ~ '\\S' AND ${question.body} ~ '\\S'`,
        ),
      )
      .orderBy(asc(answer.seq))
      .limit(limit)
    return { ...session, turns }
  }

  /** Compare-and-set: no lock is held across the model call, so `read` may be stale
   *  by now, and then this answer is too. False = another fold landed first. */
  async saveSummary(
    sessionId: string,
    read: number | null,
    summary: string,
    through: number,
  ): Promise<boolean> {
    const mark = assistantSession.summaryThrough
    const saved = await this.db
      .update(assistantSession)
      .set({ summary, summaryThrough: through })
      .where(and(eq(assistantSession.id, sessionId), read === null ? isNull(mark) : eq(mark, read)))
      .returning({ id: assistantSession.id })
    return saved.length > 0
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
function replayable(newestFirst: readonly (typeof assistantMessage.$inferSelect)[]): WholeTurn[] {
  const turns: WholeTurn[] = []
  for (const [i, row] of newestFirst.entries()) {
    const question = newestFirst[i + 1]
    if (row.role !== 'assistant' || question?.role !== 'user') continue
    if (row.body.trim() === '' || question.body.trim() === '') continue
    turns.unshift({ seq: row.seq, question: question.body, answer: row.body })
  }
  return turns
}

const linesOf = ({ question, answer }: WholeTurn): TurnLine[] => [
  { role: 'user', body: question },
  { role: 'assistant', body: answer },
]
