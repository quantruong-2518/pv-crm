import { and, asc, eq, gte, inArray, isNull, min, sql } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import { DB, type Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import {
  debrief,
  debriefAnswer,
  link,
  message,
  type DebriefAnswerRowDb,
  type DebriefAnswerValues,
  type DebriefRowDb,
  type DebriefValues,
} from './comms.schema'

/** A debrief with the two facts it does not store: who the owner is by name,
 *  and when its anchor turn happened. */
export type DebriefRead = { row: DebriefRowDb; ownerName: string; anchorAt: Date }

export type DebriefPointer = { id: string; state: 'open' | 'closed' }

export type DebriefCount = { ownerId: string; name: string; pending: number; oldestAt: Date }

/** SQL of the close-out book (ADR 0074). Decides nothing, checks no permission;
 *  `tx` defaults to the pool the way `ThreadRepository` does. */
@Injectable()
export class DebriefRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  run<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(tx))
  }

  /** Open or join in ONE statement, so two turns logged at once by one owner
   *  meet at `debrief_open_unique` instead of both reading "none open" first. */
  async openOrJoin(
    tx: Db,
    values: { threadId: string; ownerId: string; messageId: string },
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

  /** Which debrief anchors each of these turns — one statement for a whole
   *  timeline. A turn anchors at most one: only its logger's debrief can. */
  async anchoredOn(
    messageIds: readonly string[],
    tx: Db = this.db,
  ): Promise<Map<string, DebriefPointer>> {
    if (messageIds.length === 0) return new Map()
    const rows = await tx
      .select({ id: debrief.id, messageId: debrief.messageId, closedAt: debrief.closedAt })
      .from(debrief)
      .where(inArray(debrief.messageId, [...messageIds]))
    return new Map(
      rows.map((r) => [r.messageId, { id: r.id, state: r.closedAt ? 'closed' : 'open' }]),
    )
  }

  async byId(id: string, tx: Db = this.db): Promise<DebriefRead | null> {
    const [row] = await this.reads(tx).where(eq(debrief.id, id)).limit(1)
    return row ?? null
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

  /** One owner's whole open queue, longest-owed first. Unpaged because the
   *  service pages it; bounded by one person's own backlog. */
  async openOf(ownerId: string): Promise<DebriefRead[]> {
    return this.reads(this.db)
      .where(and(eq(debrief.ownerId, ownerId), isNull(debrief.closedAt)))
      .orderBy(asc(debrief.createdAt), asc(debrief.id))
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

  /** Link codes of many threads in one statement. */
  async linkCodesOf(threadIds: readonly string[]): Promise<Map<string, string[]>> {
    const byThread = new Map<string, string[]>()
    if (threadIds.length === 0) return byThread
    const rows = await this.db
      .select({ threadId: link.threadId, code: link.objectCode })
      .from(link)
      .where(inArray(link.threadId, [...threadIds]))
      .orderBy(asc(link.objectCode))
    for (const r of rows) byThread.set(r.threadId, [...(byThread.get(r.threadId) ?? []), r.code])
    return byThread
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
    values: Pick<
      DebriefValues,
      'summary' | 'nextSubjectCode' | 'nextKindId' | 'nextKindName' | 'nextText' | 'nextDue'
    >,
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

  async answersOf(debriefId: string, tx: Db = this.db): Promise<DebriefAnswerRowDb[]> {
    return tx
      .select()
      .from(debriefAnswer)
      .where(eq(debriefAnswer.debriefId, debriefId))
      .orderBy(asc(debriefAnswer.criterionId))
  }

  private reads(tx: Db) {
    return tx
      .select({ row: debrief, ownerName: actor.name, anchorAt: message.at })
      .from(debrief)
      .innerJoin(actor, eq(actor.id, debrief.ownerId))
      .innerJoin(message, eq(message.id, debrief.messageId))
      .$dynamic()
  }
}
