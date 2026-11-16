import type { Db } from '@api/platform/db/db.module'
import { kpiAbsence } from '@api/branches/sales/kpi/kpi-absence.schema'
import {
  kpiAllocation,
  kpiAllocationLine,
  kpiAllocationShare,
  kpiCounter,
} from '@api/branches/sales/kpi/kpi-allocation.schema'
import { kpiAssignment, kpiAssignmentLine } from '@api/branches/sales/kpi/kpi-assignment.schema'
import { catalogOf } from '@api/branches/sales/kpi/kpi-config.overlay'
import { kpiMarketingBudget, kpiRoleMetric } from '@api/branches/sales/kpi/kpi-config.schema'
import { kpiAcknowledgement, kpiTarget } from '@api/branches/sales/kpi/kpi.schema'
import { budgetRows, buildSets, readTree, TIERED, type SetBundle } from './emit-kpi-december'
import { buildPackages, type Bundle } from './emit-kpi-packages'
import { absenceRows, ackRows, PERIODS, targetRows } from './emit-kpi-targets'
import { writeTeams } from './emit-kpi-teams'
import type { AfterWrite, Ctx } from './types'

/** Targets, acknowledgements, absences, teams, November packages, December sets, budgets.
 *
 *  Nothing goes in the plan: `reset-data` keeps the teams and the org tree and the
 *  packages point at both, so every row is written after the plan, in the same
 *  transaction, with `ON CONFLICT DO NOTHING`. Ids come from the stream whether or not
 *  the row exists, so a second run finds its own rows and adds nothing. Figures: `emit-kpi-figures.ts`. */

export function emitKpi(_ctx: Ctx): void {}

/** A package and what hangs on it go in only when the package row itself is new. */
async function writeBundle(tx: Db, b: Bundle): Promise<void> {
  const got = await tx
    .insert(kpiAllocation)
    .values(b.alloc)
    .onConflictDoNothing()
    .returning({ id: kpiAllocation.id })
  if (got.length === 0) return
  if (b.shares.length > 0) await tx.insert(kpiAllocationShare).values(b.shares)
  if (b.lines.length > 0) await tx.insert(kpiAllocationLine).values(b.lines)
  if (b.counters.length > 0) await tx.insert(kpiCounter).values(b.counters)
}

async function writeSet(tx: Db, b: SetBundle): Promise<void> {
  const got = await tx
    .insert(kpiAssignment)
    .values(b.set)
    .onConflictDoNothing()
    .returning({ id: kpiAssignment.id })
  if (got.length === 0) return
  const lines = b.lines.map((l) => ({ ...l, assignmentId: b.set.id! }))
  if (lines.length > 0) await tx.insert(kpiAssignmentLine).values(lines)
}

export const afterWrite: AfterWrite = async (tx, ctx) => {
  const people = [...ctx.world.actors.values()]
  const overrides = await tx.select().from(kpiRoleMetric)
  const catalogs = new Map(
    [...PERIODS, TIERED].map((p) => [p, catalogOf(p, overrides).catalog] as const),
  )
  await tx.insert(kpiTarget).values(targetRows(catalogs, people)).onConflictDoNothing()
  await tx.insert(kpiAcknowledgement).values(ackRows(catalogs, people)).onConflictDoNothing()
  await tx.insert(kpiAbsence).values(absenceRows(ctx.rng)).onConflictDoNothing()

  const teams = await writeTeams(tx, ctx.rng)
  const nov = catalogs.get('2026-11')!
  const { bundles, acks } = buildPackages({ catalog: nov, people, teams, rng: ctx.rng })
  for (const b of bundles) await writeBundle(tx, b)
  if (acks.length > 0) await tx.insert(kpiAcknowledgement).values(acks).onConflictDoNothing()

  const tree = await readTree(tx, TIERED)
  if (!tree) return
  for (const b of buildSets(tree, catalogs.get(TIERED)!, ctx.rng)) await writeSet(tx, b)
  const budgets = budgetRows(tree)
  if (budgets.length > 0) await tx.insert(kpiMarketingBudget).values(budgets).onConflictDoNothing()
}
