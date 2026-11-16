import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { KpiMarketingBudgetResponse, type KpiMarketingBudgetBody } from '@pv/contracts'
import { api, type ApiError, type ApiNeed } from '@/app/api'
import { cacheTier } from '@/app/query-client'

/** `GET|PUT /sales/kpi/:period/units/:unitId/marketing-budget` — one amount per
 *  unit and month, shown beside what its Marketing members spent (ADR 0160 §8).
 *  Never scored. The response carries `canEdit`, so the screen never guesses a seat.
 *
 *  A write refreshes the month's budget reads (see `useSaveKpiMarketingBudget`). */

const need: ApiNeed = { branch: 'Sales', permission: 'kpi.view' }

const budgetKey = (period: string, unitId: string) =>
  ['sales', 'kpi', period, 'marketing-budget', unitId] as const
const budgetPath = (period: string, unitId: string) =>
  `/sales/kpi/${period}/units/${encodeURIComponent(unitId)}/marketing-budget`

export const kpiMarketingBudgetQuery = (period: string, unitId: string) =>
  queryOptions({
    queryKey: budgetKey(period, unitId),
    ...cacheTier.aggregate,
    queryFn: ({ signal }) =>
      api.read<KpiMarketingBudgetResponse>(budgetPath(period, unitId), {
        need,
        schema: KpiMarketingBudgetResponse,
        signal,
      }),
  })

export function useSaveKpiMarketingBudget(period: string, unitId: string) {
  const client = useQueryClient()
  return useMutation<KpiMarketingBudgetResponse, ApiError, KpiMarketingBudgetBody>({
    mutationFn: (body) =>
      api.write<KpiMarketingBudgetResponse>(budgetPath(period, unitId), {
        method: 'PUT',
        body,
        need,
        schema: KpiMarketingBudgetResponse,
      }),
    /* A read made on a unit above lands on the unit Marketing sits in, so the key of the
       answer is not the key asked: refresh the month's budget reads, and the board's. */
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ['sales', 'kpi', period, 'marketing-budget'] }),
        client.invalidateQueries({
          queryKey: ['sales', 'kpi', period, 'board', 'marketing-sources'],
        }),
      ]),
  })
}
