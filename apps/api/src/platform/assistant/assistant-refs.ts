import type { AssistantRef } from '@pv/contracts'
import type { Actor } from '@pv/engines'
import type { AssistantToolGate } from './assistant-tools'

/** A message's refs are the codes its tool calls returned. On load, on replay and in
 *  the report list, a chat's codes are read again as the reader is now, one batched
 *  door read per kind (`AssistantToolGate.recheck`, ADR 0136 §3).
 *
 *  Fail closed, and forward in time: an answer naming a record the reader can no
 *  longer read is `withheld`, and so is every later answer of that chat, since a turn
 *  that called no tool can repeat an earlier answer's names and prose. Past
 *  `REF_CHECKS` distinct codes, counted from the oldest answer, an answer is
 *  `unchecked`, and so is every later one. Either way it has no body, no refs and no
 *  place in the replay. The summary of folded turns is not re-checked (known limit). */

/** Ten turns that each list a whole desk (40 codes): two book reads per kind at most. */
export const REF_CHECKS = 400

export type MessageCodes = { id: string; codes: readonly string[] }
export type Shut = 'withheld' | 'unchecked'

export type Recheck = {
  refs: ReadonlyMap<string, readonly AssistantRef[]>
  shut: ReadonlyMap<string, Shut>
}

const worse = (a: Shut | null, b: Shut | null): Shut | null =>
  a === 'withheld' || b === 'withheld' ? 'withheld' : (a ?? b)

function verdictOf(
  codes: readonly string[],
  found: ReadonlyMap<string, AssistantRef | null>,
): Shut | null {
  if (codes.some((code) => found.get(code) === null)) return 'withheld'
  return codes.every((code) => found.has(code)) ? null : 'unchecked'
}

/** `chats`: each chat's answers, oldest first. One batched read covers them all,
 *  and the cap counts across them. */
export async function recheckChats(
  gate: AssistantToolGate,
  who: Actor,
  chats: readonly (readonly MessageCodes[])[],
): Promise<Recheck> {
  const checked = new Set<string>()
  const past = new Set<string>()
  for (const chat of chats) {
    let full = false
    for (const message of chat) {
      const fresh = new Set(message.codes.filter((code) => !checked.has(code)))
      full ||= checked.size + fresh.size > REF_CHECKS
      if (full) past.add(message.id)
      else for (const code of fresh) checked.add(code)
    }
  }
  const found = await gate.recheck(who, [...checked])
  const refs = new Map<string, AssistantRef[]>()
  const shut = new Map<string, Shut>()
  for (const chat of chats) {
    let taint: Shut | null = null
    for (const { id, codes } of chat) {
      taint = worse(taint, past.has(id) ? 'unchecked' : verdictOf(codes, found))
      if (taint) shut.set(id, taint)
      else
        refs.set(
          id,
          [...new Set(codes)].map((code) => found.get(code) as AssistantRef),
        )
    }
  }
  return { refs, shut }
}

export const recheck = (gate: AssistantToolGate, who: Actor, chat: readonly MessageCodes[]) =>
  recheckChats(gate, who, [chat])
