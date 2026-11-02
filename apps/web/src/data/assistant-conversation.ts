import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { sessionQuery } from './assistant'
import { sendTurn, useAssistantLive, type Origin, type TurnContext } from './assistant-live'
import { threadOf, turnsOfView } from './assistant-thread'

/** One view's conversation (panel or page): the saved session merged with the
 *  turns streaming into it. A saved answer still running is polled only while
 *  this tab has no stream of its own for it. */

export type Conversation = ReturnType<typeof useConversation>

export function useConversation(origin: Origin, sessionId: string | null, context: TurnContext) {
  const turns = useAssistantLive((s) => s.turns)
  const mine = useMemo(() => turnsOfView(turns, origin, sessionId), [turns, origin, sessionId])
  const streaming = mine.some((t) => t.phase === 'running')
  const detail = useQuery({
    ...sessionQuery(sessionId ?? '', !streaming),
    enabled: sessionId !== null,
  })
  const saved = sessionId ? detail.data?.messages : undefined
  const items = useMemo(() => threadOf(saved ?? [], mine), [saved, mine])
  const busy = items.some((i) => i.kind === 'answer' && i.answer.state === 'running')
  const ask = (question: string) => {
    if (!busy) sendTurn(origin, sessionId, question, context)
  }
  return { origin, sessionId, detail, items, busy, ask }
}
