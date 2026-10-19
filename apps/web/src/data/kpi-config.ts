import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ConfigProposalReceipt,
  KpiAlertSettingResponse,
  KpiRoleMetricsResponse,
  type KpiAlertPatch,
  type KpiRoleMetricsPatch,
} from '@pv/contracts'
import { api, type ApiError, type ApiNeed } from '@/app/api'
import { cacheTier } from '@/app/query-client'

/** `/sales/config/kpi-metrics | kpi-alert` — KPI configuration (ADR 0099 §1–3).
 *  Read on `config.view`, written on `config.propose`; a write answers 202 with
 *  a `ConfigProposalReceipt` and changes nothing until the approval lands, so
 *  only the inbox is refetched. An approval refetches everything under
 *  `['sales']` (`data/approvals.ts`), these keys and the KPI catalog included. */

const VIEW: ApiNeed = { branch: 'Sales', permission: 'config.view' }
const PROPOSE: ApiNeed = { branch: 'Sales', permission: 'config.propose' }

/** Every catalog metric of every role, switched-off ones included. */
export const kpiRoleMetricsQuery = queryOptions({
  queryKey: ['sales', 'config', 'kpi-metrics'] as const,
  queryFn: ({ signal }) =>
    api.read<KpiRoleMetricsResponse>('/sales/config/kpi-metrics', {
      need: VIEW,
      schema: KpiRoleMetricsResponse,
      signal,
    }),
  ...cacheTier.reference,
})

export const kpiAlertQuery = queryOptions({
  queryKey: ['sales', 'config', 'kpi-alert'] as const,
  queryFn: ({ signal }) =>
    api.read<KpiAlertSettingResponse>('/sales/config/kpi-alert', {
      need: VIEW,
      schema: KpiAlertSettingResponse,
      signal,
    }),
  ...cacheTier.reference,
})

function useInboxRefetch() {
  const client = useQueryClient()
  return () => void client.invalidateQueries({ queryKey: ['platform', 'approvals', 'pending'] })
}

/** Replaces one role's whole overlay; the body lists every catalog metric of the role. */
export function useProposeKpiRoleMetrics() {
  return useMutation<ConfigProposalReceipt, ApiError, KpiRoleMetricsPatch>({
    mutationFn: (body) =>
      api.write<ConfigProposalReceipt>('/sales/config/kpi-metrics', {
        method: 'PUT',
        body,
        need: PROPOSE,
        schema: ConfigProposalReceipt,
      }),
    onSuccess: useInboxRefetch(),
  })
}

/** All three values in one body, so slip < hit is judged on the pair. */
export function useProposeKpiAlert() {
  return useMutation<ConfigProposalReceipt, ApiError, KpiAlertPatch>({
    mutationFn: (body) =>
      api.write<ConfigProposalReceipt>('/sales/config/kpi-alert', {
        method: 'PATCH',
        body,
        need: PROPOSE,
        schema: ConfigProposalReceipt,
      }),
    onSuccess: useInboxRefetch(),
  })
}
