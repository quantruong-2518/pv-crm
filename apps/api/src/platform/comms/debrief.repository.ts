import { and, asc, desc, eq, gte, inArray, isNull, min, sql, type SQL } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import { COMM_CONFIRM_WITHIN_HOURS, type CommRecordState } from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { actor, objectRef } from '@api/platform/db/platform.schema'
import { attachment } from '@api/platform/storage/attachment.schema'
import {
  debrief,
  debriefAnswer,
  message,
  thread,
  type DebriefAnswerRowDb,
  type DebriefAnswerValues,
  type DebriefRowDb,
  type DebriefValues,
  type ThreadRowDb,
} from './comms.schema'

/** A debrief with what it does not store: owner name, anchor time, its thread
 *  and turn count, the subject's label, and the two derived flags. */
export type DebriefRead = {
  row: DebriefRowDb
  thread: ThreadRowDb
  messageCount: number
  ownerName: string
  anchorAt: Date
  subjectLabel: string
  state: CommRecordState
  late: boolean
}

export type DebriefPointer = { id: string; state: CommRecordState }

export type DebriefCount = { ownerId: string; name: string; pending: number; oldestAt: Date }

/** ADR 0075 §2, derived in SQL and never stored, so a turn or a file landing
 *  moves it with no second write. A covered turn is one written since the
 *  debrief opened — the same window `turnsCovered` counts. */
const STATE = sql<CommRecordState>`CASE
  WHEN ${debrief.closedAt} IS NOT NULL THEN 'done'
  WHEN EXISTS (SELECT 1 FROM ${message} m WHERE m.thread_id = ${debrief.threadId}
         AND m.created_at >= ${debrief.createdAt} AND m.body_text IS NOT NULL)
    OR EXISTS (SELECT 1 FROM ${attachment} a
         WHERE a.owner_kind = 'comm' AND a.owner_code = ${debrief.id}::text)
  THEN 'unconfirmed' ELSE 'empty' END`

/** Late runs from creation, not the anchor: a reply must not reset the clock. */
const LATE = sql<boolean>`(${debrief.closedAt} IS NULL
  AND ${debrief.createdAt} < now() - make_interval(hours => ${COMM_CONFIRM_WITHIN_HOURS}::int))`

/** SQL of the comm record book (ADR 0074, 0075). Decides nothing, checks no
 *  permission; `tx` defaults to the pool the way `ThreadRepository` does. */
