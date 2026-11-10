import type {
  AssistantEndedBy,
  AssistantMessage,
  AssistantRef,
  AssistantSubject,
  AssistantSuggestion,
} from '@pv/contracts'
import type { LiveTurn, Origin, TurnFailure } from './assistant-live'

/** One conversation as the screen draws it: the saved messages of a session
 *  merged with the turns this tab is streaming into it. Pure, so the panel and
 *  the page cannot merge it two ways.
 *
 *  A streamed turn stands in for its saved rows until the saved answer (same
 *  id) arrives; while it does, the saved copy of its question and any running
 *  row after it are cut, or the question would show twice. */

export type AnswerView = {
  key: string
  id: string | null
  state: 'running' | 'done' | 'failed' | 'stopped'
  body: string
  refs: AssistantRef[]
  withheld: boolean
  at: string
  footer: LiveTurn['footer']
  suggestions: AssistantSuggestion[]
  unchecked: boolean
  step: LiveTurn['step']
  past: LiveTurn['past']
  failure: TurnFailure | null
  /** The question it answers, so a failed answer can ask it again. */
  question: string
  /** Streamed in this tab: it stops through the stream's own session. */
  live: boolean
}

export type ThreadItem =
  | { kind: 'question'; key: string; text: string }
  | { kind: 'answer'; key: string; answer: AnswerView }

/** Turns a view owns: those in its session, or, before the server named one, those it sent. */
export const turnsOfView = (turns: LiveTurn[], origin: Origin, sessionId: string | null) =>
  turns.filter((t) =>
    t.sessionId === null || sessionId === null
      ? sessionId === null && t.origin === origin && !t.adopted
      : t.sessionId === sessionId,
  )

function liveAnswer(turn: LiveTurn): AnswerView {
  const stopped = turn.endedBy === 'stopped'
  return {
    key: `live-${turn.key}`,
    id: turn.messageId,
    state:
      turn.phase === 'running'
        ? 'running'
        : turn.phase === 'failed'
          ? 'failed'
          : stopped
            ? 'stopped'
            : 'done',
    body: turn.text,
    refs: turn.refs,
    withheld: false,
    unchecked: false,
    at: turn.at,
    footer: turn.footer,
    suggestions: turn.suggestions,
    step: turn.step,
    past: turn.past,
    failure: turn.failure,
    question: turn.question,
    live: true,
  }
}

/** A saved failure says what the live stream said: the switch-off, a crash, or a plain failure. */
const failureOfEnd = (endedBy: AssistantEndedBy | null): TurnFailure => ({
  code: endedBy === 'disabled' ? 'off' : endedBy === 'crash' ? 'interrupted' : 'failed',
})

function savedAnswer(msg: AssistantMessage, question: string, extra?: LiveTurn): AnswerView {
  const failed = msg.state === 'failed' || msg.endedBy === 'disabled'
  return {
    key: msg.id,
    id: msg.id,
    state: failed ? 'failed' : msg.state,
    body: msg.body,
    refs: msg.refs,
    withheld: msg.withheld,
    unchecked: msg.unchecked,
    at: msg.finishedAt ?? msg.createdAt,
    footer: msg.footer ?? extra?.footer ?? null,
    suggestions: extra?.suggestions ?? [],
    step: null,
    past: [],
    failure: failed ? (extra?.failure ?? failureOfEnd(msg.endedBy)) : null,
    question,
    live: false,
  }
}

/** Failures after the turn opened: the server still saved (or is saving) the turn. */
const LOST = new Set(['interrupted', 'failed'])

export function threadOf(saved: AssistantMessage[], turns: LiveTurn[]): ThreadItem[] {
  const savedState = new Map(saved.map((msg) => [msg.id, msg.state]))
  /* The id is known from `session`, so a saved running row is not yet the answer: the stream is. */
  const settled = (t: LiveTurn) => {
    const state = t.messageId ? savedState.get(t.messageId) : undefined
    /* A dropped stream (no `done`) defers to the saved row, which polls; a closed turn waits for it. */
    const dropped = t.phase === 'failed' && t.endedBy === null
    return state !== undefined && (state !== 'running' || dropped)
  }
  const asked = (q: string) =>
    saved.some((msg) => msg.role === 'user' && msg.body.trim() === q.trim())
  /* A dropped stream is not a dropped turn: once the saved rows hold it, they tell the truth. */
  const pending = turns.filter(
    (t) =>
      !settled(t) &&
      !(t.phase === 'failed' && LOST.has(t.failure?.code ?? '') && asked(t.question)),
  )
  const first = pending.find(
    (t) => t.phase !== 'failed' || (t.messageId !== null && savedState.has(t.messageId)),
  )
  let cutAt = -1
  saved.forEach((msg, i) => {
    if (first && msg.role === 'user' && msg.body.trim() === first.question.trim()) cutAt = i
  })
  const kept = cutAt >= 0 ? saved.slice(0, cutAt) : saved

  const items: ThreadItem[] = []
  let question = ''
  for (const msg of kept) {
    if (msg.role === 'user') {
      question = msg.body
      items.push({ kind: 'question', key: msg.id, text: msg.body })
    } else {
      const extra = turns.find((t) => t.messageId === msg.id)
      items.push({ kind: 'answer', key: msg.id, answer: savedAnswer(msg, question, extra) })
    }
  }
  for (const turn of pending) {
    items.push({ kind: 'question', key: `q-${turn.key}`, text: turn.question })
    items.push({ kind: 'answer', key: `live-${turn.key}`, answer: liveAnswer(turn) })
  }
  return items
}

/** The rail of one conversation: the record it is about, then every record its answers named. */
export function railOf(subject: AssistantSubject | null | undefined, items: ThreadItem[]) {
  type Named = Pick<AssistantRef, 'kind' | 'code'>
  const seen = new Set<string>()
  const objects: { ref: Named; source: boolean }[] = []
  const add = (ref: Named, source: boolean) => {
    const id = `${ref.kind}:${ref.code}`
    if (seen.has(id)) return
    seen.add(id)
    objects.push({ ref, source })
  }
  if (subject) add(subject, true)
  for (const item of items)
    if (item.kind === 'answer') item.answer.refs.forEach((r) => add(r, false))
  return objects
}
