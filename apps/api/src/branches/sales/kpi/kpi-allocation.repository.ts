import {
  and,
  asc,
  desc,
  eq,
  exists,
  inArray,
  isNotNull,
  isNull,
  max,
  ne,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { Inject, Injectable } from '@nestjs/common'
import type { KpiMetricKey, RoleId } from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import {
  kpiAllocation,
  kpiAllocationLine,
  kpiAllocationShare,
  kpiCounter,
  type KpiAllocationLineRowDb,
  type KpiAllocationLineValues,
  type KpiAllocationRowDb,
  type KpiAllocationValues,
  type KpiCounterRowDb,
  type KpiCounterValues,
} from './kpi-allocation.schema'
import { kpiTeam } from './kpi-team.schema'
import type { Actors } from './kpi-readings.repository'

/** A package with the names the screen prints beside its two stamps, and the
 *  team's name when it is a team package (`teamId` is on the row itself). */
export type KpiPackageRow = KpiAllocationRowDb & {
  submitter: string
  decider: string | null
  teamName: string | null
}
export type KpiLineRow = KpiAllocationLineRowDb & { name: string }
/** A team's slice of a room package, with the team's name. */
export type KpiShareRow = { allocationId: string; teamId: string; teamName: string } & Pick<
  typeof kpiAllocationShare.$inferSelect,
  'metricKey' | 'value'
>
/** A counter with what it is filed against: the package's role, tier and the line. */
export type KpiCounterRow = KpiCounterRowDb & {
  role: RoleId
  teamId: string | null
  teamName: string | null
  name: string
  assigned: string
}
/** A line of the package that last went through an agreement — the scorecard's input. */
export type KpiAgreedLine = KpiAllocationLineRowDb & { package: KpiAllocationRowDb }

export type Lock = Pick<KpiAllocationRowDb, 'id' | 'status'>
export type LineKey = { allocationId: string; actorId: string; metricKey: KpiMetricKey }
type PackageSet = Partial<
  Pick<
    KpiAllocationValues,
    | 'status'
    | 'submittedBy'
    | 'submittedAt'
    | 'decidedBy'
    | 'decidedAt'
    | 'returnReason'
    | 'ackDays'
  >
>

/** The room tier has no team: `IS NULL`, not `= NULL`. */
const tierIs = (teamId: string | null): SQL | undefined =>
  teamId === null ? isNull(kpiAllocation.teamId) : eq(kpiAllocation.teamId, teamId)

const lineIs = (k: LineKey) =>
  and(
    eq(kpiAllocationLine.allocationId, k.allocationId),
    eq(kpiAllocationLine.actorId, k.actorId),
    eq(kpiAllocationLine.metricKey, k.metricKey),
  )

/** SQL of the three allocation tables. Decides nothing: which package is
 *  live, who may move it, what a line may become — all the service's.
 *
 *  Writers take `tx` from outside, `kpi-targets.repository.ts`'s reason. A
 *  write first locks its package row (`FOR UPDATE`), and every write repeats
 *  the package status it expects in its WHERE, so a write that lost a race
 *  answers 0 and the service turns that into a sentence. */
@Injectable()
export class KpiAllocationRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  run<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(tx))
  }

  /** Every package of one month, oldest version first — a handful of rows. */
  packages(period: string, handle: Db = this.db): Promise<KpiPackageRow[]> {
    const submitter = alias(actor, 'submitter')
    const decider = alias(actor, 'decider')
    return handle
      .select({
        id: kpiAllocation.id,
        period: kpiAllocation.period,
        role: kpiAllocation.role,
        version: kpiAllocation.version,
        teamId: kpiAllocation.teamId,
        status: kpiAllocation.status,
        submittedBy: kpiAllocation.submittedBy,
        submittedAt: kpiAllocation.submittedAt,
        decidedBy: kpiAllocation.decidedBy,
        decidedAt: kpiAllocation.decidedAt,
        returnReason: kpiAllocation.returnReason,
        ackDays: kpiAllocation.ackDays,
        createdAt: kpiAllocation.createdAt,
        submitter: submitter.name,
        decider: decider.name,
        teamName: kpiTeam.name,
      })
      .from(kpiAllocation)
      .innerJoin(submitter, eq(submitter.id, kpiAllocation.submittedBy))
      .leftJoin(decider, eq(decider.id, kpiAllocation.decidedBy))
      .leftJoin(kpiTeam, eq(kpiTeam.id, kpiAllocation.teamId))
      .where(eq(kpiAllocation.period, period))
      .orderBy(asc(kpiAllocation.version))
  }

  /** The live package of (period, role, tier), locked until the transaction
   *  ends. `teamId` null is the room tier. */
  async lockLive(
    tx: Db,
    period: string,
    role: RoleId,
    teamId: string | null,
  ): Promise<KpiAllocationRowDb | undefined> {
    const [row] = await tx
      .select()
      .from(kpiAllocation)
      .where(
        and(
          eq(kpiAllocation.period, period),
          eq(kpiAllocation.role, role),
          tierIs(teamId),
          ne(kpiAllocation.status, 'superseded'),
        ),
      )
      .for('update')
    return row
  }

  /** The live package that holds one of `actorId`'s lines, in whichever tier —
   *  a person has lines in one tier per month. A package already handed down
   *  wins over a draft carrying a stale line, so the holder answers the former. */
  async lockHolding(
    tx: Db,
    period: string,
    role: RoleId,
    actorId: string,
  ): Promise<KpiAllocationRowDb | undefined> {
    const has = tx
      .select({ one: sql`1` })
      .from(kpiAllocationLine)
      .where(
        and(
          eq(kpiAllocationLine.allocationId, kpiAllocation.id),
          eq(kpiAllocationLine.actorId, actorId),
        ),
      )
    const [row] = await tx
      .select()
      .from(kpiAllocation)
      .where(
        and(
          eq(kpiAllocation.period, period),
          eq(kpiAllocation.role, role),
          ne(kpiAllocation.status, 'superseded'),
          exists(has),
        ),
      )
      .orderBy(sql`("status" IN ('submitted', 'agreed')) DESC`, sql`("team_id" IS NULL) ASC`)
      .limit(1)
      .for('update')
    return row
  }

  async lockPackage(tx: Db, id: string): Promise<KpiAllocationRowDb | undefined> {
    const [row] = await tx
      .select()
      .from(kpiAllocation)
      .where(eq(kpiAllocation.id, id))
      .for('update')
    return row
  }

  lines(allocationIds: readonly string[], handle: Db = this.db): Promise<KpiLineRow[]> {
    if (allocationIds.length === 0) return Promise.resolve([])
    return handle
      .select({
        allocationId: kpiAllocationLine.allocationId,
        actorId: kpiAllocationLine.actorId,
        metricKey: kpiAllocationLine.metricKey,
        value: kpiAllocationLine.value,
        ackStatus: kpiAllocationLine.ackStatus,
        ackedAt: kpiAllocationLine.ackedAt,
        ackedByDefault: kpiAllocationLine.ackedByDefault,
        name: actor.name,
      })
      .from(kpiAllocationLine)
      .innerJoin(actor, eq(actor.id, kpiAllocationLine.actorId))
      .where(inArray(kpiAllocationLine.allocationId, [...allocationIds]))
      .orderBy(asc(actor.name), asc(kpiAllocationLine.metricKey))
  }

  /** Per (role, tier), the highest version that was ever agreed: `agreed`, or
   *  `superseded` after it — a decision with no return reason is an agreement
   *  (`kpi_allocation_reason_only_when_returned`). The ONE reading of "the
   *  package in force", for the scorecard and the holder's allocation view.
   *  DISTINCT ON treats the room tier's NULL team as one group. */
  lastAgreed(period: string, handle: Db = this.db): Promise<KpiAllocationRowDb[]> {
    return handle
      .selectDistinctOn([kpiAllocation.role, kpiAllocation.teamId])
      .from(kpiAllocation)
      .where(
        and(
          eq(kpiAllocation.period, period),
          isNotNull(kpiAllocation.decidedAt),
          isNull(kpiAllocation.returnReason),
        ),
      )
      .orderBy(kpiAllocation.role, kpiAllocation.teamId, desc(kpiAllocation.version))
  }

  /** The lines of `lastAgreed` — the scorecard's input. */
  async agreedLines(period: string, actors?: Actors): Promise<KpiAgreedLine[]> {
    const top = await this.lastAgreed(period)
    if (top.length === 0) return []
    const byId = new Map(top.map((p) => [p.id, p]))
    const who = typeof actors === 'string' ? (actors ? [actors] : undefined) : actors
    const rows = await this.db
      .select()
      .from(kpiAllocationLine)
      .where(
        and(
          inArray(kpiAllocationLine.allocationId, [...byId.keys()]),
          who ? inArray(kpiAllocationLine.actorId, [...who]) : undefined,
        ),
      )
    return rows.map((r) => ({ ...r, package: byId.get(r.allocationId)! }))
  }

  /** Every counter filed in one month, newest first, with the line's value. */
  counters(period: string, handle: Db = this.db): Promise<KpiCounterRow[]> {
    return handle
      .select({
        id: kpiCounter.id,
        allocationId: kpiCounter.allocationId,
        actorId: kpiCounter.actorId,
        metricKey: kpiCounter.metricKey,
        proposedValue: kpiCounter.proposedValue,
        reason: kpiCounter.reason,
        status: kpiCounter.status,
        resolvedBy: kpiCounter.resolvedBy,
        resolvedAt: kpiCounter.resolvedAt,
        counterValue: kpiCounter.counterValue,
        createdAt: kpiCounter.createdAt,
        role: kpiAllocation.role,
        teamId: kpiAllocation.teamId,
        teamName: kpiTeam.name,
        name: actor.name,
        assigned: kpiAllocationLine.value,
      })
      .from(kpiCounter)
      .innerJoin(kpiAllocation, eq(kpiAllocation.id, kpiCounter.allocationId))
      .leftJoin(kpiTeam, eq(kpiTeam.id, kpiAllocation.teamId))
      .innerJoin(actor, eq(actor.id, kpiCounter.actorId))
      .innerJoin(
        kpiAllocationLine,
        and(
          eq(kpiAllocationLine.allocationId, kpiCounter.allocationId),
          eq(kpiAllocationLine.actorId, kpiCounter.actorId),
          eq(kpiAllocationLine.metricKey, kpiCounter.metricKey),
        ),
      )
      .where(eq(kpiAllocation.period, period))
      .orderBy(desc(kpiCounter.createdAt))
  }

  /** Versions count per tier: a team's v2 does not wait for the room's. */
  async nextVersion(tx: Db, period: string, role: RoleId, teamId: string | null): Promise<number> {
    const [row] = await tx
      .select({ top: max(kpiAllocation.version) })
      .from(kpiAllocation)
      .where(and(eq(kpiAllocation.period, period), eq(kpiAllocation.role, role), tierIs(teamId)))
    return (row?.top ?? 0) + 1
  }

  /** `null` when another live package or the same version landed first —
   *  `kpi_allocation_one_live_tier_uq` and `kpi_allocation_version_tier_uq` answer it. */
  async insertPackage(tx: Db, row: KpiAllocationValues): Promise<string | null> {
    const [made] = await tx
      .insert(kpiAllocation)
      .values(row)
      .onConflictDoNothing()
      .returning({ id: kpiAllocation.id })
    return made?.id ?? null
  }

  async movePackage(tx: Db, from: Lock, set: PackageSet): Promise<boolean> {
    const moved = await tx
      .update(kpiAllocation)
      .set(set)
      .where(and(eq(kpiAllocation.id, from.id), eq(kpiAllocation.status, from.status)))
      .returning({ id: kpiAllocation.id })
    return moved.length === 1
  }

  /** Upserts a draft's lines. A changed value drops a stale "acknowledged"
   *  back to `pending`; a `countered` line keeps its state for its open counter. */
  async saveDraftLines(tx: Db, rows: KpiAllocationLineValues[]): Promise<void> {
    if (rows.length === 0) return
    const kept = sql`${kpiAllocationLine.value} = excluded.value OR ${kpiAllocationLine.ackStatus} = 'countered'`
    await tx
      .insert(kpiAllocationLine)
      .values(rows)
      .onConflictDoUpdate({
        target: [
          kpiAllocationLine.allocationId,
          kpiAllocationLine.actorId,
          kpiAllocationLine.metricKey,
        ],
        set: {
          value: sql`excluded.value`,
          ackStatus: sql`CASE WHEN ${kept} THEN ${kpiAllocationLine.ackStatus} ELSE 'pending' END`,
          ackedAt: sql`CASE WHEN ${kept} THEN ${kpiAllocationLine.ackedAt} ELSE NULL END`,
          ackedByDefault: sql`CASE WHEN ${kept} THEN ${kpiAllocationLine.ackedByDefault} ELSE false END`,
        },
      })
  }

  async deleteLines(tx: Db, keys: readonly LineKey[]): Promise<void> {
    if (keys.length === 0) return
    await tx.delete(kpiAllocationLine).where(or(...keys.map(lineIs)))
  }

  /** Lines some counter points at, open or settled: the FK keeps them. */
  counterKeys(tx: Db, allocationId: string): Promise<LineKey[]> {
    return tx
      .selectDistinct({
        allocationId: kpiCounter.allocationId,
        actorId: kpiCounter.actorId,
        metricKey: kpiCounter.metricKey,
      })
      .from(kpiCounter)
      .where(eq(kpiCounter.allocationId, allocationId))
  }

  async insertLines(tx: Db, rows: KpiAllocationLineValues[]): Promise<void> {
    if (rows.length === 0) return
    await tx.insert(kpiAllocationLine).values(rows)
  }

  /** Lines of package `pkg` only while it still has `pkg.status`; answers
   *  how many moved, so a line that is not there, or a moved package, shows. */
  async setLines(
    tx: Db,
    pkg: Lock,
    keys: readonly Omit<LineKey, 'allocationId'>[],
    set: Partial<
      Pick<KpiAllocationLineValues, 'ackStatus' | 'ackedAt' | 'ackedByDefault' | 'value'>
    >,
  ): Promise<number> {
    if (keys.length === 0) return 0
    const still = tx
      .select({ one: sql`1` })
      .from(kpiAllocation)
      .where(and(eq(kpiAllocation.id, pkg.id), eq(kpiAllocation.status, pkg.status)))
    const moved = await tx
      .update(kpiAllocationLine)
      .set(set)
      .where(and(exists(still), or(...keys.map((k) => lineIs({ ...k, allocationId: pkg.id })))))
      .returning({ actorId: kpiAllocationLine.actorId })
    return moved.length
  }

  /** The shares of room packages, with the team's name. */
  shares(allocationIds: readonly string[], handle: Db = this.db): Promise<KpiShareRow[]> {
    if (allocationIds.length === 0) return Promise.resolve([])
    return handle
      .select({
        allocationId: kpiAllocationShare.allocationId,
        teamId: kpiAllocationShare.teamId,
        teamName: kpiTeam.name,
        metricKey: kpiAllocationShare.metricKey,
        value: kpiAllocationShare.value,
      })
      .from(kpiAllocationShare)
      .innerJoin(kpiTeam, eq(kpiTeam.id, kpiAllocationShare.teamId))
      .where(inArray(kpiAllocationShare.allocationId, [...allocationIds]))
      .orderBy(asc(kpiTeam.name), asc(kpiAllocationShare.metricKey))
  }

  /** A draft's shares are replaced whole: nothing points at a share, so unlike
   *  lines there is no stale answer to keep. */
  async replaceShares(
    tx: Db,
    allocationId: string,
    rows: readonly Pick<KpiShareRow, 'teamId' | 'metricKey' | 'value'>[],
  ): Promise<void> {
    await tx.delete(kpiAllocationShare).where(eq(kpiAllocationShare.allocationId, allocationId))
    if (rows.length === 0) return
    await tx.insert(kpiAllocationShare).values(rows.map((r) => ({ ...r, allocationId })))
  }

  /** The next version of a room package carries the same shares. */
  async copyShares(tx: Db, from: string, to: string): Promise<void> {
    const rows = await this.shares([from], tx)
    await this.replaceShares(tx, to, rows)
  }

  /** The name a bell prints for a team package. */
  async teamName(tx: Db, teamId: string): Promise<string | null> {
    const [row] = await tx
      .select({ name: kpiTeam.name })
      .from(kpiTeam)
      .where(eq(kpiTeam.id, teamId))
    return row?.name ?? null
  }

  /** `null` when an open counter already sits on the line (`kpi_counter_one_open_uq`). */
  async insertCounter(tx: Db, row: KpiCounterValues): Promise<string | null> {
    const [made] = await tx
      .insert(kpiCounter)
      .values(row)
      .onConflictDoNothing()
      .returning({ id: kpiCounter.id })
    return made?.id ?? null
  }

  async resolveCounter(
    tx: Db,
    id: string,
    set: Pick<KpiCounterValues, 'status' | 'resolvedBy' | 'resolvedAt' | 'counterValue'>,
  ): Promise<boolean> {
    const moved = await tx
      .update(kpiCounter)
      .set(set)
      .where(and(eq(kpiCounter.id, id), eq(kpiCounter.status, 'open')))
      .returning({ id: kpiCounter.id })
    return moved.length === 1
  }

  /** The counter, locked: two managers settling it at once queue here. */
  async lockCounter(tx: Db, id: string): Promise<KpiCounterRowDb | undefined> {
    const [row] = await tx.select().from(kpiCounter).where(eq(kpiCounter.id, id)).for('update')
    return row
  }

  openCounters(tx: Db, allocationId: string): Promise<KpiCounterRowDb[]> {
    return tx
      .select()
      .from(kpiCounter)
      .where(and(eq(kpiCounter.allocationId, allocationId), eq(kpiCounter.status, 'open')))
  }

  /** Moves the still-open counters onto the next version, whose lines must
   *  already exist: the composite FK checks the target line. */
  async repointOpenCounters(tx: Db, from: string, to: string): Promise<void> {
    await tx
      .update(kpiCounter)
      .set({ allocationId: to })
      .where(and(eq(kpiCounter.allocationId, from), eq(kpiCounter.status, 'open')))
  }
}
