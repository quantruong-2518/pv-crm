import { Inject, Injectable } from '@nestjs/common'
import {
  and,
  asc,
  countDistinct,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  lte,
  ne,
  sql,
} from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { AssistantEndedBy, AssistantMessageState, AssistantRecordKind } from '@pv/contracts'
import { aiCall } from '../ai/ai-cost.schema'
import { DB, type Db } from '../db/db.module'
import { CUT_SHORT } from './assistant-context'
import {
  assistantMessage,
  assistantSession,
  assistantToolCall,
  type AssistantToolCallRowDb,
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

/** `turnId`: the assistant row of the exchange, on both of its lines, so the
 *  replay drops a withheld exchange whole and the roles keep alternating. */
export type TurnLine = { role: 'user' | 'assistant'; body: string; turnId: string }

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
  /** The last seq the summary covers: an answer at or below it may be quoted there. */
  summaryThrough: number | null
  subject: { kind: AssistantRecordKind; code: string } | null
  history: readonly TurnLine[]
}
export type TurnRefused = { ok: false; reason: 'no-session' | 'hourly-limit' | 'running' }

export type StoredCall = Pick<
  AssistantToolCallRowDb,
  'name' | 'input' | 'outcome' | 'rowCount' | 'codes' | 'revealsContent'
>

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
        summaryThrough,
        subject: subjectKind && subjectCode ? { kind: subjectKind, code: subjectCode } : null,
        history: replayable(rows.filter((r) => r.seq > (summaryThrough ?? 0)))
          .slice(-REPLAY_TURNS)
          .flatMap(linesOf),
      }
    })
  }

  /** `state = 'running'`: a turn the sweep already called a crash stays one.
   *  False = the sweep got there first. */
  async finishTurn(turnId: string, end: TurnFinish): Promise<boolean> {
    const saved = await this.db
      .update(assistantMessage)
      .set({ ...end, finishedAt: sql`now()` })
      .where(and(eq(assistantMessage.id, turnId), eq(assistantMessage.state, 'running')))
      .returning({ id: assistantMessage.id })
    return saved.length > 0
  }

  /** Each turn's tool calls as stored, by assistant message id: what refs and the
   *  footer are rebuilt from. */
  async callsOf(messageIds: readonly string[]): Promise<Map<string, StoredCall[]>> {
    const calls = new Map(messageIds.map((id) => [id, [] as StoredCall[]]))
    if (messageIds.length === 0) return calls
    const rows = await this.db
      .select({
        messageId: assistantToolCall.messageId,
        name: assistantToolCall.name,
        input: assistantToolCall.input,
        outcome: assistantToolCall.outcome,
        rowCount: assistantToolCall.rowCount,
        codes: assistantToolCall.codes,
        revealsContent: assistantToolCall.revealsContent,
      })
      .from(assistantToolCall)
      .where(inArray(assistantToolCall.messageId, [...messageIds]))
    for (const { messageId, ...call } of rows) calls.get(messageId)?.push(call)
    return calls
  }

  /** A chat's answers, oldest first, up to `throughSeq` when given: the re-check
   *  walks forward from the first one. */
  async answersOf(sessionId: string, throughSeq?: number): Promise<{ id: string; seq: number }[]> {
    return this.db
      .select({ id: assistantMessage.id, seq: assistantMessage.seq })
      .from(assistantMessage)
      .where(
        and(
          eq(assistantMessage.sessionId, sessionId),
          eq(assistantMessage.role, 'assistant'),
          throughSeq === undefined ? undefined : lte(assistantMessage.seq, throughSeq),
        ),
      )
      .orderBy(asc(assistantMessage.seq))
  }

  /** How a turn's row stands, to tell a finish that landed from one that did not. */
  async endOf(turnId: string): Promise<{ state: string; endedBy: string | null } | null> {
    const [row] = await this.db
      .select({ state: assistantMessage.state, endedBy: assistantMessage.endedBy })
      .from(assistantMessage)
      .where(eq(assistantMessage.id, turnId))
    return row ?? null
  }

  /** The boot sweep's door to `sweepStale`; returns how many rows it closed. */
  async sweepInterrupted(): Promise<number> {
    return this.sweepStale(this.db)
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
  private async sweepStale(tx: Db): Promise<number> {
    const swept = await tx
      .update(assistantMessage)
      .set({ state: 'failed', endedBy: 'crash', finishedAt: sql`now()` })
      .where(
        and(eq(assistantMessage.state, 'running'), lt(assistantMessage.createdAt, STALE_AFTER)),
      )
      .returning({ id: assistantMessage.id })
    return swept.length
  }

  /** From the ledger, not from messages: deleting a chat takes its messages with it
   *  and would give the hour back. A turn counts once a vendor was asked; one still
   *  in its first request, or refused before any, does not. */
  private async turnsLastHour(tx: Db, actorId: string): Promise<number> {
    const [row] = await tx
      .select({ n: countDistinct(aiCall.turnId) })
      .from(aiCall)
      .where(
        and(
          eq(aiCall.actorId, actorId),
          inArray(aiCall.task, ['assistant', 'assistant-deep']),
          gt(aiCall.at, LAST_HOUR),
        ),
      )
    return row?.n ?? 0
  }
}

/** Oldest first, whole turns only. A turn that died before its first text has
 *  no answer, and a blank text block is a 400 at Anthropic. */
function replayable(
  newestFirst: readonly (typeof assistantMessage.$inferSelect)[],
): (WholeTurn & { id: string })[] {
  const turns: (WholeTurn & { id: string })[] = []
  for (const [i, row] of newestFirst.entries()) {
    const question = newestFirst[i + 1]
    if (row.role !== 'assistant' || question?.role !== 'user') continue
    if (row.body.trim() === '' || question.body.trim() === '') continue
    turns.unshift({ id: row.id, seq: row.seq, question: question.body, answer: row.body })
  }
  return turns
}

const linesOf = ({ id, question, answer }: WholeTurn & { id: string }): TurnLine[] => [
  { role: 'user', body: question, turnId: id },
  { role: 'assistant', body: answer, turnId: id },
]
