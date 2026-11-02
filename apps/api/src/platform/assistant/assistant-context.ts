import { randomUUID } from 'node:crypto'
import type { Actor } from '@pv/engines'
import type { AiConverseRequest, AiEffort, AiMessage, AiToolDecl } from '../ai/ai-client'
import { ASSISTANT, roleAddition } from '../ai/prompts/assistant.prompts'
import { renderPrompt } from '../ai/prompts/prompt-spec'
import type { TurnBegun } from './assistant.repository'

/** What the model reads, in a fixed order so vendors can cache the prefix: prompt
 *  and tools, role addition, summary, latest turns, then the current message.
 *
 *  The clock and the screen sit in the current message and nowhere earlier: one
 *  changing value above the history would miss the cache on every turn. */

const VN_TIME = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Ho_Chi_Minh',
  dateStyle: 'short',
  timeStyle: 'short',
})

const PROMPT = renderPrompt(ASSISTANT)
export const ASSISTANT_PROMPT_VERSION = PROMPT.prompt

/** The fixed sentence of a turn that failed. It says nothing of the chat, so a fold
 *  neither counts nor reads a row that holds only this. */
export const CUT_SHORT = 'Trợ lý chưa trả lời được câu này. Thử lại sau ít phút.'

/** A whole exchange of its own: the next line is a `user` one, and the fixed reply
 *  keeps the roles alternating.
 *
 *  Fenced because `user` is the role that directs the model, and a model wrote this
 *  text after reading customer data (D5). The marker is per session, not per turn: a
 *  new one each turn would change the prefix and miss the cache. It can be guessed
 *  and still hold: a session id has digits, and stored text has none in its prose
 *  (`withoutFigures`) and only codes in its records, so it cannot contain the marker. */
const summaryLines = (sessionId: string, summary: string): AiMessage[] => [
  {
    role: 'user',
    text: `Summary of the earlier turns of this chat:\n${fenced(`SUMMARY-${sessionId}`, { summary })}`,
  },
  { role: 'assistant', text: 'OK.' },
]

export function openingMessages(
  begun: TurnBegun,
  turn: { who: Actor; sessionId: string; question: string; screen: string | null; at: Date },
): AiMessage[] {
  const context = JSON.stringify({
    now: VN_TIME.format(turn.at),
    role: turn.who.roleIds,
    screen: turn.screen,
    record: begun.subject,
  })
  return [
    ...(begun.summary ? summaryLines(turn.sessionId, begun.summary) : []),
    ...begun.history.map(({ role, body }) => ({ role, text: body })),
    { role: 'user', text: `${context}\n\n${turn.question}` },
  ]
}

export function requestOf(
  who: Actor,
  tools: readonly AiToolDecl[],
  toolChoice: AiConverseRequest['toolChoice'],
  messages: readonly AiMessage[],
  effort: AiEffort,
): AiConverseRequest {
  return {
    system: PROMPT.system,
    systemRole: roleAddition(who.roleIds),
    tools,
    toolChoice,
    messages,
    effort,
    prompt: PROMPT.prompt,
  }
}

export const tokensOf = (data: object): number =>
  Math.ceil(Buffer.byteLength(JSON.stringify(data), 'utf8') / 3)

/** Crypto-random, and only called once data has been read: stored text cannot
 *  have been written to contain it (D5). */
export const newFence = (): string => `DATA-${randomUUID()}`

/** JSON inside, so a stored line break cannot sit next to the marker on its own line. */
export const fenced = (fence: string, data: object): string =>
  `${fence}\n${JSON.stringify(data)}\n${fence}`
