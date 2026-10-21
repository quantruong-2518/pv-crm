import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  HoldListResponse,
  type HoldListQuery,
  type HoldPatchBody,
  type HoldSetBody,
  type HoldSubjectType,
  type LeadHoldEndBody,
  type LeadHoldResponse,
  type OpportunityHoldEndBody,
  type OpportunityHoldResponse,
} from '@pv/contracts'
import { api, type ApiError, type ApiNeed } from '@/app/api'
import { OPPORTUNITY_BOOK_KEY } from './opportunities'
import { invalidateLeadState } from './lead-exit'
import { WORKSTREAM_BOOK_KEY } from './workstreams'

/** Holds — a dated pause over a lead or a deal (ADR 0097 §3).
 *
 *      POST|PATCH /sales/leads/:code/hold · POST …/hold/end            `lead.edit` · scoped
 *      POST|PATCH /sales/opportunities/:code/hold · POST …/hold/end    `opportunity.edit` · scoped
 *      GET /sales/holds?subject=…                                      the one shared list
 *
 *  Every write answers the subject's whole profile, so it lands in the profile
 *  cache as is; the books, the journey and the list are re-read. A hold also
 *  ends inside doors this file does not own (a logged exchange, a park,
 *  a deal stop) — `HOLD_LIST_KEY` rides `invalidateLeadState` for those. */

export const HOLD_LIST_KEY = ['sales', 'holds'] as const

/* The list mixes leads and deals; the lead read is the one every Sale holds.
   Must match the controller's `@Need` (open decision in the care-lists hand-off). */
const LIST_NEED: ApiNeed = { branch: 'Sales', permission: 'lead.view', scoped: true }

const NEED: Record<HoldSubjectType, ApiNeed> = {
  lead: { branch: 'Sales', permission: 'lead.edit', scoped: true },
  opportunity: { branch: 'Sales', permission: 'opportunity.edit', scoped: true },
}

const BASE: Record<HoldSubjectType, string> = {
  lead: '/sales/leads',
  opportunity: '/sales/opportunities',
}

const holdPath = (type: HoldSubjectType, code: string, end = false) =>
  `${BASE[type]}/${encodeURIComponent(code)}/hold${end ? '/end' : ''}`

export const holdListQuery = (subject: HoldListQuery['subject'] = 'all') =>
  queryOptions({
    queryKey: [...HOLD_LIST_KEY, subject] as const,
    queryFn: ({ signal }) =>
      api.read<HoldListResponse>(`/sales/holds?subject=${subject}`, {
        need: LIST_NEED,
        schema: HoldListResponse,
        signal,
      }),
  })

/** One write door of either kind; `method` and `end` pick which. The deal's
 *  profile is re-read after the write so its `position` follows the clock. */
function useHoldDoor<Body, Res>(
  type: HoldSubjectType,
  code: string,
  method: 'POST' | 'PATCH',
  end: boolean,
) {
  const client = useQueryClient()

  return useMutation<Res, ApiError, Body>({
    mutationFn: (body) =>
      api.write<Res>(holdPath(type, code, end), { method, body, need: NEED[type] }),
    onSuccess: (profile) => {
      if (type === 'lead') {
        client.setQueryData(['sales', 'lead-profile', code], profile)
        invalidateLeadState(client)
        return
      }
      client.setQueryData(['sales', 'ops', code], profile)
      void client.invalidateQueries({ queryKey: ['sales', 'ops', code] })
      void client.invalidateQueries({ queryKey: OPPORTUNITY_BOOK_KEY })
      void client.invalidateQueries({ queryKey: WORKSTREAM_BOOK_KEY })
      void client.invalidateQueries({ queryKey: HOLD_LIST_KEY })
    },
  })
}

/** `POST …/hold` — open a hold on a lead or a deal. */
export const useSetHold = (type: HoldSubjectType, code: string) =>
  useHoldDoor<HoldSetBody, LeadHoldResponse | OpportunityHoldResponse>(type, code, 'POST', false)

/** `PATCH …/hold` — change the date, the note, or both. */
export const usePatchHold = (type: HoldSubjectType, code: string) =>
  useHoldDoor<HoldPatchBody, LeadHoldResponse | OpportunityHoldResponse>(type, code, 'PATCH', false)

/** `POST /sales/leads/:code/hold/end` — resume, or into the waiting group. */
export const useEndLeadHold = (code: string) =>
  useHoldDoor<LeadHoldEndBody, LeadHoldResponse>('lead', code, 'POST', true)

/** `POST /sales/opportunities/:code/hold/end` — resume; the stop door is the other way out. */
export const useEndOpportunityHold = (code: string) =>
  useHoldDoor<OpportunityHoldEndBody, OpportunityHoldResponse>('opportunity', code, 'POST', true)
