import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ObjectCode, OpportunityPresalesOwnersBody, OpportunityRow } from '@pv/contracts'
import { api, type ApiError } from '@/app/api'
import { OPPORTUNITY_ASSIGN_NEED } from '@/data/opportunities-write'
import { OPPORTUNITY_BOOK_KEY } from '@/data/opportunities'
import { WORKSTREAM_BOOK_KEY } from '@/data/workstreams'

/** `POST /sales/opportunities/:code/presales-owners` (ADR 0160 §5) — replaces
 *  the PRESALES lane, behind the same permission as the Sale lane. No primary
 *  and no sign-request freeze: the lane never carries credit for the deal. */

export function usePresalesOwners(code: ObjectCode) {
  const client = useQueryClient()

  return useMutation<OpportunityRow, ApiError, OpportunityPresalesOwnersBody>({
    mutationFn: (body) =>
      api.write<OpportunityRow>(`/sales/opportunities/${code}/presales-owners`, {
        method: 'POST',
        body,
        need: OPPORTUNITY_ASSIGN_NEED,
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['sales', 'ops', code] })
      void client.invalidateQueries({ queryKey: OPPORTUNITY_BOOK_KEY })
      void client.invalidateQueries({ queryKey: WORKSTREAM_BOOK_KEY })
    },
  })
}
