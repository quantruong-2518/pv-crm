import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import type {
  ConfigProposalReceipt,
  LeadMotion,
  MotionPolicyPatch,
  MotionPolicyResponse,
} from '@pv/contracts'
import { api, type ApiError, type ApiNeed } from '@/app/api'

/** What each of the six lead motions declares — the flow-setup section.
 *
 *      GET   /sales/config/motions          permission `config.view`
 *      PATCH /sales/config/motions/:motion  permission `config.propose` → 202
 *
 *  ------------------------------------------------------------------
 *  THE WRITE DOOR DOES NOT WRITE
 *  ------------------------------------------------------------------
 *  There is no `config.edit` in the matrix. The answer is a receipt for a
 *  request in the One inbox, so the screen must say the request was SENT and
 *  never that anything was saved — and it must not repaint the row as if the
 *  change had landed. The row changes when somebody approves it, which is a
 *  different event arriving through a different screen.
 *
 *  That is why `onSuccess` invalidates rather than writing the patch into the
 *  cache: a re-read returns the row exactly as the server still has it, which
 *  is the truth the screen should be showing.
 *
 *  ------------------------------------------------------------------
 *  THE UPPER-CASE SPELLING IS THE STORED ONE
 *  ------------------------------------------------------------------
 *  `LeadMotion` here is the contract's `INBOUND`…, not the lower-case list in
 *  `@pv/engines` that the rest of `apps/web` reads. The two are the "enum
 *  declared twice" debt recorded in
 *  `docs/decisions/0012-rename-vietnamese-identifiers-in-six-batches.md`, and its rule is that the
 *  conversion lives in exactly ONE place. This file does not convert: it shows
 *  what the server sent, with labels of its own. */
const VIEW_NEED: ApiNeed = { branch: 'Sales', permission: 'config.view' }
const PROPOSE_NEED: ApiNeed = { branch: 'Sales', permission: 'config.propose' }

const MOTIONS_KEY = ['sales', 'config', 'motions'] as const

export const salesMotionsQuery = () =>
  queryOptions({
    queryKey: MOTIONS_KEY,
    queryFn: ({ signal }) =>
      api.read<MotionPolicyResponse>('/sales/config/motions', { need: VIEW_NEED, signal }),
    select: (d: MotionPolicyResponse) => d.rows,
  })

export function useProposeMotion(motion: LeadMotion) {
  const client = useQueryClient()

  return useMutation<ConfigProposalReceipt, ApiError, MotionPolicyPatch>({
    mutationFn: (body) =>
      api.write<ConfigProposalReceipt>(`/sales/config/motions/${motion}`, {
        method: 'PATCH',
        body,
        need: PROPOSE_NEED,
      }),
    onSuccess: () => {
      /* The row has NOT changed yet — this only re-reads it. The proposer's own
         inbox is the other half of what moved, so it is refreshed too. */
      void client.invalidateQueries({ queryKey: MOTIONS_KEY })
      void client.invalidateQueries({ queryKey: ['platform', 'approvals', 'pending'] })
    },
  })
}
