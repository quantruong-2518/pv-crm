import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import type {
  ApprovalDecisionBody,
  ApprovalRequestView,
  PendingApprovalsResponse,
} from '@pv/contracts'
import { api, type ApiError, type ApiNeed } from '@/app/api'

/** The One inbox — what is waiting on the person reading the screen.
 *
 *      GET  /approvals/pending      a live session, nothing more
 *      POST /approvals/:id/decide   permission `approval.decide`
 *
 *  ------------------------------------------------------------------
 *  THE READ CARRIES NO PERMISSION, AND THAT IS THE SERVER'S DECLARATION
 *  ------------------------------------------------------------------
 *  The server declares `@Need({})` on the read: the list is already cut by the
 *  approval chain, which names the person waited on, so there is no wider set
 *  to leak. Asking for `approval.decide` here would be a second, stricter rule
 *  than the one the server actually enforces — and the two would then disagree
 *  about who may look at their own empty inbox.
 *
 *  The WRITE does carry it, matching the door. Both halves of `ApiNeed` exist
 *  so the button gate (`useCan`) and the route guard read the same sentence the
 *  server does; a screen that asked for less than the server would fail at the
 *  edge instead of in the interface. */
const DECIDE_NEED: ApiNeed = { permission: 'approval.decide' }

const INBOX_KEY = ['platform', 'approvals', 'pending'] as const

/** Everything waiting on me. Not paged — see `PendingApprovalsResponse`: a
 *  queue that hides its own tail is a queue nobody trusts. */
export const pendingApprovalsQuery = () =>
  queryOptions({
    queryKey: INBOX_KEY,
    queryFn: ({ signal }) =>
      api.read<PendingApprovalsResponse>('/approvals/pending', { need: {}, signal }),
    select: (d: PendingApprovalsResponse) => d.rows,
  })

/** Yes or no on one request.
 *
 *  `invalidateQueries` on the whole inbox rather than dropping the decided row
 *  from the cache by hand: one decision can change more than one line. A chain
 *  with a second approver moves the request to THEIR inbox, and an approved
 *  config change rewrites the very lists another screen is showing — neither of
 *  which a local splice would catch. One extra read, and the screen is never a
 *  step behind the book. */
export function useDecideApproval(id: string) {
  const client = useQueryClient()

  return useMutation<ApprovalRequestView, ApiError, ApprovalDecisionBody>({
    mutationFn: (body) =>
      api.write<ApprovalRequestView>(`/approvals/${encodeURIComponent(id)}/decide`, {
        method: 'POST',
        body,
        need: DECIDE_NEED,
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: INBOX_KEY })
      /* The sales config screen reads the very rows an approved `config-change`
         just rewrote. Invalidating by prefix rather than naming that one key
         keeps this file from having to know which screens the next kind of
         request will touch. */
      void client.invalidateQueries({ queryKey: ['sales'] })
    },
  })
}
