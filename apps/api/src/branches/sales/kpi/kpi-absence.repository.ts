import { and, eq, gte, inArray, isNull, lte, ne, or, sql, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { Inject, Injectable } from '@nestjs/common'
import { DB, type Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import { kpiAbsence, type KpiAbsenceRowDb, type KpiAbsenceValues } from './kpi-absence.schema'

/** SQL of `sales.kpi_absence` (ADR 0117). Decides nothing: who may declare,
 *  who may stand in, whether days may move — all the service's. Writers take
 *  `tx` from outside, so a write and its audit line are one transaction. */

/** An absence with the three names the wire prints. */
export type KpiAbsenceRow = KpiAbsenceRowDb & {
  actorName: string
  standInName: string
  declaredByName: string
}

const live = isNull(kpiAbsence.cancelledAt)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Live and covering any day of `[from, to]` (both inclusive). */
const covering = (from: string, to: string): SQL | undefined =>
  and(live, lte(kpiAbsence.fromDay, to), gte(kpiAbsence.toDay, from))

@Injectable()
export class KpiAbsenceRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** For a reader with no transaction of its own (the hub's role audience needs one handle). */
  get readonlyHandle(): Db {
    return this.db
  }

  run<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(tx))
  }

  /** Serialises declarations for one person, so two overlapping ones cannot
   *  both pass the overlap check (there is no exclusion constraint). */
  async lockActor(tx: Db, actorId: string): Promise<void> {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`sales.kpi_absence:${actorId}`}))`)
  }

  /** Who is away on `day`, and whom each named. */
  async awayOn(day: string, handle: Db = this.db): Promise<Map<string, string>> {
    const rows = await handle
      .select({ actorId: kpiAbsence.actorId, standInId: kpiAbsence.standInId })
      .from(kpiAbsence)
      .where(covering(day, day))
    return new Map(rows.map((r) => [r.actorId, r.standInId]))
  }

  /** Which of `ids` are away on any day of `[from, to]`. */
  async awayAmong(ids: readonly string[], from: string, to: string, handle: Db = this.db) {
    if (ids.length === 0) return new Set<string>()
    const rows = await handle
      .select({ actorId: kpiAbsence.actorId })
      .from(kpiAbsence)
      .where(and(covering(from, to), inArray(kpiAbsence.actorId, [...ids])))
    return new Set(rows.map((r) => r.actorId))
  }

  /** `actorId`'s live absences touching `[from, to]`, `except` one being edited. */
  async overlapping(tx: Db, actorId: string, from: string, to: string, except?: string) {
    return tx
      .select({ id: kpiAbsence.id })
      .from(kpiAbsence)
      .where(
        and(
          covering(from, to),
          eq(kpiAbsence.actorId, actorId),
          except ? ne(kpiAbsence.id, except) : undefined,
        ),
      )
  }

  /** Live absences whose first day is `day`: the sweep's stand-in bells. */
  startingOn(day: string, handle: Db = this.db): Promise<KpiAbsenceRow[]> {
    return this.named(handle, and(live, eq(kpiAbsence.fromDay, day)))
  }

  /** The id comes off a URL: a string that is no uuid matches nothing rather
   *  than failing the cast in Postgres. */
  async byId(id: string, handle: Db = this.db): Promise<KpiAbsenceRow | undefined> {
    if (!UUID.test(id)) return undefined
    const [row] = await this.named(handle, eq(kpiAbsence.id, id))
    return row
  }

  /** Live ones not yet over, and ones cancelled since `cancelledSince`;
   *  `who` set keeps the absences of that person and those they stand in for. */
  list(today: string, cancelledSince: Date, who?: string): Promise<KpiAbsenceRow[]> {
    const current = or(
      and(live, gte(kpiAbsence.toDay, today)),
      gte(kpiAbsence.cancelledAt, cancelledSince),
    )
    const mine = who ? or(eq(kpiAbsence.actorId, who), eq(kpiAbsence.standInId, who)) : undefined
    return this.named(this.db, and(current, mine))
  }

  async insert(tx: Db, values: KpiAbsenceValues): Promise<string> {
    const [made] = await tx.insert(kpiAbsence).values(values).returning({ id: kpiAbsence.id })
    return made!.id
  }

  /** `false` when the row was cancelled meanwhile. */
  async setToDay(tx: Db, id: string, toDay: string): Promise<boolean> {
    const done = await tx
      .update(kpiAbsence)
      .set({ toDay })
      .where(and(eq(kpiAbsence.id, id), live))
      .returning({ id: kpiAbsence.id })
    return done.length === 1
  }

  /** `false` when it was already cancelled. */
  async cancel(tx: Db, id: string): Promise<boolean> {
    const done = await tx
      .update(kpiAbsence)
      .set({ cancelledAt: new Date() })
      .where(and(eq(kpiAbsence.id, id), live))
      .returning({ id: kpiAbsence.id })
    return done.length === 1
  }

  /** Items waiting on `actorId`'s seats from `period` on: open counters on the
   *  teams they lead, and packages returned to them — a team's (`teamIds`) or
   *  a room one they sent. What the stand-in bell counts. */
  async waitingFor(actorId: string, teamIds: readonly string[], period: string, handle: Db) {
    const teams =
      teamIds.length > 0
        ? sql`a.team_id::text IN (${sql.join(
            teamIds.map((t) => sql`${t}`),
            sql`, `,
          )})`
        : sql`false`
    const r = (await handle.execute(sql`
      SELECT
        (SELECT count(*) FROM sales.kpi_counter c JOIN sales.kpi_allocation a ON a.id = c.allocation_id
          WHERE c.status = 'open' AND a.period >= ${period} AND ${teams})::int
      + (SELECT count(*) FROM sales.kpi_allocation a
          WHERE a.status = 'returned' AND a.period >= ${period}
            AND (${teams} OR (a.team_id IS NULL AND a.submitted_by = ${actorId})))::int AS n`)) as {
      rows: { n: number }[]
    }
    return Number(r.rows[0]?.n ?? 0)
  }

  /** Locked accounts among `ids` with when they were locked. */
  async lockedAt(ids: readonly string[], handle: Db = this.db) {
    if (ids.length === 0) return []
    const rows = await handle
      .select({ id: actor.id, name: actor.name, disabledAt: actor.disabledAt })
      .from(actor)
      .where(inArray(actor.id, [...ids]))
    return rows.flatMap((r) => (r.disabledAt ? [{ ...r, disabledAt: r.disabledAt }] : []))
  }

  private named(handle: Db, where: SQL | undefined): Promise<KpiAbsenceRow[]> {
    const who = alias(actor, 'who')
    const standIn = alias(actor, 'stand_in')
    const declarer = alias(actor, 'declarer')
    return handle
      .select({
        id: kpiAbsence.id,
        actorId: kpiAbsence.actorId,
        fromDay: kpiAbsence.fromDay,
        toDay: kpiAbsence.toDay,
        standInId: kpiAbsence.standInId,
        declaredById: kpiAbsence.declaredById,
        declaredAt: kpiAbsence.declaredAt,
        cancelledAt: kpiAbsence.cancelledAt,
        actorName: who.name,
        standInName: standIn.name,
        declaredByName: declarer.name,
      })
      .from(kpiAbsence)
      .innerJoin(who, eq(who.id, kpiAbsence.actorId))
      .innerJoin(standIn, eq(standIn.id, kpiAbsence.standInId))
      .innerJoin(declarer, eq(declarer.id, kpiAbsence.declaredById))
      .where(where)
      .orderBy(kpiAbsence.fromDay, kpiAbsence.declaredAt)
  }
}
