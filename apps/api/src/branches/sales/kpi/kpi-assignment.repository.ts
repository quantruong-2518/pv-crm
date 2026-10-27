import { and, asc, eq, inArray, isNull, max, sql } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type { RoleId } from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
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

  /** The holder's unanswered lines in `setIds`; the count stamped. */
  async confirm(tx: Db, setIds: readonly string[], personId: string, at: Date): Promise<number> {
    const done = await tx
      .update(kpiAssignmentLine)
      .set({ confirmedAt: at })
      .where(
        and(
          inArray(kpiAssignmentLine.assignmentId, [...setIds]),
          eq(kpiAssignmentLine.personId, personId),
          eq(kpiAssignmentLine.kind, 'person'),
          isNull(kpiAssignmentLine.confirmedAt),
        ),
      )
      .returning({ id: sql`1` })
    return done.length
  }
}
