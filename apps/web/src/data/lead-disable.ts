import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LeadDisableResponse, type LeadDisableBody } from '@pv/contracts'
import { api, type ApiError, type ApiNeed } from '@/app/api'
import { CONTACT_BOOK_KEY } from './contacts'
import { CONTRACT_BOOK_KEY } from './contracts'
import { invalidateLeadState } from './lead-exit'
import { OPPORTUNITY_BOOK_KEY } from './opportunities'

/** Switch leads off, or back on — `POST /sales/leads/disabled`, `lead.disable`.
 *
 *  One door for the book's selection bar and the profile, so it takes a list.
 *  NOT scoped: the permission is the director's, over the whole book.
 *
 *  A switched-off lead leaves every list and count, and takes its deals and
 *  contracts with it — so the books of those go stale with the lead's own. */

const DISABLE_NEED: ApiNeed = { branch: 'Sales', permission: 'lead.disable' }

export function useDisableLeads() {
  const client = useQueryClient()

  return useMutation<LeadDisableResponse, ApiError, LeadDisableBody>({
    mutationFn: (body) =>
      api.write<LeadDisableResponse>('/sales/leads/disabled', {
        method: 'POST',
        body,
        need: DISABLE_NEED,
        schema: LeadDisableResponse,
      }),
    onSuccess: () => {
      invalidateLeadState(client)
      for (const key of [OPPORTUNITY_BOOK_KEY, CONTRACT_BOOK_KEY, CONTACT_BOOK_KEY]) {
        void client.invalidateQueries({ queryKey: key })
      }
    },
  })
}
