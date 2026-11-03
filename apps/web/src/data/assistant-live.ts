import { create } from 'zustand'
import { useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type {
  AssistantEndedBy,
  AssistantErrorCode,
  AssistantEvent,
  AssistantFooter,
  AssistantRef,
  AssistantSubject,
  AssistantSuggestion,
} from '@pv/contracts'
import type { ApiError } from '@/app/api'
import { access, useSession } from '@/app/auth'
import { queryClient } from '@/app/query-client'
import { AVAILABILITY_KEY, SESSIONS_KEY, USE_NEED, availabilityQuery, subjectOf } from './assistant'
import { streamTurn } from './assistant-stream'

/** The CRM assistant's state that outlives a screen (ADR 0133): whether the
 *  panel is open, which session it shows, and every turn this tab streamed.
 *
 *  Module-level, never inside the Drawer: closing the panel or leaving the
 *  page must not drop a turn, and the panel unmounts its body when closed. A
 *  turn keeps its suggestions after `done` because the saved message has
 *  none. Cleared, streams and all, when the person changes. */

export type Origin = 'panel' | 'page'
export type TurnContext = { screen?: string; subject?: AssistantSubject }
export type TurnFailure = { code: AssistantErrorCode; message?: string }

export type LiveTurn = {
  key: number
  origin: Origin
  sessionId: string | null
  question: string
  context: TurnContext
  phase: 'running' | 'done' | 'failed'
  step: { round: number; tool?: string } | null
  /** Tools of the rounds before `step`, oldest first; a round that calls none is left out. */
  past: string[]
  text: string
  refs: AssistantRef[]
  suggestions: AssistantSuggestion[]
  footer: AssistantFooter | null
  messageId: string | null
  endedBy: AssistantEndedBy | null
  failure: TurnFailure | null
  /** A view showing no session has taken this turn's session, or moved on. */
  adopted: boolean
  at: string
}

type Panel = { open: boolean; mounted: boolean; sessionId: string | null; context: TurnContext }

/** `drafts`: a half-typed question survives closing the panel or leaving the page. */
type LiveState = { panel: Panel; turns: LiveTurn[]; drafts: Record<Origin, string> }

const EMPTY: LiveState = {
  panel: { open: false, mounted: false, sessionId: null, context: {} },
  turns: [],
  drafts: { panel: '', page: '' },
}

export const useAssistantLive = create<LiveState>()(() => EMPTY)

const controllers = new Map<number, AbortController>()
let seq = 0

const setPanel = (patch: Partial<Panel>) =>
  useAssistantLive.setState((s) => ({ panel: { ...s.panel, ...patch } }))

function patchTurn(key: number, patch: (turn: LiveTurn) => Partial<LiveTurn>) {
  useAssistantLive.setState((s) => ({
    turns: s.turns.map((t) => (t.key === key ? { ...t, ...patch(t) } : t)),
  }))
}

const turnOf = (key: number) => useAssistantLive.getState().turns.find((t) => t.key === key)

export function openAssistant(pathname: string) {
  setPanel({
    open: true,
    mounted: true,
    context: { screen: pathname, subject: subjectOf(pathname) },
  })
}

export const closeAssistant = () => setPanel({ open: false })

/** Shows a past session in the panel; a turn still waiting for its own session stays behind. */
export function openPanelSession(id: string) {
  useAssistantLive.setState((s) => ({
    turns: s.turns.map((t) => (t.origin === 'panel' ? { ...t, adopted: true } : t)),
    panel: { ...s.panel, sessionId: id },
  }))
}

/** Leaves the current session; a turn still running keeps running. */
export function newConversation(origin: Origin) {
  useAssistantLive.setState((s) => ({
    turns: s.turns.map((t) => (t.origin === origin ? { ...t, adopted: true } : t)),
    panel: origin === 'panel' ? { ...s.panel, sessionId: null } : s.panel,
  }))
}

export const setDraft = (origin: Origin, text: string) =>
  useAssistantLive.setState((s) => ({ drafts: { ...s.drafts, [origin]: text } }))

export const composerId = (origin: Origin) => `assistant-composer-${origin}`

/** `onlyFinePointer`: on a phone a focus raises the keyboard over the answer. */
export function focusComposer(origin: Origin, onlyFinePointer = false) {
  if (onlyFinePointer && !matchMedia('(pointer: fine)').matches) return
  document.getElementById(composerId(origin))?.focus()
}

export const adoptTurn = (key: number) => patchTurn(key, () => ({ adopted: true }))

/** A deleted session must not stay open in the panel. */
export function forgetSession(id: string) {
  if (useAssistantLive.getState().panel.sessionId === id) setPanel({ sessionId: null })
}

function onEvent(key: number, event: AssistantEvent) {
  switch (event.type) {
    case 'session': {
      const turn = turnOf(key)
      const { panel } = useAssistantLive.getState()
      if (turn?.origin === 'panel' && !turn.adopted && panel.sessionId === null) {
        setPanel({ sessionId: event.sessionId })
      }
      patchTurn(key, () => ({ sessionId: event.sessionId, messageId: event.messageId }))
      void queryClient.invalidateQueries({ queryKey: SESSIONS_KEY, exact: true })
      return
    }
    case 'step':
      return patchTurn(key, (t) => ({
        step: { round: event.round, tool: event.tool },
        past: t.step?.tool ? [...t.past, t.step.tool] : t.past,
      }))
    case 'text':
      return patchTurn(key, (t) => ({ text: t.text + event.delta }))
    case 'refs':
      return patchTurn(key, () => ({ refs: event.refs }))
    case 'suggestions':
      return patchTurn(key, () => ({ suggestions: event.items }))
    case 'done':
      /* After an `error`, `done` only closes the turn: the refusal stays what the screen says. */
      patchTurn(key, (t) => ({
        phase: t.phase === 'failed' ? 'failed' : 'done',
        messageId: event.messageId,
        endedBy: event.endedBy,
        footer: event.footer,
        at: event.footer.at,
      }))
      void queryClient.invalidateQueries({ queryKey: SESSIONS_KEY })
      return
    case 'error':
      return fail(key, { code: event.code, message: event.message })
    case 'heartbeat':
      return
  }
}

function fail(key: number, failure: TurnFailure) {
  patchTurn(key, () => ({ phase: 'failed', failure }))
  if (failure.code === 'off') void queryClient.invalidateQueries({ queryKey: AVAILABILITY_KEY })
  void queryClient.invalidateQueries({ queryKey: SESSIONS_KEY })
}

/** A refusal before the stream opened, read as the stream's own codes. */
function failureOfApi(error: ApiError): TurnFailure {
  const code: AssistantErrorCode =
    error.kind === 'forbidden'
      ? 'off'
      : error.kind === 'rate-limited'
        ? 'limit'
        : error.kind === 'conflict'
          ? 'busy'
          : 'failed'
  return { code, message: error.serverTitle }
}

export function sendTurn(
  origin: Origin,
  sessionId: string | null,
  question: string,
  context: TurnContext,
) {
  const key = ++seq
  const turn: LiveTurn = {
    key,
    origin,
    sessionId,
    question,
    context,
    phase: 'running',
    step: null,
    past: [],
    text: '',
    refs: [],
    suggestions: [],
    footer: null,
    messageId: null,
    endedBy: null,
    failure: null,
    /* Only a turn born without a session has one for a view to take. */
    adopted: sessionId !== null,
    at: new Date().toISOString(),
  }
  useAssistantLive.setState((s) => ({ turns: [...s.turns, turn] }))
  const abort = new AbortController()
  controllers.set(key, abort)
  const body = { question, ...(sessionId ? { sessionId } : {}), ...context }
  streamTurn(body, (event) => onEvent(key, event), abort.signal)
    .then(() => {
      if (turnOf(key)?.phase === 'running') fail(key, { code: 'interrupted' })
    })
    .catch((error: ApiError) => {
      if (!abort.signal.aborted) fail(key, failureOfApi(error))
    })
    .finally(() => controllers.delete(key))
}

/** Another person's turns must never show, and their streams must not run on. */
let owner = useSession.getState().actor?.id ?? null
useSession.subscribe((now) => {
  const next = now.actor?.id ?? null
  if (next === owner || (next === null && now.status !== 'guest')) return
  owner = next
  controllers.forEach((c) => c.abort())
  controllers.clear()
  useAssistantLive.setState(EMPTY)
})

/** The chrome's three doors (top bar, round button, bottom nav): present only
 *  when the server says the assistant is on for this person. On `/assistant`
 *  they go to the page's own box rather than open a second conversation. */
/** Whether the entry shows, with no router hook, so a host outside the router can ask. */
export function useAssistantShown(): boolean {
  const actor = useSession((s) => s.actor)
  const allowed = access.check(actor, USE_NEED).ok
  const { data } = useQuery({ ...availabilityQuery, enabled: allowed })
  return allowed && data?.enabled === true
}

export function useAssistantEntry(): (() => void) | undefined {
  const { pathname } = useLocation()
  if (!useAssistantShown()) return undefined
  return pathname === '/assistant' ? () => focusComposer('page') : () => openAssistant(pathname)
}
