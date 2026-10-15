import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  KpiAllocationResponse,
  KpiForecastResponse,
  KpiWeeklyResponse,
  type KpiAcknowledgeBody,
  type KpiAllocationLine,
  type KpiAllocationStatus,
  type KpiCounterBody,
  type KpiMetricDef,
  type KpiMetricKey,
  type RoleId,
  isCumulative,
} from '@pv/contracts'
import { api, type ApiError, type ApiNeed } from '@/app/api'
import { kpiAllocationsQuery } from './kpi-allocation'
import { primaryOf, type KpiCatalog } from './kpi-catalog'

/** The holder's side of ADR 0098: their allocation lines, their forecast
 *  flags, their weekly running total, and the two answers to a line
 *  (confirm, counter-propose). Every read is live (no `load:`). The
 *  allocations read itself is `data/kpi-allocation.ts`'s, one copy for both sides.
 *
 *  Keys sit under `['sales', 'kpi', period]`, the prefix `data/kpi.ts` uses,
 *  so a write there refetches these too. A write here answers with the
 *  refreshed allocations; the rest of the month is then invalidated, because
 *  a confirmed or countered line changes what the scorecard measures against. */

const need: ApiNeed = { branch: 'Sales', permission: 'kpi.view' }

const monthKey = (period: string) => ['sales', 'kpi', period] as const

export const kpiForecastMeQuery = (period: string) =>
  queryOptions({
    queryKey: [...monthKey(period), 'forecast', 'me'] as const,
    staleTime: 0,
    queryFn: ({ signal }) =>
      api.read<KpiForecastResponse>(`/sales/kpi/${period}/forecast/me`, {
        need,
        schema: KpiForecastResponse,
        signal,
      }),
  })

/** Only for a metric `weeklyMetricOf` returns: any other is refused with a 400. */
export const kpiWeeklyQuery = (period: string, role: RoleId, metricKey: KpiMetricKey) =>
  queryOptions({
    queryKey: [...monthKey(period), 'weekly', role, metricKey] as const,
    staleTime: 0,
    queryFn: ({ signal }) =>
      api.read<KpiWeeklyResponse>(
        `/sales/kpi/${period}/weekly/${encodeURIComponent(role)}?metricKey=${encodeURIComponent(metricKey)}`,
        { need, schema: KpiWeeklyResponse, signal },
      ),
  })

/** The role's primary metric, when it has a weekly series. */
export function weeklyMetricOf(catalog: KpiCatalog, role: RoleId): KpiMetricDef | null {
  const def = primaryOf(catalog, role)
  return def && isCumulative(def) ? def : null
}

export type MyLine = KpiAllocationLine & { def: KpiMetricDef }
export type MyPackage = { role: RoleId; status: KpiAllocationStatus; lines: MyLine[] }

/* A draft or returned package has not been handed down yet: a manager who
   also holds the role would otherwise read their own draft as received.
   `superseded` is the agreed package still in force while the next is drafted. */
const SHOWN: readonly KpiAllocationStatus[] = ['submitted', 'agreed', 'superseded']

/** The holder may confirm or counter only a live package; a superseded one is
 *  read-only and its lines' answers say nothing about the next version. */
export const answerable = (pack: MyPackage) => pack.status !== 'superseded'

/** The caller's lines per package they may read, in catalog order; a line
 *  whose metric is no longer in force is not shown. */
export function myPackages(
  catalog: KpiCatalog,
  data: KpiAllocationResponse,
  me: string | undefined,
): MyPackage[] {
  return data.allocations
    .filter((p) => SHOWN.includes(p.status))
    .flatMap((p) => {
      const lines = catalog[p.role].flatMap((def) =>
        p.lines
          .filter((l) => l.actorId === me && l.metricKey === def.key)
          .map((l) => ({ ...l, def })),
      )
      return lines.length > 0 ? [{ role: p.role, status: p.status, lines }] : []
    })
}

function useSettle(period: string) {
  const client = useQueryClient()
  return (fresh: KpiAllocationResponse) => {
    client.setQueryData(kpiAllocationsQuery(period).queryKey, fresh)
    void client.invalidateQueries({
      queryKey: monthKey(period),
      predicate: (query) => query.queryKey[3] !== 'allocations',
    })
  }
}

/** A 409 means the line moved under the reader (a counter was settled, a
 *  package re-sent): the allocations are refetched while the error is read. */
function useRefetchOnConflict(period: string) {
  const client = useQueryClient()
  return (error: ApiError) => {
    if (error.kind !== 'conflict') return
    void client.invalidateQueries({ queryKey: kpiAllocationsQuery(period).queryKey })
  }
}

const rolePath = (period: string, role: RoleId) =>
  `/sales/kpi/${period}/allocations/${encodeURIComponent(role)}`

/** An empty body confirms every line of the role that is not countered. */
export function useAcknowledgeAllocation(period: string, role: RoleId) {
  return useMutation<KpiAllocationResponse, ApiError, KpiAcknowledgeBody>({
    mutationFn: (body) =>
      api.write<KpiAllocationResponse>(`${rolePath(period, role)}/acknowledge`, {
        body,
        need,
        schema: KpiAllocationResponse,
      }),
    onSuccess: useSettle(period),
    onError: useRefetchOnConflict(period),
  })
}

export function useCounterAllocation(period: string, role: RoleId) {
  return useMutation<KpiAllocationResponse, ApiError, KpiCounterBody>({
    mutationFn: (body) =>
      api.write<KpiAllocationResponse>(`${rolePath(period, role)}/counters`, {
        body,
        need,
        schema: KpiAllocationResponse,
      }),
    onSuccess: useSettle(period),
    onError: useRefetchOnConflict(period),
  })
}
