import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { KpiCloseGateResponse, KpiCloseResponse, OverdueReasonWaitingResponse } from '@pv/contracts'
import { api, type ApiError } from '@/app/api'

/** The month-close write, made from the targets screen only, and the gate read
 *  before it (ADR 0100, 0116). The close freezes every KPI reading of the month, so a settled
 *  write refetches the whole month key.
 *
 *  The waiting reasons are asked only of a reader who may approve them (their
 *  own permission, which `kpi.set-target` does not imply): by the targets list
 *  and the company door's count. The close dialog reads the gate instead. */

const monthKey = (period: string) => ['sales', 'kpi', period] as const

/** Reasons still waiting on an approver whose installment falls due in the month. */
export const waitingReasonsQuery = (period: string, enabled: boolean) =>
  queryOptions({
    queryKey: ['sales', 'overdue-reasons', 'waiting', period] as const,
    enabled,
    staleTime: 0,
    queryFn: ({ signal }) =>
      api.read<OverdueReasonWaitingResponse>(
        `/sales/overdue-reasons?state=waiting&period=${encodeURIComponent(period)}`,
        {
          need: { branch: 'Sales', permission: 'contract.approve-overdue-reason' },
          schema: OverdueReasonWaitingResponse,
          signal,
        },
      ),
  })

/** What is pending and what looks unusual, read fresh by the open close dialog,
 *  and on a closed month for its `atClose` line. Under the month key, so the
 *  close's refetch drops it with the rest. */
export const kpiCloseGateQuery = (period: string, enabled: boolean) =>
  queryOptions({
    queryKey: [...monthKey(period), 'close-gate'] as const,
    enabled,
    staleTime: 0,
    queryFn: ({ signal }) =>
      api.read<KpiCloseGateResponse>(`/sales/kpi/${period}/close-gate`, {
        need: { branch: 'Sales', permission: 'kpi.set-target' },
        schema: KpiCloseGateResponse,
        signal,
      }),
  })

/** A 409 may mean someone closed it first: the reread shows who. */
export function useCloseKpiMonth(period: string) {
  const client = useQueryClient()
  const settle = () => void client.invalidateQueries({ queryKey: monthKey(period) })
  return useMutation<KpiCloseResponse, ApiError, void>({
    mutationFn: () =>
      api.write<KpiCloseResponse>(`/sales/kpi/${period}/close`, {
        need: { branch: 'Sales', permission: 'kpi.set-target' },
        schema: KpiCloseResponse,
      }),
    onSuccess: settle,
    onError: (error) => {
      if (error.kind === 'conflict') settle()
    },
  })
}
