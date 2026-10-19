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
} from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { Inject, Injectable } from '@nestjs/common'
import type { KpiMetricKey, RoleId } from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import {
  kpiAllocation,
  kpiAllocationLine,
  kpiCounter,
  type KpiAllocationLineRowDb,
  type KpiAllocationLineValues,
  type KpiAllocationRowDb,
  type KpiAllocationValues,
  type KpiCounterRowDb,
  type KpiCounterValues,
} from './kpi-allocation.schema'

/** A package with the names the screen prints beside its two stamps. */
export type KpiPackageRow = KpiAllocationRowDb & { submitter: string; decider: string | null }
export type KpiLineRow = KpiAllocationLineRowDb & { name: string }
/** A counter with what it is filed against: the package's role and the line. */
export type KpiCounterRow = KpiCounterRowDb & {
  role: RoleId
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
      })
      .from(kpiAllocation)
      .innerJoin(submitter, eq(submitter.id, kpiAllocation.submittedBy))
      .leftJoin(decider, eq(decider.id, kpiAllocation.decidedBy))
      .where(eq(kpiAllocation.period, period))
      .orderBy(asc(kpiAllocation.version))
  }

  /** The live package of (period, role), locked until the transaction ends. */
  async lockLive(tx: Db, period: string, role: RoleId): Promise<KpiAllocationRowDb | undefined> {
    const [row] = await tx
      .select()
      .from(kpiAllocation)
      .where(
        and(
          eq(kpiAllocation.period, period),
          eq(kpiAllocation.role, role),
          ne(kpiAllocation.status, 'superseded'),
        ),
      )
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
        name: actor.name,
      })
      .from(kpiAllocationLine)
      .innerJoin(actor, eq(actor.id, kpiAllocationLine.actorId))
      .where(inArray(kpiAllocationLine.allocationId, [...allocationIds]))
      .orderBy(asc(actor.name), asc(kpiAllocationLine.metricKey))
  }

  /** Per role, the highest version that was ever agreed: `agreed`, or
   *  `superseded` after it — a decision with no return reason is an agreement
   *  (`kpi_allocation_reason_only_when_returned`). The ONE reading of "the
   *  package in force", for the scorecard and the holder's allocation view. */
  lastAgreed(period: string): Promise<KpiAllocationRowDb[]> {
    return this.db
      .selectDistinctOn([kpiAllocation.role])
      .from(kpiAllocation)
      .where(
        and(
          eq(kpiAllocation.period, period),
          isNotNull(kpiAllocation.decidedAt),
          isNull(kpiAllocation.returnReason),
        ),
      )
      .orderBy(kpiAllocation.role, desc(kpiAllocation.version))
  }

  /** The lines of `lastAgreed` — the scorecard's input. */
  async agreedLines(period: string, actorId?: string): Promise<KpiAgreedLine[]> {
    const top = await this.lastAgreed(period)
    if (top.length === 0) return []
    const byId = new Map(top.map((p) => [p.id, p]))
    const rows = await this.db
      .select()
      .from(kpiAllocationLine)
      .where(
        and(
          inArray(kpiAllocationLine.allocationId, [...byId.keys()]),
          actorId ? eq(kpiAllocationLine.actorId, actorId) : undefined,
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
        name: actor.name,
        assigned: kpiAllocationLine.value,
      })
      .from(kpiCounter)
      .innerJoin(kpiAllocation, eq(kpiAllocation.id, kpiCounter.allocationId))
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

  async nextVersion(tx: Db, period: string, role: RoleId): Promise<number> {
    const [row] = await tx
      .select({ top: max(kpiAllocation.version) })
      .from(kpiAllocation)
      .where(and(eq(kpiAllocation.period, period), eq(kpiAllocation.role, role)))
    return (row?.top ?? 0) + 1
  }

  /** `null` when another live package or the same version landed first —
   *  `kpi_allocation_one_live_uq` and `kpi_allocation_version_uq` answer it. */
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
    await tx.insert(kpiAllocationLine).values(rows)
  }

  /** Lines of package `pkg` only while it still has `pkg.status`; answers
   *  how many moved, so a line that is not there, or a moved package, shows. */
  async setLines(
    tx: Db,
    pkg: Lock,
    keys: readonly Omit<LineKey, 'allocationId'>[],
    set: Partial<Pick<KpiAllocationLineValues, 'ackStatus' | 'ackedAt' | 'value'>>,
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
