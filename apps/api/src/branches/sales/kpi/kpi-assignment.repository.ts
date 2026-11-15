import { and, asc, eq, gte, inArray, isNull, max, sql } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type { KpiAssignmentContact, RoleId } from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import { kpiTransfer } from './kpi-transfer.schema'
import type { KpiTransferView } from './kpi-transfer'
import {
  kpiAssignment,
  kpiAssignmentLine,
  type KpiAssignmentLineValues,
  type KpiAssignmentRowDb,
  type KpiAssignmentValues,
} from './kpi-assignment.schema'

/** A set with its sender's name; `null` on a draft or a sweep-written set. */
export type KpiSetRow = KpiAssignmentRowDb & { sender: string | null }
export type KpiSetLineRow = typeof kpiAssignmentLine.$inferSelect

type SetMove = Partial<Pick<KpiAssignmentValues, 'status' | 'sentBy' | 'sentAt' | 'byDefault'>>

/** SQL of the tiered sets (ADR 0120). Decides nothing: which set is in force,
 *  who may write it, what a line may hold — all the service's and the mapper's.
 *
 *  Writers take `tx` from outside. Every assignment write runs under the KPI
 *  roster's lock (`KpiTeamRepository.lockRoster`), the one tree edits take, so
 *  a send and a tree edit cannot cross (the floor counts sent sets) and two
 *  writers of one month queue; each move still repeats the status it expects. */
@Injectable()
export class KpiAssignmentRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  run<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(tx))
  }

  /** Every set of one month, every version, oldest first — a few dozen rows. */
  sets(period: string, handle: Db = this.db): Promise<KpiSetRow[]> {
    return handle
      .select({
        id: kpiAssignment.id,
        period: kpiAssignment.period,
        role: kpiAssignment.role,
        unitId: kpiAssignment.unitId,
        version: kpiAssignment.version,
        status: kpiAssignment.status,
        byDefault: kpiAssignment.byDefault,
        sentBy: kpiAssignment.sentBy,
        sentAt: kpiAssignment.sentAt,
        createdBy: kpiAssignment.createdBy,
        createdAt: kpiAssignment.createdAt,
        sender: actor.name,
      })
      .from(kpiAssignment)
      .leftJoin(actor, eq(actor.id, kpiAssignment.sentBy))
      .where(eq(kpiAssignment.period, period))
      .orderBy(asc(kpiAssignment.version))
  }

  lines(setIds: readonly string[], handle: Db = this.db): Promise<KpiSetLineRow[]> {
    if (setIds.length === 0) return Promise.resolve([])
    return handle
      .select()
      .from(kpiAssignmentLine)
      .where(inArray(kpiAssignmentLine.assignmentId, [...setIds]))
  }

  /** One month's leaver transfers (ADR 0156): a few rows at most. */
  transfers(period: string, handle: Db = this.db): Promise<KpiTransferView[]> {
    return handle
      .select({
        period: kpiTransfer.period,
        fromActorId: kpiTransfer.fromActorId,
        toActorId: kpiTransfer.toActorId,
        fromDay: kpiTransfer.fromDay,
      })
      .from(kpiTransfer)
      .where(eq(kpiTransfer.period, period))
  }

  /** Start days of the people a page lists; the tree read carries none. */
  async startedOnOf(
    ids: readonly string[],
    handle: Db = this.db,
  ): Promise<Map<string, string | null>> {
    if (ids.length === 0) return new Map()
    const rows = await handle
      .select({ id: actor.id, startedOn: actor.startedOn })
      .from(actor)
      .where(inArray(actor.id, [...ids]))
    return new Map(rows.map((r) => [r.id, r.startedOn]))
  }

  /** Apart from `sets` and the tree on purpose: of the KPI doors, only a person's own
   *  lines carry an email. */
  async contactOf(actorId: string): Promise<KpiAssignmentContact | null> {
    const [row] = await this.db
      .select({ name: actor.name, email: actor.email })
      .from(actor)
      .where(and(eq(actor.id, actorId), isNull(actor.disabledAt)))
    return row ?? null
  }

  async nextVersion(tx: Db, period: string, role: RoleId, unitId: string): Promise<number> {
    const [row] = await tx
      .select({ top: max(kpiAssignment.version) })
      .from(kpiAssignment)
      .where(
        and(
          eq(kpiAssignment.period, period),
          eq(kpiAssignment.role, role),
          eq(kpiAssignment.unitId, unitId),
        ),
      )
    return (row?.top ?? 0) + 1
  }

  /** `null` when a live set or the same version landed first — the two UNIQUEs answer it. */
  async insertSet(tx: Db, row: KpiAssignmentValues): Promise<string | null> {
    const [made] = await tx
      .insert(kpiAssignment)
      .values(row)
      .onConflictDoNothing()
      .returning({ id: kpiAssignment.id })
    return made?.id ?? null
  }

  async moveSet(tx: Db, from: Pick<KpiSetRow, 'id' | 'status'>, set: SetMove): Promise<boolean> {
    const moved = await tx
      .update(kpiAssignment)
      .set(set)
      .where(and(eq(kpiAssignment.id, from.id), eq(kpiAssignment.status, from.status)))
      .returning({ id: kpiAssignment.id })
    return moved.length === 1
  }

  /** A draft's lines are replaced whole, and a send writes its full set in place. */
  async replaceLines(
    tx: Db,
    setId: string,
    rows: readonly Omit<KpiAssignmentLineValues, 'assignmentId'>[],
  ): Promise<void> {
    await tx.delete(kpiAssignmentLine).where(eq(kpiAssignmentLine.assignmentId, setId))
    if (rows.length > 0) {
      await tx.insert(kpiAssignmentLine).values(rows.map((r) => ({ ...r, assignmentId: setId })))
    }
  }

  /** The holder's unanswered lines in `setIds` still open to answer; the count stamped.
   *  Every line is open until the level's day (`normal`); after it, only a late
   *  line within its own five days (`lateSince`, `lateLineSince`'s answer). */
  async confirm(
    tx: Db,
    setIds: readonly string[],
    personId: string,
    open: { at: Date; normal: boolean; lateSince: Date },
  ): Promise<number> {
    const reach = open.normal ? undefined : gte(kpiAssignmentLine.addedAt, open.lateSince)
    const done = await tx
      .update(kpiAssignmentLine)
      .set({ confirmedAt: open.at })
      .where(
        and(
          inArray(kpiAssignmentLine.assignmentId, [...setIds]),
          eq(kpiAssignmentLine.personId, personId),
          eq(kpiAssignmentLine.kind, 'person'),
          isNull(kpiAssignmentLine.confirmedAt),
          reach,
        ),
      )
      .returning({ id: sql`1` })
    return done.length
  }

  /** Late lines go into the set in force as they are: no replace, no version. */
  async addLines(
    tx: Db,
    setId: string,
    personId: string,
    lines: readonly { metricKey: KpiAssignmentLineValues['metricKey']; value: number }[],
    at: Date,
  ): Promise<void> {
    await tx.insert(kpiAssignmentLine).values(
      lines.map((l) => ({
        assignmentId: setId,
        metricKey: l.metricKey,
        kind: 'person' as const,
        personId,
        value: String(l.value),
        addedAt: at,
      })),
    )
  }
}
