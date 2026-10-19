import { queryOptions } from '@tanstack/react-query'
import {
  KpiEffectiveCatalogResponse,
  type KpiMetricDef,
  type KpiMetricKey,
  type RoleId,
} from '@pv/contracts'
import { api } from '@/app/api'
import { cacheTier } from '@/app/query-client'

/** `GET /sales/kpi/catalog` — the metric catalog with the role overlay applied
 *  (ADR 0099 §1): the ONE list every KPI screen groups, orders and picks the
 *  primary by. A switched-off metric is absent here, so it leaves every card
 *  at once. Live, no `load:`.
 *
 *  Reference tier: another person's approval changes it, and a decision made
 *  on this machine sweeps `['sales']`, which reaches this key. */

/** Per role, the metrics in force, in display order. */
export type KpiCatalog = KpiEffectiveCatalogResponse['roles']

export const kpiCatalogQuery = queryOptions({
  queryKey: ['sales', 'kpi', 'catalog'] as const,
  ...cacheTier.reference,
  queryFn: ({ signal }) =>
    api
      .read<KpiEffectiveCatalogResponse>('/sales/kpi/catalog', {
        need: { branch: 'Sales', permission: 'kpi.view' },
        schema: KpiEffectiveCatalogResponse,
        signal,
      })
      .then((r) => r.roles),
})

export const primaryOf = (catalog: KpiCatalog, role: RoleId): KpiMetricDef | null =>
  catalog[role].find((d) => d.primary) ?? null

export const defOf = (
  catalog: KpiCatalog,
  role: RoleId,
  key: KpiMetricKey,
): KpiMetricDef | undefined => catalog[role].find((d) => d.key === key)

/** What `QueryBlock` reads of a query; a `useQuery` result is one, and so is `withCatalog`'s pair. */
export type BlockQuery<T> = {
  data: T | undefined
  error: Error | null
  isRefetchError: boolean
  refetch: () => unknown
}

/** A screen's read joined with the KPI catalog, so one block carries both
 *  loading and failure states: no block draws a reading without its catalog row. */
export function withCatalog<T>(
  query: BlockQuery<T>,
  catalog: BlockQuery<KpiCatalog>,
): BlockQuery<[T, KpiCatalog]> {
  const both = [query, catalog] as const
  return {
    data: query.data !== undefined && catalog.data ? [query.data, catalog.data] : undefined,
    error: query.error ?? catalog.error,
    isRefetchError: query.isRefetchError || catalog.isRefetchError,
    refetch: () => both.filter((q) => q.error).forEach((q) => void q.refetch()),
  }
}
