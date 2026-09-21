import { keepPreviousData, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  PartnerListResponse,
  type LeadSource,
  type PartnerCreate,
  type PartnerCreateResponse,
  type PartnerListQuery,
  type PartnerPatch,
  type PartnerPatchResponse,
} from '@pv/contracts'
import { api, type ApiError, type ApiNeed } from '@/app/api'
import { paramsOf } from '@/data/lead-origins'

/** The partner book — who SENDS us leads, picked on the create form and the
 *  import panel when the motion's `asks` is `REFERRER`.
 *
 *      GET   /sales/partners          `lead.view`
 *      POST  /sales/partners          `lead-origin.manage`
 *      PATCH /sales/partners/:code    `lead-origin.manage`
 *
 *  A rename or a re-file changes what the lead book prints beside a referred
 *  lead, so a patch refreshes the book too. */

const LIST_NEED: ApiNeed = { branch: 'Sales', permission: 'lead.view' }
const MANAGE_NEED: ApiNeed = { branch: 'Sales', permission: 'lead-origin.manage' }

const PARTNERS_PATH = '/sales/partners'
const PARTNERS_KEY = ['sales', 'partners'] as const
/** Same literal `data/lead-create.ts` copies, for the reason it states there. */
const LEAD_BOOK_KEY = ['sales', 'lead-book'] as const

export const partnersQuery = (query: PartnerListQuery) =>
  queryOptions({
    queryKey: [...PARTNERS_KEY, query] as const,
    queryFn: ({ signal }) =>
      api.read<PartnerListResponse>(`${PARTNERS_PATH}${paramsOf(query)}`, {
        need: LIST_NEED,
        schema: PartnerListResponse,
        signal,
      }),
    placeholderData: keepPreviousData,
  })

/** `code · name` — the one spelling every screen prints for a partner. */
export const partnerLabel = (code: string, name?: string): string =>
  name ? `${code} · ${name}` : code

/** The partner of a lead's source, printed; `undefined` when none sent it. */
export const sourcePartnerLabel = (source: LeadSource): string | undefined =>
  source.partnerCode ? partnerLabel(source.partnerCode, source.partnerName) : undefined

export function useCreatePartner() {
  const client = useQueryClient()
  return useMutation<PartnerCreateResponse, ApiError, PartnerCreate>({
    mutationFn: (body) =>
      api.write<PartnerCreateResponse>(PARTNERS_PATH, { body, need: MANAGE_NEED }),
    onSuccess: () => void client.invalidateQueries({ queryKey: PARTNERS_KEY }),
  })
}

export function usePatchPartner() {
  const client = useQueryClient()
  return useMutation<PartnerPatchResponse, ApiError, { code: string; body: PartnerPatch }>({
    mutationFn: ({ code, body }) =>
      api.write<PartnerPatchResponse>(`${PARTNERS_PATH}/${code}`, {
        method: 'PATCH',
        body,
        need: MANAGE_NEED,
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: PARTNERS_KEY })
      void client.invalidateQueries({ queryKey: LEAD_BOOK_KEY })
    },
  })
}
