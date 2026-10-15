import { queryOptions } from '@tanstack/react-query'
import { KpiTargetHistoryResponse, type KpiTargetHistoryQuery } from '@pv/contracts'
import { api } from '@/app/api'

/** `GET /sales/kpi/:period/history` — a target's versions, read-only (ADR 0099
 *  §5). No `actorId`: the role target; with one: that person's line. Another
 *  person's line needs `kpi.view-all`, which the server judges. Live, no `load:`.
 *
 *  Under the month key, so any KPI write that refetches the month refetches this. */

export const kpiHistoryQuery = (period: string, q: KpiTargetHistoryQuery) => {
  const params = new URLSearchParams({ role: q.role, metricKey: q.metricKey })
  if (q.actorId) params.set('actorId', q.actorId)
  return queryOptions({
    queryKey: ['sales', 'kpi', period, 'history', q.role, q.metricKey, q.actorId ?? null] as const,
    staleTime: 0,
    queryFn: ({ signal }) =>
      api.read<KpiTargetHistoryResponse>(`/sales/kpi/${period}/history?${params.toString()}`, {
        need: { branch: 'Sales', permission: 'kpi.view' },
        schema: KpiTargetHistoryResponse,
        signal,
      }),
  })
}
