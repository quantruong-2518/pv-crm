import { queryOptions } from '@tanstack/react-query'
import { KpiCompanyDeskResponse, KpiDeskResponse } from '@pv/contracts'
import { api, type ApiNeed } from '@/app/api'
import { cacheTier } from '@/app/query-client'

/** `/sales/kpi/:period/desk` and `…/company/desk` — the server decides which KPI
 *  tabs a caller holds and fills the unit and company tabs (ADR 0159).
 *
 *  Keys sit under the month's `['sales', 'kpi', period]`, so any KPI write
 *  refetches them; the forecast and 1:1 hooks also name them explicitly. */

const need: ApiNeed = { branch: 'Sales', permission: 'kpi.view' }

export const kpiDeskKey = (period: string) => ['sales', 'kpi', period, 'desk'] as const
export const kpiCompanyDeskKey = (period: string) =>
  ['sales', 'kpi', period, 'company-desk'] as const

/** `unit` absent lets the server pick the first unit the caller acts for. */
export const kpiDeskQuery = (period: string, unit?: string) =>
  queryOptions({
    queryKey: [...kpiDeskKey(period), unit ?? 'first'] as const,
    ...cacheTier.aggregate,
    queryFn: ({ signal }) =>
      api.read<KpiDeskResponse>(
        `/sales/kpi/${period}/desk${unit ? `?unit=${encodeURIComponent(unit)}` : ''}`,
        { need, schema: KpiDeskResponse, signal },
      ),
  })

export const kpiCompanyDeskQuery = (period: string) =>
  queryOptions({
    queryKey: kpiCompanyDeskKey(period),
    ...cacheTier.aggregate,
    queryFn: ({ signal }) =>
      api.read<KpiCompanyDeskResponse>(`/sales/kpi/${period}/company/desk`, {
        need,
        schema: KpiCompanyDeskResponse,
        signal,
      }),
  })
