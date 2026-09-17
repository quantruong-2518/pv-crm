import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { LeadExitBody, LeadExitResponse, LeadReopenResponse } from '@pv/contracts'
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
 *  the dialog prints through `userMessage`. */

const EXIT_NEED: ApiNeed = { branch: 'Sales', permission: 'lead.disqualify', scoped: true }

/* Every read that prints whether a lead is still running: the book and its
   counts, the profile, the timeline (an `exited`/`reopened` touch), and the
   journey run that closes LOST on exit and reopens with the lead. */
const TOUCHED_KEYS = [
  ['sales', 'lead-book'],
  ['sales', 'lead-scorecard'],
  ['sales', 'lead-profile'],
  ['sales', 'lead-touches'],
  WORKSTREAM_BOOK_KEY,
] as const

const leadPath = (code: string, door: 'exit' | 'reopen') =>
  `/sales/leads/${encodeURIComponent(code)}/${door}`

export function useExitLead(code: string) {
  const client = useQueryClient()

  return useMutation<LeadExitResponse, ApiError, LeadExitBody>({
    mutationFn: (body) =>
      api.write<LeadExitResponse>(leadPath(code, 'exit'), {
        method: 'POST',
        body,
        need: EXIT_NEED,
      }),
    onSuccess: () => {
      for (const key of TOUCHED_KEYS) void client.invalidateQueries({ queryKey: key })
    },
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
    onSuccess: () => {
      for (const key of TOUCHED_KEYS) void client.invalidateQueries({ queryKey: key })
    },
  })
}
