import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { KpiCloseResponse, OverdueReasonWaitingResponse } from '@pv/contracts'
import { api, type ApiError } from '@/app/api'

/** The month-close write and the check before it (ADR 0100). The close freezes every
 *  KPI reading of the month, so a settled write refetches the whole month key.
 *
 *  The waiting reasons are asked only while the dialog is open and only of a
 *  reader who may approve them: that read needs its own permission, which the
 *  close button's `kpi.set-target` does not imply. */

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
