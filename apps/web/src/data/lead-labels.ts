import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  LeadLabelOptionsResponse,
  type LeadLabelsBody,
  type LeadLabelsResponse,
} from '@pv/contracts'
import { api, type ApiError } from '@/app/api'
import { invalidateLeadState } from './lead-exit'

/** Waiting labels — the `WAITING_LABEL` list (ADR 0097 §5).
 *
 *      GET /sales/lead-labels          `lead.view` — the catalogue, for pickers
 *      PUT /sales/leads/:code/labels   `lead.edit` · scoped — the whole set
 *
 *  The catalogue door exists for readers without `config.view`, the same
 *  reason `leadStopReasonsQuery` does. Inactive rows come back too, so a label
 *  switched off later still prints on the leads that carry it. */

export const leadLabelOptionsQuery = queryOptions({
  queryKey: ['sales', 'lead-labels'] as const,
  queryFn: ({ signal }) =>
    api.read<LeadLabelOptionsResponse>('/sales/lead-labels', {
      need: { branch: 'Sales', permission: 'lead.view' },
      schema: LeadLabelOptionsResponse,
      signal,
    }),
})

/** Replaces the lead's whole label set; `[]` clears it. The book's rows and
 *  its label filter both read labels, so every lead read is refreshed. */
export function useSetLeadLabels(code: string) {
  const client = useQueryClient()

  return useMutation<LeadLabelsResponse, ApiError, LeadLabelsBody>({
    mutationFn: (body) =>
      api.write<LeadLabelsResponse>(`/sales/leads/${encodeURIComponent(code)}/labels`, {
        method: 'PUT',
        body,
        need: { branch: 'Sales', permission: 'lead.edit', scoped: true },
      }),
    onSuccess: (profile) => {
      client.setQueryData(['sales', 'lead-profile', code], profile)
      invalidateLeadState(client)
    },
  })
}

/** Same set, any order — the editors skip a write that changes nothing. */
export const sameLabels = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id) => b.includes(id))
