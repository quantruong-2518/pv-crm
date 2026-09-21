import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type {
  LeadContactedResponse,
  LeadExitBody,
  LeadExitResponse,
  LeadNurtureBody,
  LeadNurtureResponse,
  LeadReopenResponse,
  LeadResumeResponse,
} from '@pv/contracts'
import { api, type ApiError, type ApiNeed } from '@/app/api'
import { WORKSTREAM_BOOK_KEY } from './workstreams'

/** A lead leaving the funnel, and coming back — two doors, no approval.
 *
 *      POST /sales/leads/:code/exit     `lead.disqualify` · scoped
 *      POST /sales/leads/:code/reopen   `lead.disqualify` · scoped
 *
 *  Reversible, so it is the Sale's own call rather than an E3 request
 *  (`docs/decisions/0057-seven-sales-pipeline-decisions.md`, decision 2).
 *  A 409 (open deal, already signed) carries the server's own sentence, which
 *  the dialog prints through `userMessage`.
 *
 *  The PIC's own lifecycle steps (ADR 0058) sit here too, same shape, under
 *  `lead.edit`: `:code/contacted` · `:code/nurture` · `:code/resume`. The
 *  `:code/verify` door is gone — `verifying` is now entered by SCHEDULING care,
 *  not by a manual step, and the tier left the state machine (ADR 0063). */

const EXIT_NEED: ApiNeed = { branch: 'Sales', permission: 'lead.disqualify', scoped: true }
const STEP_NEED: ApiNeed = { branch: 'Sales', permission: 'lead.edit', scoped: true }

/** Every read that prints a lead's state (ADR 0058): the book and its counts,
 *  the scorecard, the profile, the timeline, the company card's lead list, and
 *  the journey run. The server also moves the state inside OTHER doors (a
 *  scheduled meeting or mail run, a logged exchange, a deal), and the cache
 *  never goes stale on its own (`staleTime: Infinity`) — so those call this. */
export const LEAD_STATE_KEYS = [
  ['sales', 'lead-book'],
  ['sales', 'lead-scorecard'],
  ['sales', 'lead-profile'],
  ['sales', 'lead-touches'],
  ['sales', 'accounts'],
  WORKSTREAM_BOOK_KEY,
] as const

export function invalidateLeadState(client: QueryClient) {
  for (const key of LEAD_STATE_KEYS) void client.invalidateQueries({ queryKey: key })
}

const leadPath = (code: string, door: 'contacted' | 'exit' | 'reopen' | 'nurture' | 'resume') =>
  `/sales/leads/${encodeURIComponent(code)}/${door}`

export function useContactLead(code: string) {
  const client = useQueryClient()

  return useMutation<LeadContactedResponse, ApiError, void>({
    mutationFn: () =>
      api.write<LeadContactedResponse>(leadPath(code, 'contacted'), {
        method: 'POST',
        need: STEP_NEED,
      }),
    onSuccess: () => invalidateLeadState(client),
  })
}

export function useExitLead(code: string) {
  const client = useQueryClient()

  return useMutation<LeadExitResponse, ApiError, LeadExitBody>({
    mutationFn: (body) =>
      api.write<LeadExitResponse>(leadPath(code, 'exit'), {
        method: 'POST',
        body,
        need: EXIT_NEED,
      }),
    onSuccess: () => invalidateLeadState(client),
  })
}

export function useReopenLead(code: string) {
  const client = useQueryClient()

  return useMutation<LeadReopenResponse, ApiError, void>({
    mutationFn: () =>
      api.write<LeadReopenResponse>(leadPath(code, 'reopen'), {
        method: 'POST',
        need: EXIT_NEED,
      }),
    onSuccess: () => invalidateLeadState(client),
  })
}

export function useNurtureLead(code: string) {
  const client = useQueryClient()

  return useMutation<LeadNurtureResponse, ApiError, LeadNurtureBody>({
    mutationFn: (body) =>
      api.write<LeadNurtureResponse>(leadPath(code, 'nurture'), {
        method: 'POST',
        body,
        need: STEP_NEED,
      }),
    onSuccess: () => invalidateLeadState(client),
  })
}

export function useResumeLead(code: string) {
  const client = useQueryClient()

  return useMutation<LeadResumeResponse, ApiError, void>({
    mutationFn: () =>
      api.write<LeadResumeResponse>(leadPath(code, 'resume'), {
        method: 'POST',
        need: STEP_NEED,
      }),
    onSuccess: () => invalidateLeadState(client),
  })
}
