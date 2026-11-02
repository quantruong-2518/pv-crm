import { Inject, Injectable } from '@nestjs/common'
import { and, asc, count, desc, eq, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { AssistantReportBody, AssistantSubject } from '@pv/contracts'
import { DB, type Db } from '../db/db.module'
import { actor } from '../db/platform.schema'
import {
  assistantMessage,
  assistantReport,
  assistantSession,
  type AssistantMessageRowDb,
  type AssistantSessionRowDb,
} from './assistant.schema'

/** SQL of the session doors and the wrong-answer reports. Every session read is
 *  keyed by its owner, so another person's id finds nothing (ADR 0133 §2). */

/* The list's order: pinned first, then last opened, on the millisecond a cursor can
   carry (a `Date` drops the microseconds), then id. */
const UNPINNED = sql<boolean>`(${assistantSession.pinnedAt} IS NULL)`
const OPENED = sql`date_trunc('milliseconds', ${assistantSession.lastOpenedAt})`

/** Where a page of the list ended: the last row's place in the order. */
export type SessionCursor = { unpinned: boolean; at: Date; id: string }

export type SessionPatch = { title?: string; pinned?: boolean }

/** `messageId`, `sessionId` and `seq` stay on the server: the re-check walks the chat. */
export type ReportLine = {
  id: string
  at: Date
  reporterName: string
  reason: AssistantReportBody['reason']
  note: string | null
  question: string
  answer: string
  messageId: string
  sessionId: string
  seq: number
}

@Injectable()
export class AssistantSessionRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  private owned(ownerId: string, id: string) {
    return and(eq(assistantSession.id, id), eq(assistantSession.ownerId, ownerId))
  }

  async open(
    ownerId: string,
    title: string,
    subject: AssistantSubject | null,
  ): Promise<AssistantSessionRowDb> {
    const [row] = await this.db
      .insert(assistantSession)
      .values({ ownerId, title, subjectKind: subject?.kind, subjectCode: subject?.code })
      .returning()
    return row as AssistantSessionRowDb
  }

  async find(ownerId: string, id: string): Promise<AssistantSessionRowDb | null> {
    const [row] = await this.db.select().from(assistantSession).where(this.owned(ownerId, id))
    return row ?? null
  }

  /** Pinned first, then last opened; `limit` rows after `after`. Opening a chat moves
   *  it, so paging can skip or repeat that one row. */
  list(ownerId: string, after: SessionCursor | null, limit: number) {
    const past =
      after &&
      sql`(${UNPINNED} > ${after.unpinned} OR (${UNPINNED} = ${after.unpinned} AND
        (${OPENED} < ${after.at.toISOString()}::timestamptz OR (${OPENED} = ${after.at.toISOString()}::timestamptz
          AND ${assistantSession.id} < ${after.id}::uuid))))`
    return this.db
      .select()
      .from(assistantSession)
      .where(and(eq(assistantSession.ownerId, ownerId), past ?? undefined))
      .orderBy(UNPINNED, sql`${OPENED} DESC`, desc(assistantSession.id))
      .limit(limit)
  }

  /** Opening a session starts its 90 days again. */
  async touch(ownerId: string, id: string): Promise<AssistantSessionRowDb | null> {
    const [row] = await this.db
      .update(assistantSession)
      .set({ lastOpenedAt: sql`now()` })
      .where(this.owned(ownerId, id))
      .returning()
    return row ?? null
  }

  /** A pin keeps its first moment: pressing it twice does not restart anything. */
  async patch(
    ownerId: string,
    id: string,
    { title, pinned }: SessionPatch,
  ): Promise<AssistantSessionRowDb | null> {
    const pinnedAt =
      pinned === undefined
        ? undefined
        : pinned
          ? sql`coalesce(${assistantSession.pinnedAt}, now())`
          : null
    const [row] = await this.db
      .update(assistantSession)
      .set({ title, pinnedAt })
      .where(this.owned(ownerId, id))
      .returning()
    return row ?? null
  }

  async remove(ownerId: string, id: string): Promise<boolean> {
    const gone = await this.db
      .delete(assistantSession)
      .where(this.owned(ownerId, id))
      .returning({ id: assistantSession.id })
    return gone.length > 0
  }

  messages(sessionId: string): Promise<AssistantMessageRowDb[]> {
    return this.db
      .select()
      .from(assistantMessage)
      .where(eq(assistantMessage.sessionId, sessionId))
      .orderBy(asc(assistantMessage.seq))
  }

  /** Only an answer in the reporter's own session. A second press moves the row to
   *  the top of the list with the new reason. False = no such answer of theirs. */
  async report(actorId: string, messageId: string, body: AssistantReportBody): Promise<boolean> {
    const [answer] = await this.db
      .select({ id: assistantMessage.id })
      .from(assistantMessage)
      .innerJoin(assistantSession, eq(assistantSession.id, assistantMessage.sessionId))
      .where(
        and(
          eq(assistantMessage.id, messageId),
          eq(assistantMessage.role, 'assistant'),
          eq(assistantSession.ownerId, actorId),
        ),
      )
    if (!answer) return false
    const values = { reason: body.reason, note: body.note ?? null }
    await this.db
      .insert(assistantReport)
      .values({ messageId, actorId, ...values })
      .onConflictDoUpdate({
        target: [assistantReport.messageId, assistantReport.actorId],
        set: { ...values, createdAt: sql`now()` },
      })
    return true
  }

  /** The answer and the one question before it: nothing else of the session. */
  async reports(page: number, size: number): Promise<{ rows: ReportLine[]; total: number }> {
    const answer = assistantMessage
    const question = alias(assistantMessage, 'question')
    const rows = await this.db
      .select({
        id: assistantReport.id,
        at: assistantReport.createdAt,
        reporterName: actor.name,
        reason: assistantReport.reason,
        note: assistantReport.note,
        question: sql<string>`coalesce(${question.body}, '')`,
        answer: answer.body,
        messageId: answer.id,
        sessionId: answer.sessionId,
        seq: answer.seq,
      })
      .from(assistantReport)
      .innerJoin(answer, eq(answer.id, assistantReport.messageId))
      .innerJoin(actor, eq(actor.id, assistantReport.actorId))
      .leftJoin(
        question,
        and(
          eq(question.sessionId, answer.sessionId),
          eq(question.role, 'user'),
          eq(question.seq, sql`${answer.seq} - 1`),
        ),
      )
      .orderBy(desc(assistantReport.createdAt), desc(assistantReport.id))
      .limit(size)
      .offset((page - 1) * size)
    const [total] = await this.db.select({ n: count() }).from(assistantReport)
    return { rows, total: total?.n ?? 0 }
  }
}
