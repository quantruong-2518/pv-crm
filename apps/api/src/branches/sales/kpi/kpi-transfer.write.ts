import { and, eq, gt, gte, isNull, notInArray, sql } from 'drizzle-orm'
import type { Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import { kpiAssignment, kpiAssignmentLine } from './kpi-assignment.schema'
import { kpiMonthClose } from './kpi-close.schema'
import { RAMP_FROM } from './kpi-transfer'
import { kpiTransfer } from './kpi-transfer.schema'

/** The lock's KPI half (ADR 0156 §6), in the lock's own transaction: one row
 *  for the lock month, and one per later month that already sent the leaver a
 *  line, from that month's first day so it moves whole. Months before
 *  `RAMP_FROM` write nothing. A receiver who is locked or gone reads as none. */
export async function recordLeave(
  tx: Db,
  move: { fromId: string; toId: string | null; day: string },
): Promise<void> {
  const month = move.day.slice(0, 7)
  const [to] = move.toId
    ? await tx
        .select({ id: actor.id })
        .from(actor)
        .where(and(eq(actor.id, move.toId), isNull(actor.disabledAt)))
    : []
  const later = await tx
    .selectDistinct({ period: kpiAssignment.period })
    .from(kpiAssignment)
    .innerJoin(kpiAssignmentLine, eq(kpiAssignmentLine.assignmentId, kpiAssignment.id))
    .where(
      and(
        eq(kpiAssignment.status, 'sent'),
        eq(kpiAssignmentLine.personId, move.fromId),
        gt(kpiAssignment.period, month),
        gte(kpiAssignment.period, RAMP_FROM),
      ),
    )
  const rows = [
    ...(month >= RAMP_FROM ? [{ period: month, fromDay: move.day }] : []),
    ...later.map((r) => ({ period: r.period, fromDay: `${r.period}-01` })),
  ].map((r) => ({ ...r, fromActorId: move.fromId, toActorId: to?.id ?? null }))
  if (rows.length === 0) return
  /* A re-lock with a receiver fills a row an earlier lock left empty; the first day stays. */
  await tx
    .insert(kpiTransfer)
    .values(rows)
    .onConflictDoUpdate({
      target: [kpiTransfer.period, kpiTransfer.fromActorId],
      set: { toActorId: sql`coalesce(${kpiTransfer.toActorId}, excluded.to_actor_id)` },
    })
}

/** The unlock's half: the person is back, so the months still open are theirs
 *  again. A closed month keeps its row, since its frozen readings already used it. */
export async function dropOpenLeaves(tx: Db, fromId: string): Promise<void> {
  const closed = (await tx.select({ period: kpiMonthClose.period }).from(kpiMonthClose)).map(
    (r) => r.period,
  )
  await tx
    .delete(kpiTransfer)
    .where(
      and(
        eq(kpiTransfer.fromActorId, fromId),
        closed.length > 0 ? notInArray(kpiTransfer.period, closed) : undefined,
      ),
    )
}
