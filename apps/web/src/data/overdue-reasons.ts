import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  OverdueReasonListResponse,
  type OverdueReasonBody,
  type OverdueReasonDecideBody,
} from '@pv/contracts'
import { api, type ApiError, type ApiNeed } from '@/app/api'
import { CONTRACT_BOOK_KEY, contractDetailQuery } from '@/data/contracts'

/** Why an overdue installment is late, and whether a head accepts it (ADR 0100).
 *  Contract and routes in `packages/contracts/src/sales/contract-overdue-reason.ts`.
 *
 *      GET  I/overdue-reasons               `contract.view` · scoped
 *      POST I/overdue-reasons               `contract.view` · scoped · owner only
 *      POST /sales/overdue-reasons/:id/decide      `contract.approve-overdue-reason`
 *
 *  `I` = `/sales/contracts/:code/installments/:no`. */

const READ_NEED: ApiNeed = { branch: 'Sales', permission: 'contract.view', scoped: true }
const DECIDE_NEED: ApiNeed = { branch: 'Sales', permission: 'contract.approve-overdue-reason' }

const pathOf = (code: string, no: number) =>
  `/sales/contracts/${encodeURIComponent(code)}/installments/${no}/overdue-reasons`

/** Under the contract book's prefix, so any refresh of the book refreshes it too. */
const reasonsKey = (code: string, no: number) =>
  [...CONTRACT_BOOK_KEY, 'overdue-reasons', code, no] as const

export const overdueReasonsQuery = (code: string, no: number) =>
  queryOptions({
    queryKey: reasonsKey(code, no),
    queryFn: ({ signal }) =>
      api.read<OverdueReasonListResponse>(pathOf(code, no), {
        need: READ_NEED,
        schema: OverdueReasonListResponse,
        signal,
      }),
  })

/** A write moves the reasons list and what the contract page reads off it. */
function useSettled(code: string, no: number) {
  const client = useQueryClient()
  return () => {
    void client.invalidateQueries({ queryKey: reasonsKey(code, no) })
    void client.invalidateQueries({ queryKey: contractDetailQuery(code).queryKey })
  }
}

export function useWriteOverdueReason(code: string, no: number) {
  const settled = useSettled(code, no)
  return useMutation<unknown, ApiError, OverdueReasonBody>({
    mutationFn: (body) => api.write(pathOf(code, no), { method: 'POST', body, need: READ_NEED }),
    onSuccess: settled,
  })
}

export function useDecideOverdueReason(code: string, no: number, id: number) {
  const settled = useSettled(code, no)
  return useMutation<unknown, ApiError, OverdueReasonDecideBody>({
    mutationFn: (body) =>
      api.write(`/sales/overdue-reasons/${id}/decide`, {
        method: 'POST',
        body,
        need: DECIDE_NEED,
      }),
    onSuccess: settled,
  })
}