@Injectable()
export class DebriefRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  run<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(tx))
  }

  /** Open or join in ONE statement, so two turns logged at once by one owner
   *  meet at `debrief_open_unique` instead of both reading "none open" first.
   *  Joining moves the anchor only: the subject stays the one set at opening. */
  async openOrJoin(
    tx: Db,
    values: { threadId: string; ownerId: string; messageId: string; subjectCode: string },
  ): Promise<string> {
    const [row] = await tx
      .insert(debrief)
      .values(values)
      .onConflictDoUpdate({
        target: [debrief.threadId, debrief.ownerId],
        targetWhere: sql`"closed_at" IS NULL`,
        set: { messageId: sql`excluded.message_id` },
      })
      .returning({ id: debrief.id })
    if (!row) throw new Error('comms.debrief: upsert returned no row')
    return row.id
  }

  /** The owner's newest debrief on a thread, open or closed. */
  async latestOn(tx: Db, threadId: string, ownerId: string): Promise<string | null> {
    const [row] = await tx
      .select({ id: debrief.id })
      .from(debrief)
      .where(and(eq(debrief.threadId, threadId), eq(debrief.ownerId, ownerId)))
      .orderBy(desc(debrief.createdAt))
      .limit(1)
    return row?.id ?? null
  }

  /** Which debrief anchors each of these turns — one statement for a whole
   *  timeline. A turn anchors at most one: only its logger's debrief can. */
  async anchoredOn(
    messageIds: readonly string[],
    tx: Db = this.db,
  ): Promise<Map<string, DebriefPointer>> {
    if (messageIds.length === 0) return new Map()
    const rows = await tx
      .select({ id: debrief.id, messageId: debrief.messageId, state: STATE })
      .from(debrief)
      .where(inArray(debrief.messageId, [...messageIds]))
    return new Map(rows.map((r) => [r.messageId, { id: r.id, state: r.state }]))
  }

  async byId(id: string, tx: Db = this.db): Promise<DebriefRead | null> {
    const [row] = await this.reads(tx).where(eq(debrief.id, id)).limit(1)
    return row ?? null
  }

  /** One subject's records, newest first — the contact-history timeline. */
  async bySubject(code: string): Promise<DebriefRead[]> {
    return this.reads(this.db)
      .where(eq(debrief.subjectCode, code))
      .orderBy(desc(debrief.createdAt), desc(debrief.id))
  }

  /** The records of several subjects at once, newest first. */
  async bySubjects(codes: readonly string[]): Promise<DebriefRead[]> {
    if (codes.length === 0) return []
    return this.reads(this.db)
      .where(inArray(debrief.subjectCode, [...codes]))
      .orderBy(desc(debrief.createdAt), desc(debrief.id))
  }

  /** The row lock `close` takes before judging "still open" — a double-sent
   *  close waits here and then finds `closed_at` set. */
  async lockOpen(tx: Db, id: string): Promise<boolean> {
    const [row] = await tx
      .select({ closedAt: debrief.closedAt })
      .from(debrief)
      .where(eq(debrief.id, id))
      .limit(1)
      .for('update')
    return row !== undefined && row.closedAt === null
  }

  /** One page of an owner's open records, longest-owed first; `subjectCodes`
   *  narrows to one sales run. */
  async pending(
    ownerId: string,
    subjectCodes: readonly string[] | undefined,
    page: { page: number; size: number },
  ): Promise<{ rows: DebriefRead[]; total: number }> {
    const where = and(
      eq(debrief.ownerId, ownerId),
      isNull(debrief.closedAt),
      subjectCodes ? inArray(debrief.subjectCode, [...subjectCodes]) : undefined,
    )
    const [count] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(debrief)
      .where(where)
    const rows = await this.reads(this.db)
      .where(where)
      .orderBy(asc(debrief.createdAt), asc(debrief.id))
      .limit(page.size)
      .offset((page.page - 1) * page.size)
    return { rows, total: count?.n ?? 0 }
  }

  /** Turns covered = turns WRITTEN into the thread since the debrief opened
   *  (`message.created_at`, not `at`): a call remembered a day late and logged
   *  now is part of what this close-out speaks for. */
  async turnsCovered(debriefIds: readonly string[]): Promise<Map<string, number>> {
    if (debriefIds.length === 0) return new Map()
    const rows = await this.db
      .select({ id: debrief.id, turns: sql<number>`count(${message.id})::int` })
      .from(debrief)
      .innerJoin(
        message,
        and(eq(message.threadId, debrief.threadId), gte(message.createdAt, debrief.createdAt)),
      )
      .where(inArray(debrief.id, [...debriefIds]))
      .groupBy(debrief.id)
    return new Map(rows.map((r) => [r.id, r.turns]))
  }

  /** Pending per owner; `ownerId` narrows to one row for an `ownOnly` caller.
   *  Age is `created_at` (when the comm became owed): the anchor moves to every
   *  new turn, so its `at` would make a backlog look younger with each reply. */
  async counts(ownerId?: string): Promise<DebriefCount[]> {
    return this.db
      .select({
        ownerId: debrief.ownerId,
        name: actor.name,
        pending: sql<number>`count(*)::int`,
        oldestAt: min(debrief.createdAt).mapWith(debrief.createdAt),
      })
      .from(debrief)
      .innerJoin(actor, eq(actor.id, debrief.ownerId))
      .where(and(isNull(debrief.closedAt), ownerId ? eq(debrief.ownerId, ownerId) : undefined))
      .groupBy(debrief.ownerId, actor.name)
      .orderBy(asc(min(debrief.createdAt)), asc(debrief.ownerId))
  }

  async close(
    tx: Db,
    id: string,
    values: Pick<DebriefValues, 'summary' | 'nextKindId' | 'nextKindName' | 'nextText' | 'nextDue'>,
  ): Promise<void> {
    await tx
      .update(debrief)
      .set({ ...values, closedAt: sql`now()` })
      .where(eq(debrief.id, id))
  }

  async insertAnswers(tx: Db, rows: readonly DebriefAnswerValues[]): Promise<void> {
    if (rows.length === 0) return
    await tx.insert(debriefAnswer).values([...rows])
  }

  /** Answers of many debriefs in one statement; a debrief with none is absent. */
  async answersOf(
    debriefIds: readonly string[],
    tx: Db = this.db,
  ): Promise<Map<string, DebriefAnswerRowDb[]>> {
    const byDebrief = new Map<string, DebriefAnswerRowDb[]>()
    if (debriefIds.length === 0) return byDebrief
    const rows = await tx
      .select()
      .from(debriefAnswer)
      .where(inArray(debriefAnswer.debriefId, [...debriefIds]))
      .orderBy(asc(debriefAnswer.criterionId))
    for (const r of rows) byDebrief.set(r.debriefId, [...(byDebrief.get(r.debriefId) ?? []), r])
    return byDebrief
  }

  private reads(tx: Db) {
    const messageCount: SQL<number> = sql<number>`(SELECT count(*) FROM ${message} mc
      WHERE mc.thread_id = ${debrief.threadId})::int`
    return tx
      .select({
        row: debrief,
        thread,
        messageCount,
        ownerName: actor.name,
        anchorAt: message.at,
        subjectLabel: objectRef.label,
        state: STATE,
        late: LATE,
      })
      .from(debrief)
      .innerJoin(thread, eq(thread.id, debrief.threadId))
      .innerJoin(actor, eq(actor.id, debrief.ownerId))
      .innerJoin(message, eq(message.id, debrief.messageId))
      .innerJoin(objectRef, eq(objectRef.code, debrief.subjectCode))
      .$dynamic()
  }
}
