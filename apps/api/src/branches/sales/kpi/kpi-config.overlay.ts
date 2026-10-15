import {
  KPI_CATALOG,
  RoleId,
  type KpiMetricDef,
  type KpiMetricKey,
  type KpiRoleMetric,
  type KpiRoleMetricsPatch,
} from '@pv/contracts'
import type { KpiRoleMetricRowDb, KpiRoleMetricValues } from './kpi-config.schema'

/** `KPI_CATALOG` with the `kpi_role_metric` overlay applied (ADR 0099 §1) —
 *  pure, and the ONLY server file that reads the code catalog. Every reader
 *  takes `KpiCatalog` from `KpiConfigService.effectiveCatalog()` instead, so a
 *  switched-off metric leaves every card, forecast and target door at once. */

/** Per role, the metrics in force, in code order, `primary` resolved. */
export type KpiCatalog = Readonly<Record<RoleId, readonly KpiMetricDef[]>>

type Override = Pick<KpiRoleMetricRowDb, 'role' | 'metricKey' | 'enabled' | 'isPrimary'>
type Resolved = { def: KpiMetricDef; enabled: boolean }

const perRole = <T>(make: (role: RoleId) => T): Record<RoleId, T> =>
  Object.fromEntries(RoleId.options.map((role) => [role, make(role)])) as Record<RoleId, T>

/** An absent row is the code default: on, and primary only where code says
 *  so — unless a stored row already names the primary, which then wins, so a
 *  deploy that moves the code's primary cannot add a second one. */
function resolve(rows: readonly Override[]): Record<RoleId, Resolved[]> {
  const byKey = new Map(rows.map((r) => [`${r.role}|${r.metricKey}`, r]))
  return perRole((role) => {
    const stored = KPI_CATALOG[role].some((d) => byKey.get(`${role}|${d.key}`)?.isPrimary)
    return KPI_CATALOG[role].map((def) => {
      const row = byKey.get(`${role}|${def.key}`)
      if (row) return { def: { ...def, primary: row.isPrimary }, enabled: row.enabled }
      return { def: stored ? { ...def, primary: false } : def, enabled: true }
    })
  })
}

/** Every code metric of every role, switched-off ones included — the config screen's read. */
export function resolvedMetrics(rows: readonly Override[]): Record<RoleId, KpiRoleMetric[]> {
  const all = resolve(rows)
  return perRole((role) =>
    all[role].map(({ def: { key, ...def }, enabled }) => ({
      ...def,
      metricKey: key,
      enabled,
      inCatalog: true as const,
    })),
  )
}

/** A role left with no primary or two (a hand edit, or a catalog change since
 *  the last `PUT`) falls back to the code catalog whole, and says so in
 *  `faults` for the caller to log: KPI screens keep running, and the config
 *  door (`resolvedMetrics`) still shows the stored rows to put right. */
export function catalogOf(rows: readonly Override[]): { catalog: KpiCatalog; faults: string[] } {
  const all = resolve(rows)
  const faults: string[] = []
  const catalog = perRole((role) => {
    const live = all[role].filter((m) => m.enabled).map((m) => m.def)
    const primaries = live.filter((d) => d.primary).length
    if (primaries === 1) return live
    faults.push(`role ${role} resolves to ${primaries} primary metrics; using the code catalog`)
    return KPI_CATALOG[role]
  })
  return { catalog, faults }
}

/** A metric's code traits, switched-off ones included: an old package line of
 *  a metric turned off since still needs its unit and scope to be summed. */
export const catalogDef = (role: RoleId, key: KpiMetricKey): KpiMetricDef | undefined =>
  KPI_CATALOG[role].find((d) => d.key === key)

/** The rows a `PUT` leaves: only metrics that differ from the code default.
 *  Promoting B over the default primary A therefore always writes A's row too
 *  (`is_primary = false`) — the partial unique index only sees stored rows. */
export function overlayRows(patch: KpiRoleMetricsPatch, by: string): KpiRoleMetricValues[] {
  return patch.metrics.flatMap((m) => {
    const def = catalogDef(patch.role, m.metricKey)
    if (!def || (m.enabled && m.primary === def.primary)) return []
    const row = { role: patch.role, metricKey: m.metricKey, enabled: m.enabled }
    return [{ ...row, isPrimary: m.primary, updatedBy: by }]
  })
}
