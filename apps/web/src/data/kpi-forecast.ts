import { queryOptions } from '@tanstack/react-query'
import {
  KpiForecastResponse,
  type KpiForecast,
  type KpiMetricDef,
  type RoleId,
} from '@pv/contracts'
import { api } from '@/app/api'
import { cacheTier } from '@/app/query-client'
import { defOf, type KpiCatalog } from './kpi-catalog'

/** `GET /sales/kpi/:period/forecast` — everyone's end-of-month forecast and the
 *  two warning thresholds (ADR 0098 §6). Live, no `load:`.
 *
 *  The key sits under the month's KPI key, so an agreed target that
 *  invalidates the month refreshes the forecast with it. The flag is the
 *  server's; nothing here judges a figure, it only orders what was sent. */

export const kpiForecastQuery = (period: string) =>
  queryOptions({
    queryKey: ['sales', 'kpi', period, 'forecast'] as const,
    ...cacheTier.aggregate,
    queryFn: ({ signal }) =>
      api.read<KpiForecastResponse>(`/sales/kpi/${period}/forecast`, {
        need: { branch: 'Sales', permission: 'kpi.view-all' },
        schema: KpiForecastResponse,
        signal,
      }),
  })

/** A forecast line beside the catalog row that says how to print it. */
export type ForecastItem = { def: KpiMetricDef; forecast: KpiForecast }

/** Lines whose metric is no longer in force are dropped, as on every KPI card. */
export function forecastItems(catalog: KpiCatalog, items: readonly KpiForecast[]): ForecastItem[] {
  return items.flatMap((forecast) => {
    const def = defOf(catalog, forecast.role, forecast.metricKey)
    return def ? [{ def, forecast }] : []
  })
}

/** Share of target already reached; null where either side is missing. */
export const reachedOf = ({ value, target }: KpiForecast): number | null =>
  value === null || !target ? null : value / target

export type ForecastFlag = NonNullable<KpiForecast['flag']>

/** Worst forecast first for slips, closest to done first for hits. */
export function flagged(items: readonly ForecastItem[], flag: ForecastFlag): ForecastItem[] {
  const rank = (i: ForecastItem) =>
    (flag === 'slip' ? i.forecast.projectedRatio : reachedOf(i.forecast)) ?? 0
  const picked = items.filter((i) => i.forecast.flag === flag)
  return picked.sort((a, b) => (flag === 'slip' ? rank(a) - rank(b) : rank(b) - rank(a)))
}

/** A role's flagged lines whose metric the catalog still prints. */
export function flagsOf(
  catalog: KpiCatalog,
  role: RoleId,
  forecast: KpiForecastResponse,
): KpiForecast[] {
  const keys = new Set(catalog[role].map((d) => d.key))
  return forecast.items.filter((f) => f.role === role && f.flag !== null && keys.has(f.metricKey))
}
