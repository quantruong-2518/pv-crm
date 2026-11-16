import {
  KPI_CATALOG,
  KPI_V2_FROM,
  RoleId,
  catalogFor,
  defaultOffFor,
  isKpiV2Period,
  type KpiMetricDef,
  type KpiMetricKey,
  type KpiPeriodKey,
  type KpiRoleMetric,
  type KpiRoleMetricsPatch,
} from '@pv/contracts'
import type {
  KpiFunnelTargetValues,
  KpiRoleMetricRowDb,
  KpiRoleMetricValues,
} from './kpi-config.schema'

/** A month's catalog (`catalogFor`) with that month's `kpi_role_metric` set
 *  applied (ADR 0099 §1, ADR 0160 §2) — pure, and the ONLY server file that
 *  reads the code catalog. Every reader takes `KpiCatalog` from
 *  `KpiConfigService.effectiveCatalog(period)` instead, so a switched-off
 *  metric leaves every card, forecast and target door at once. */

/** `weight` is the whole percent the line weighs (ADR 0160 §6), set on every
 *  def of a v2 month and never on a v1 one, which keeps ADR 0158's split. */
export type KpiCatalogDef = KpiMetricDef & { weight?: number }

/** Per role, the metrics in force, in code order, `primary` resolved. */
export type KpiCatalog = Readonly<Record<RoleId, readonly KpiCatalogDef[]>>

type Override = Pick<
  KpiRoleMetricRowDb,
  'role' | 'fromPeriod' | 'metricKey' | 'enabled' | 'isPrimary' | 'weight'
>
type Resolved = { def: KpiMetricDef; enabled: boolean; weight: number | null; repaired: boolean }

/** A request dated with the month it applies from. */
export type DatedPatch = KpiRoleMetricsPatch & { from: KpiPeriodKey }

const perRole = <T>(make: (role: RoleId) => T): Record<RoleId, T> =>
  Object.fromEntries(RoleId.options.map((role) => [role, make(role)])) as Record<RoleId, T>

/** The set `period` reads for `role`: the latest `from_period` at or before it.
 *  The floor keeps a v1 set (the '2000-01' rows included) out of every v2 month. */
export function setFromOf(
  period: KpiPeriodKey,
  role: RoleId,
  rows: readonly Pick<Override, 'role' | 'fromPeriod'>[],
): KpiPeriodKey | null {
  const floor = isKpiV2Period(period) ? KPI_V2_FROM : ''
  let best: KpiPeriodKey | null = null
  for (const r of rows) {
    if (r.role !== role || r.fromPeriod > period || r.fromPeriod < floor) continue
    if (best === null || r.fromPeriod > best) best = r.fromPeriod
  }
  return best
}

/** ADR 0160 §6 default: primary 50 %, the rest share 50 % equally, the first
 *  ones taking the remainder so whole percents sum to exactly 100. */
export function defaultWeights(
  metrics: readonly { key: KpiMetricKey; primary: boolean }[],
): Map<KpiMetricKey, number> {
  const others = metrics.filter((m) => !m.primary)
  const n = others.length
  const out = new Map<KpiMetricKey, number>()
  for (const m of metrics) if (m.primary) out.set(m.key, n === 0 ? 100 : 50)
  others.forEach((m, i) => out.set(m.key, Math.floor(50 / n) + (i < 50 % n ? 1 : 0)))
  return out
}

/** An absent row is the code default (on unless `defaultOffFor`). A row whose
 *  key the month's catalog lacks is ignored; a set whose primary it lacks keeps
 *  the code primary, switched on, and is marked `repaired`. */
function resolve(period: KpiPeriodKey, rows: readonly Override[]): Record<RoleId, Resolved[]> {
  return perRole((role) => {
    const from = setFromOf(period, role, rows)
    const set = rows.filter((r) => r.role === role && r.fromPeriod === from)
    const byKey = new Map(set.map((r) => [r.metricKey, r]))
    const defs = catalogFor(period)[role]
    const off = defaultOffFor(period, role)
    const stored = defs.some((d) => byKey.get(d.key)?.isPrimary)
    const repaired = !stored && set.some((r) => r.isPrimary)
    return defs.map((def) => {
      const row = byKey.get(def.key)
      const enabled = row ? row.enabled : !off.has(def.key)
      const weight = row?.weight ?? null
      if (stored) {
        return { def: { ...def, primary: row?.isPrimary ?? false }, enabled, weight, repaired }
      }
      return { def, enabled: enabled || def.primary, weight, repaired }
    })
  })
}

