import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import { DB, type Db } from '@api/platform/db/db.module'
import type { RoleId } from '@pv/contracts'
import { actor } from '@api/platform/db/platform.schema'
import {
  kpiOneOnOne,
  kpiOneOnOneAction,
  type KpiOneOnOneActionRowDb,
  type KpiOneOnOneRowDb,
} from './kpi-one-on-one.schema'

/** SQL of the monthly 1:1 (ADR 0158 §4). Decides nothing: who writes, which month
 *  is open and what a refusal says are the service's. Writers take `tx` from
 *  outside, so a note, its actions, its bell and its audit line commit as one. */

export type OneOnOneRow = KpiOneOnOneRowDb & { writerName: string }
export type ActionInput = { text: string; due: string }
export type MyActionRow = KpiOneOnOneActionRowDb & { period: string }
export type ActionOwner = { action: KpiOneOnOneActionRowDb; period: string; actorId: string }

@Injectable()
export class KpiOneOnOneRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  run<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(tx))
  }

  /** `lock` holds the row until the transaction ends, so a rewrite and an
   *  acknowledgement of the same 1:1 cannot both win. */
  async find(
    period: string,
    actorId: string,
    handle: Db = this.db,
    lock = false,
  ): Promise<OneOnOneRow | null> {
    const here = and(eq(kpiOneOnOne.period, period), eq(kpiOneOnOne.actorId, actorId))
    if (lock)
      await handle.select({ id: kpiOneOnOne.id }).from(kpiOneOnOne).where(here).for('update')
    const [hit] = await handle
      .select({ row: kpiOneOnOne, writerName: actor.name })
      .from(kpiOneOnOne)
      .innerJoin(actor, eq(actor.id, kpiOneOnOne.writerId))
      .where(here)
    return hit ? { ...hit.row, writerName: hit.writerName } : null
  }

  actionsOf(oneOnOneId: string, handle: Db = this.db): Promise<KpiOneOnOneActionRowDb[]> {
    return handle
      .select()
      .from(kpiOneOnOneAction)
      .where(eq(kpiOneOnOneAction.oneOnOneId, oneOnOneId))
      .orderBy(asc(kpiOneOnOneAction.position))
  }

  /** The note only: `sent_at` stays the first write, since the bell fired then. */
  async upsert(
    tx: Db,
    input: { period: string; actorId: string; writerId: string; note: string },
    existing: OneOnOneRow | null,
  ): Promise<string> {
    if (existing) {
      await tx
        .update(kpiOneOnOne)
        .set({ note: input.note, writerId: input.writerId })
        .where(eq(kpiOneOnOne.id, existing.id))
      return existing.id
    }
    const [row] = await tx.insert(kpiOneOnOne).values(input).returning({ id: kpiOneOnOne.id })
    if (!row) throw new Error('kpi: one-on-one insert returned no row')
    return row.id
  }

  /** One lock for everything that touches a 1:1's actions, so a rewrite and a tap on "done"
   *  cannot interleave and drop each other's change. */
  async lockRow(tx: Db, oneOnOneId: string): Promise<void> {
    await tx
      .select({ id: kpiOneOnOne.id })
      .from(kpiOneOnOne)
      .where(eq(kpiOneOnOne.id, oneOnOneId))
      .for('update')
  }

  /** Whole replacement, positions 1..n. An action keeps its done state only when its
   *  text and due are unchanged at the same position; ids are new on every save. */
  async replaceActions(tx: Db, oneOnOneId: string, next: readonly ActionInput[]): Promise<void> {
    await this.lockRow(tx, oneOnOneId)
    const before = await this.actionsOf(oneOnOneId, tx)
    await tx.delete(kpiOneOnOneAction).where(eq(kpiOneOnOneAction.oneOnOneId, oneOnOneId))
    if (next.length === 0) return
    await tx.insert(kpiOneOnOneAction).values(
      next.map((a, i) => {
        const old = before.find((b) => b.position === i + 1)
        const kept = old && old.text === a.text && old.due === a.due ? old : null
        return {
          oneOnOneId,
          position: i + 1,
          text: a.text,
          due: a.due,
          doneAt: kept?.doneAt ?? null,
          doneBy: kept?.doneBy ?? null,
        }
      }),
    )
  }

  async acknowledge(tx: Db, id: string): Promise<void> {
    await tx
      .update(kpiOneOnOne)
      .set({ acknowledgedAt: sql`now()` })
      .where(eq(kpiOneOnOne.id, id))
  }

  async actionOwner(actionId: string, handle: Db = this.db): Promise<ActionOwner | null> {
    const [hit] = await handle
      .select({
        action: kpiOneOnOneAction,
        period: kpiOneOnOne.period,
        actorId: kpiOneOnOne.actorId,
      })
      .from(kpiOneOnOneAction)
      .innerJoin(kpiOneOnOne, eq(kpiOneOnOne.id, kpiOneOnOneAction.oneOnOneId))
      .where(eq(kpiOneOnOneAction.id, actionId))
    return hit ?? null
  }

  /** Only while still open, so a second tap keeps the first doer and time. */
  async markDone(tx: Db, actionId: string, by: string): Promise<boolean> {
    const done = await tx
      .update(kpiOneOnOneAction)
      .set({ doneAt: sql`now()`, doneBy: by })
      .where(and(eq(kpiOneOnOneAction.id, actionId), isNull(kpiOneOnOneAction.doneAt)))
      .returning({ id: kpiOneOnOneAction.id })
    return done.length > 0
  }

  async openActionsOf(actorId: string): Promise<MyActionRow[]> {
    const rows = await this.db
      .select({ action: kpiOneOnOneAction, period: kpiOneOnOne.period })
      .from(kpiOneOnOneAction)
      .innerJoin(kpiOneOnOne, eq(kpiOneOnOne.id, kpiOneOnOneAction.oneOnOneId))
      .where(and(eq(kpiOneOnOne.actorId, actorId), isNull(kpiOneOnOneAction.doneAt)))
      .orderBy(asc(kpiOneOnOneAction.due), asc(kpiOneOnOne.period), asc(kpiOneOnOneAction.position))
    return rows.map((r) => ({ ...r.action, period: r.period }))
  }

  async rolesOf(actorId: string, handle: Db = this.db): Promise<RoleId[]> {
    const [row] = await handle
      .select({ roleIds: actor.roleIds })
      .from(actor)
      .where(eq(actor.id, actorId))
    return row?.roleIds ?? []
  }
}
