import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ContractKindsResponse,
  QuotationReasonsResponse,
  type ObjectCode,
  type QuotationCloseBody,
  type QuotationCloseResponse,
  type QuotationPatchBody,
  type QuotationPatchResponse,
  type QuotationRecordBody,
  type QuotationRecordResponse,
} from '@pv/contracts'
import { api, type ApiError } from '@/app/api'
import { cacheTier } from '@/app/query-client'
import { CONTRACT_BOOK_KEY } from '@/data/contracts'
import { nextStepKey } from '@/data/next-step'
import { OPPORTUNITY_BOOK_KEY, vnToday } from '@/data/opportunities'
import { OPPORTUNITY_MOVE_NEED } from '@/data/opportunities-write'
import { WORKSTREAM_BOOK_KEY } from '@/data/workstreams'

/** The quotation ledger's write doors — contract and routes in
 *  `packages/contracts/src/sales/quotation.ts`. All three are `opportunity.edit`
 *  scoped, the permission the other move doors of the deal already declare. */

const pathOf = (code: ObjectCode) => `/sales/opportunities/${code}/quotations`

/** The chosen calendar day as the `sentAt` the door takes. Today sends nothing,
 *  so the server stamps its own now; another day is that day's VN midnight and
 *  the server clamps it to [floor, now]. */
export const atOfDay = (day: string): string | undefined =>
  day === vnToday() ? undefined : `${day}T00:00:00+07:00`

const VN_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })

/** The Vietnam calendar day a moment falls on. */
export const vnDayOf = (moment: string) => VN_DAY.format(new Date(moment))

/** `GET …/quotation-reasons` — the active `QUOTE_REVISION_REASON` list for a
 *  writer without `config.view`. */
export const quotationReasonsQuery = queryOptions({
  queryKey: ['sales', 'quotation-reasons'] as const,
  queryFn: ({ signal }) =>
    api.read<QuotationReasonsResponse>('/sales/opportunities/quotation-reasons', {
      need: { branch: 'Sales', permission: 'opportunity.edit' },
      schema: QuotationReasonsResponse,
      signal,
    }),
  ...cacheTier.reference,
})

/** `GET …/contract-kinds` — every `CONTRACT_KIND` entry, retired ones included,
 *  for anyone who can view a deal but lacks `config.view`. */
export const contractKindsQuery = queryOptions({
  queryKey: ['sales', 'contract-kinds'] as const,
  queryFn: ({ signal }) =>
    api.read<ContractKindsResponse>('/sales/opportunities/contract-kinds', {
      need: { branch: 'Sales', permission: 'opportunity.view' },
      schema: ContractKindsResponse,
      signal,
    }),
  ...cacheTier.reference,
})

/** A new round moves the deal's column, a patch or a close
 *  only the ledger — but all three change what the profile's `money` shows. */
function useLedgerSettled(code: ObjectCode) {
  const client = useQueryClient()

  return (moved: boolean) => {
    void client.invalidateQueries({ queryKey: ['sales', 'ops', code] })
    void client.invalidateQueries({ queryKey: OPPORTUNITY_BOOK_KEY })
    void client.invalidateQueries({ queryKey: WORKSTREAM_BOOK_KEY })
    /* Won rounds carry the contract code the drawers read. */
    void client.invalidateQueries({ queryKey: CONTRACT_BOOK_KEY })
    if (moved) void client.invalidateQueries({ queryKey: nextStepKey(code) })
  }
}

export function useRecordQuotation(code: ObjectCode) {
  const settled = useLedgerSettled(code)

  return useMutation<QuotationRecordResponse, ApiError, QuotationRecordBody>({
    mutationFn: (body) =>
      api.write<QuotationRecordResponse>(pathOf(code), {
        method: 'POST',
        body,
        need: OPPORTUNITY_MOVE_NEED,
      }),
    onSuccess: () => settled(true),
  })
}

export function usePatchQuotation(code: ObjectCode) {
  const settled = useLedgerSettled(code)

  return useMutation<QuotationPatchResponse, ApiError, { id: string; body: QuotationPatchBody }>({
    mutationFn: ({ id, body }) =>
      api.write<QuotationPatchResponse>(`${pathOf(code)}/${id}`, {
        method: 'PATCH',
        body,
        need: OPPORTUNITY_MOVE_NEED,
      }),
    onSuccess: () => settled(false),
  })
}

export function useCloseQuotation(code: ObjectCode) {
  const settled = useLedgerSettled(code)

  return useMutation<QuotationCloseResponse, ApiError, { id: string; body: QuotationCloseBody }>({
    mutationFn: ({ id, body }) =>
      api.write<QuotationCloseResponse>(`${pathOf(code)}/${id}/close`, {
        method: 'POST',
        body,
        need: OPPORTUNITY_MOVE_NEED,
      }),
    onSuccess: () => settled(false),
  })
}
