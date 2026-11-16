import { queryOptions } from '@tanstack/react-query'
import { KpiPlanResponse } from '@pv/contracts'
import { api, type ApiNeed } from '@/app/api'
import { cacheTier } from '@/app/query-client'

/** `/sales/kpi/:period/people/:actorId/plan` — leading indicators and the
 *  backward plan (ADR 0157). Both halves are null without a `signed-value` metric. */

const need: ApiNeed = { branch: 'Sales', permission: 'kpi.view' }

export const kpiPlanQuery = (period: string, actorId: string) =>
  queryOptions({
    queryKey: ['sales', 'kpi', period, 'plan', actorId] as const,
    ...cacheTier.aggregate,
    queryFn: ({ signal }) =>
      api.read<KpiPlanResponse>(`/sales/kpi/${period}/people/${encodeURIComponent(actorId)}/plan`, {
        need,
        schema: KpiPlanResponse,
        signal,
      }),
  })
