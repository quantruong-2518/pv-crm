import { randomUUID } from 'node:crypto'
import type { AssistantLang } from '@pv/contracts'
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

/** The prompt names the chat's language in English, whatever the language itself is. */
export const LANGUAGE_NAME: Record<AssistantLang, string> = {
  vi: 'Vietnamese',
  en: 'English',
  ko: 'Korean',
}

const PROMPT = renderPrompt(ASSISTANT)
export const ASSISTANT_PROMPT_VERSION = PROMPT.prompt

/** The fixed sentence of a turn that failed. It says nothing of the chat, so a fold
 *  neither counts nor reads a row that holds only this. */
export const CUT_SHORT = 'Trợ lý chưa trả lời được câu này. Thử lại sau ít phút.'

/** The same sentence in the chat's language: it is stored as the answer body, so
 *  every reader of a body must know all three (`withoutCutShort`, `CUT_SHORT_ALL`). */
export const CUT_SHORT_BY: Record<AssistantLang, string> = {
  vi: CUT_SHORT,
  en: 'The assistant could not answer this question. Try again in a few minutes.',
  ko: '도우미가 이 질문에 답하지 못했습니다. 몇 분 뒤에 다시 시도하세요.',
}
export const CUT_SHORT_ALL: string[] = Object.values(CUT_SHORT_BY)

export const withoutCutShort = (body: string): string =>
  CUT_SHORT_ALL.reduce((text, sentence) => text.replace(sentence, ''), body)

/** One marker per session for the summary and for every replayed answer: the binder
 *  masks digits the model types, so an answer cannot hold a session id. A replayed
 *  answer is fenced too, since text the model repeated from a record would read as
 *  its own words on a bare `assistant` line. */
const chatFence = (sessionId: string): string => `SUMMARY-${sessionId}`

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
    text: `Summary of the earlier turns of this chat:\n${fenced(chatFence(sessionId), { summary })}`,
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
    language: LANGUAGE_NAME[begun.lang],
    record: begun.subject,
  })
  return [
    ...(begun.summary ? summaryLines(turn.sessionId, begun.summary) : []),
    ...begun.history.map(({ role, body }) => ({
      role,
      text: role === 'assistant' ? fenced(chatFence(turn.sessionId), { answer: body }) : body,
    })),
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
