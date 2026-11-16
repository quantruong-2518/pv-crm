import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { AssistantProposal, type AssistantSessionDetail } from '@pv/contracts'
import { api, type ApiError } from '@/app/api'
import { SESSIONS_KEY, USE_NEED } from './assistant'
import { replaceTurnProposal } from './assistant-live'
import { nextStepWrittenElsewhere } from './next-step'

/** The two presses on a proposal card (ADR 0162 §3), both under `assistant.use`:
 *
 *      POST /assistant/proposals/:id/apply     writes the step as the presser
 *      POST /assistant/proposals/:id/dismiss   drops the card, writes nothing
 *
 *  Both answer the card as it now stands, so it is set into the session cache
 *  instead of re-read. No `retry`: a replayed apply would write the step twice. */

/** The detail is `[...SESSIONS_KEY, id]`; the bare key is the infinite list, which has no `messages`. */
function cardSet(client: QueryClient, card: AssistantProposal) {
  client.setQueriesData<AssistantSessionDetail>({ queryKey: SESSIONS_KEY }, (old) =>
    old && 'messages' in old
      ? {
          ...old,
          messages: old.messages.map((m) => ({
            ...m,
            proposals: m.proposals.map((p) => (p.id === card.id ? card : p)),
          })),
        }
      : old,
  )
  replaceTurnProposal(card)
}

/** A 409 means the card is no longer pending or the step moved: read the chat again to show its new state. */
const rereadOnConflict = (client: QueryClient) => (error: ApiError) => {
  if (error.kind === 'conflict') void client.invalidateQueries({ queryKey: SESSIONS_KEY })
}

export function useApplyProposal() {
  const client = useQueryClient()
  return useMutation<AssistantProposal, ApiError, AssistantProposal>({
    mutationFn: (card) =>
      api.write(`/assistant/proposals/${card.id}/apply`, {
        method: 'POST',
        need: USE_NEED,
        schema: AssistantProposal,
      }),
    onError: rereadOnConflict(client),
    onSuccess: (card, sent) => {
      cardSet(client, card)
      nextStepWrittenElsewhere(client, sent.kind, sent.code)
    },
  })
}

export function useDismissProposal() {
  const client = useQueryClient()
  return useMutation<AssistantProposal, ApiError, AssistantProposal>({
    mutationFn: (card) =>
      api.write(`/assistant/proposals/${card.id}/dismiss`, {
        method: 'POST',
        need: USE_NEED,
        schema: AssistantProposal,
      }),
    onError: rereadOnConflict(client),
    onSuccess: (card) => cardSet(client, card),
  })
}