/** Every code metric of every role, switched-off ones included — the config
 *  screen's read. `weight` is the stored one; null reads as the default split. */
export function resolvedMetrics(
  period: KpiPeriodKey,
  rows: readonly Override[],
): Record<RoleId, KpiRoleMetric[]> {
  const all = resolve(period, rows)
  return perRole((role) =>
    all[role].map(({ def: { key, ...def }, enabled, weight }) => ({
      ...def,
      metricKey: key,
      enabled,
      inCatalog: true as const,
      weight,
    })),
  )
}

/** Stored weights stand only when every live line has one and they sum to 100;
 *  a set the catalog has moved away from falls back to the default split. */
function weighed(live: readonly KpiMetricDef[], stored: readonly (number | null)[]) {
  const sum = stored.reduce<number>((s, w) => s + (w ?? 0), 0)
  const split = stored.every((w) => w !== null) && sum === 100 ? null : defaultWeights(live)
  return live.map((d, i) => ({ ...d, weight: split?.get(d.key) ?? stored[i] ?? 0 }))
}

/** A role left with no primary or two (a hand edit) falls back to the code
 *  catalog whole, and says so in `faults` for the caller to log: KPI screens
 *  keep running, and the config door (`resolvedMetrics`) still shows the stored
 *  rows to put right. A v2 month's every def carries a weight, on every path. */
export function catalogOf(
  period: KpiPeriodKey,
  rows: readonly Override[],
): { catalog: KpiCatalog; faults: string[] } {
  const all = resolve(period, rows)
  const faults: string[] = []
  const catalog = perRole((role): readonly KpiCatalogDef[] => {
    const kept = all[role].filter((m) => m.enabled)
    if (all[role].some((m) => m.repaired)) {
      faults.push(`role ${role} names a primary outside the ${period} catalog; using its default`)
    }
    let live = kept.map((m) => m.def)
    let stored = kept.map((m) => (m.repaired ? null : m.weight))
    const primaries = live.filter((d) => d.primary).length
    if (primaries !== 1) {
      faults.push(`role ${role} resolves to ${primaries} primary metrics; using the code catalog`)
      const off = defaultOffFor(period, role)
      live = catalogFor(period)[role].filter((d) => !off.has(d.key))
      stored = live.map(() => null)
    }
    return isKpiV2Period(period) ? weighed(live, stored) : live
  })
  return { catalog, faults }
}

/** A metric's code traits in `period`'s catalog, switched-off ones included: an
 *  old package line of a metric turned off since still needs its unit and scope. */
export const catalogDef = (
  period: KpiPeriodKey,
  role: RoleId,
  key: KpiMetricKey,
): KpiMetricDef | undefined => catalogFor(period)[role].find((d) => d.key === key)

/** A (role, key) pair in whichever catalog version carries it, for readers with
 *  no month at hand: unit, scope and direction never differ between versions,
 *  only `primary` does, which such a reader must not read. */
export const codeDef = (role: RoleId, key: KpiMetricKey): KpiMetricDef | undefined =>
  catalogDef(KPI_V2_FROM, role, key) ?? KPI_CATALOG[role].find((d) => d.key === key)

/** A v2 request sent without weights gets the default split over its own
 *  enabled metrics and its own primary (ADR 0160 §6); a v1 one stays unweighted. */
export function withDefaultWeights(patch: DatedPatch): DatedPatch {
  if (!isKpiV2Period(patch.from) || patch.metrics.some((m) => m.weight !== undefined)) return patch
  const on = patch.metrics.filter((m) => m.enabled)
  const split = defaultWeights(on.map((m) => ({ key: m.metricKey, primary: m.primary })))
  return {
    ...patch,
    metrics: patch.metrics.map((m) => ({ ...m, weight: split.get(m.metricKey) })),
  }
}

/** Every metric of the request becomes a row, default or not: a set is found
 *  by its rows, so an all-default set must still leave them, or its months
 *  would read the set before it. */
export function overlayRows(patch: DatedPatch, by: string): KpiRoleMetricValues[] {
  return patch.metrics.map((m) => ({
    role: patch.role,
    fromPeriod: patch.from,
    metricKey: m.metricKey,
    enabled: m.enabled,
    isPrimary: m.primary,
    weight: m.weight ?? null,
    updatedBy: by,
  }))
}

export const funnelRows = (patch: DatedPatch, by: string): KpiFunnelTargetValues[] =>
  (patch.funnel ?? []).map((f) => ({
    role: patch.role,
    fromPeriod: patch.from,
    stepKey: f.step,
    ratioBp: f.targetBp,
    updatedBy: by,
  }))
