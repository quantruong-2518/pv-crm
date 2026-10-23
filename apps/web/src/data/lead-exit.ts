import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { LeadNurtureBody, LeadNurtureResponse, LeadResumeResponse } from '@pv/contracts'
import { api, type ApiError, type ApiNeed } from '@/app/api'
import { STOP_LOG_KEY } from './stop-log'
import { WORKSTREAM_BOOK_KEY } from './workstreams'

/** A lead entering and leaving the nurturing pool (ADR 0109), no approval.
 *
 *      POST /sales/leads/:code/nurture   `lead.disqualify` · scoped — the one park door
 *      POST /sales/leads/:code/resume    `lead.edit` · scoped — the claim, the caller
 *                                        becomes the holder
 *
 *  Reversible, so it is the Sale's own call rather than an E3 request. A 409
 *  carries the server's own sentence, which the dialog prints through
 *  `userMessage`. */

const PARK_NEED: ApiNeed = { branch: 'Sales', permission: 'lead.disqualify', scoped: true }
const CLAIM_NEED: ApiNeed = { branch: 'Sales', permission: 'lead.edit', scoped: true }

/** Every read that prints a lead's state (ADR 0058): the book and its counts,
 *  the scorecard, the profile, the timeline, the company card's lead list, and
 *  the journey run. The server also moves the state inside OTHER doors (a
 *  scheduled meeting or mail run, a logged exchange, a deal), and the cache
 *  would only notice after `staleTime` — so those call this. */
export const LEAD_STATE_KEYS = [
  ['sales', 'lead-book'],
  ['sales', 'lead-scorecard'],
  ['sales', 'lead-profile'],
  ['sales', 'lead-touches'],
  ['sales', 'accounts'],
  WORKSTREAM_BOOK_KEY,
  /* `HOLD_LIST_KEY` (`./holds`), spelled out: that file imports this one. A
     touch, a park or a convert ends a lead's hold. */
  ['sales', 'holds'],
  /* A park, a deal stop or a termination writes a log row; a claim turns its "now". */
  STOP_LOG_KEY,
] as const

export function invalidateLeadState(client: QueryClient) {
  for (const key of LEAD_STATE_KEYS) void client.invalidateQueries({ queryKey: key })
}

const leadPath = (code: string, door: 'nurture' | 'resume') =>
  `/sales/leads/${encodeURIComponent(code)}/${door}`

export function useNurtureLead(code: string) {
  const client = useQueryClient()

  return useMutation<LeadNurtureResponse, ApiError, LeadNurtureBody>({
    mutationFn: (body) =>
      api.write<LeadNurtureResponse>(leadPath(code, 'nurture'), {
        method: 'POST',
        body,
        need: PARK_NEED,
      }),
    onSuccess: () => invalidateLeadState(client),
  })
}

/** The claim: the caller becomes the holder of a lead in the pool. */
export function useResumeLead(code: string) {
  const client = useQueryClient()

  return useMutation<LeadResumeResponse, ApiError, void>({
    mutationFn: () =>
      api.write<LeadResumeResponse>(leadPath(code, 'resume'), {
        method: 'POST',
        need: CLAIM_NEED,
      }),
    onSuccess: () => invalidateLeadState(client),
  })
}
