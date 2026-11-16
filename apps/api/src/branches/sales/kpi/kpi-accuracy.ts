import { and, asc, eq, inArray } from 'drizzle-orm'
import type { KpiForecastAccuracy, KpiPeriodKey } from '@pv/contracts'
import { toContractRole } from '@api/platform/auth/auth.mapper'
import type { Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import { membersUnder, type OrgTreeRows } from '@api/platform/org/org-heads'
import { kpiMonthClose, kpiMonthValue } from './kpi-close.schema'
import { kpiForecastCommit, kpiUnitCommit } from './kpi-forecast-commit.schema'

/** Forecast accuracy and the company's committed figure (ADR 0158 §2, §1 defaults).
 *
 *  Plain functions over a `Db` handle, not a provider: any KPI service can import
 *  them without a module line. `actual` is only ever the month's frozen card
 *  figure (ADR 0100), so a month not yet closed answers `null` and never a live
 *  reading. Nothing here is a score: it is read, shown and never fed back. */

type Week = { weekStart: string; amount: number }

/** A week with no actual: right only if nothing was promised. */
export function weekAccuracy(commit: number, actual: number): number {
  if (actual === 0) return commit === 0 ? 1 : 0
  return Math.min(1, Math.max(0, 1 - Math.abs(commit - actual) / actual))
}

export function accuracyOf(weeks: readonly Week[], actual: number | null): KpiForecastAccuracy {
  const last = [...weeks].sort((a, b) => a.weekStart.localeCompare(b.weekStart)).at(-1)
  const mean =
    actual === null || weeks.length === 0
      ? null
      : weeks.reduce((s, w) => s + weekAccuracy(w.amount, actual), 0) / weeks.length
  return { accuracy: mean, weeks: weeks.length, committed: last?.amount ?? null, actual }
}

/** A month is closed when its close row exists (the test the score reader uses). */
async function isFrozen(period: KpiPeriodKey, handle: Db): Promise<boolean> {
  const [row] = await handle
    .select({ period: kpiMonthClose.period })
    .from(kpiMonthClose)
    .where(eq(kpiMonthClose.period, period))
  return row !== undefined
}

/** The figure the person's card froze at close (`kpi_month_value`, append-only), so
 *  accuracy is judged against the number they saw. One own-seat row per person: the first
 *  of their roles that holds one, the pick `KpiScoreReader` makes, never a sum over roles. */
async function frozenSigned(
  period: KpiPeriodKey,
  actorIds: readonly string[],
  handle: Db,
): Promise<Map<string, number>> {
  if (actorIds.length === 0) return new Map()
  const [rows, owners] = await Promise.all([
    handle
      .select({
        actorId: kpiMonthValue.actorId,
        role: kpiMonthValue.role,
        value: kpiMonthValue.value,
      })
      .from(kpiMonthValue)
      .where(
        and(
          eq(kpiMonthValue.period, period),
          eq(kpiMonthValue.metricKey, 'signed-value'),
          inArray(kpiMonthValue.actorId, [...actorIds]),
        ),
      ),
    handle
      .select({ id: actor.id, roleIds: actor.roleIds })
      .from(actor)
      .where(inArray(actor.id, [...actorIds])),
  ])
  const order = new Map(owners.map((o) => [o.id, o.roleIds.map(toContractRole)]))
  const first = new Map<string, { rank: number; value: number }>()
  for (const r of rows) {
    if (!r.actorId) continue
    /* A role the person no longer holds ranks last but still counts. */
    const at = order.get(r.actorId)?.indexOf(r.role) ?? -1
    const rank = at >= 0 ? at : Number.MAX_SAFE_INTEGER
    const kept = first.get(r.actorId)
    if (!kept || rank < kept.rank) first.set(r.actorId, { rank, value: Number(r.value ?? 0) })
  }
  return new Map([...first].map(([id, f]) => [id, f.value]))
}

export async function personAccuracy(
  period: KpiPeriodKey,
  actorIds: readonly string[],
  handle: Db,
): Promise<Map<string, KpiForecastAccuracy>> {
  if (actorIds.length === 0) return new Map()
  const [frozen, rows] = await Promise.all([
    isFrozen(period, handle),
    handle
      .select()
      .from(kpiForecastCommit)
      .where(
        and(
          eq(kpiForecastCommit.period, period),
          inArray(kpiForecastCommit.actorId, [...actorIds]),
        ),
      ),
  ])
  const actual = frozen ? await frozenSigned(period, actorIds, handle) : null
  return new Map(
    actorIds.map((id) => [
      id,
      accuracyOf(
        rows
          .filter((r) => r.actorId === id)
          .map((r) => ({ weekStart: r.weekStart, amount: r.amount })),
        actual ? (actual.get(id) ?? 0) : null,
      ),
    ]),
  )
}

/** A unit's actual is the sum over everyone placed under it in the month's tree. */
export async function unitAccuracy(
  period: KpiPeriodKey,
  unitIds: readonly string[],
  tree: OrgTreeRows,
  handle: Db,
): Promise<Map<string, KpiForecastAccuracy>> {
  if (unitIds.length === 0) return new Map()
  const [frozen, rows] = await Promise.all([
    isFrozen(period, handle),
    handle
      .select()
      .from(kpiUnitCommit)
      .where(and(eq(kpiUnitCommit.period, period), inArray(kpiUnitCommit.unitId, [...unitIds]))),
  ])
  const people = [...new Set(unitIds.flatMap((u) => membersUnder(tree, u)))]
  const actual = frozen ? await frozenSigned(period, people, handle) : null
  return new Map(
    unitIds.map((id) => {
      const sum = actual && membersUnder(tree, id).reduce((s, p) => s + (actual.get(p) ?? 0), 0)
      const weeks = rows.filter((r) => r.unitId === id)
      return [
        id,
        accuracyOf(
          weeks.map((r) => ({ weekStart: r.weekStart, amount: r.amount })),
          sum,
        ),
      ]
    }),
  )
}

/** One unit's figure: its own commit, else what sits below it. Null propagates, so a
 *  level with nothing committed anywhere under it contributes nothing. */
function levelOf(
  unitId: string,
  tree: OrgTreeRows,
  units: ReadonlyMap<string, number>,
  people: ReadonlyMap<string, number>,
): number | null {
  const own = units.get(unitId)
  if (own !== undefined) return own
  const parts = [
    ...tree.members.filter((m) => m.unitId === unitId).map((m) => people.get(m.actorId) ?? null),
    ...tree.nodes
      .filter((n) => n.parentId === unitId)
      .map((n) => levelOf(n.unitId, tree, units, people)),
  ].filter((v): v is number => v !== null)
  return parts.length === 0 ? null : parts.reduce((s, v) => s + v, 0)
}

/** Per department, the highest level that committed that week; people placed
 *  straight on the company node belong to no department and are left out. */
export async function companyCommitted(
  period: KpiPeriodKey,
  week: string,
  tree: OrgTreeRows,
  handle: Db,
): Promise<number | null> {
  const [units, people] = await Promise.all([
    handle.select().from(kpiUnitCommit).where(eq(kpiUnitCommit.weekStart, week)),
    handle
      .select()
      .from(kpiForecastCommit)
      .where(and(eq(kpiForecastCommit.weekStart, week), eq(kpiForecastCommit.period, period)))
      .orderBy(asc(kpiForecastCommit.actorId)),
  ])
  const unitMap = new Map(units.map((u) => [u.unitId, u.amount]))
  const personMap = new Map(people.map((p) => [p.actorId, p.amount]))
  const figures = tree.nodes
    .filter((n) => n.kind === 'department')
    .map((n) => levelOf(n.unitId, tree, unitMap, personMap))
    .filter((v): v is number => v !== null)
  return figures.length === 0 ? null : figures.reduce((s, v) => s + v, 0)
}
