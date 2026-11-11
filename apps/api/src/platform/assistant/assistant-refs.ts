import type { AssistantRef } from '@pv/contracts'
import type { Actor, Permission } from '@pv/engines'
import type { AssistantToolGate } from './assistant-tools'
import type { AssistantRepository, StoredCall } from './assistant.repository'

/** A message's refs are the codes its tool calls returned. On load, on replay and in
 *  the report list, a chat's codes are read again as the reader is now, one batched
 *  door read per kind (`AssistantToolGate.recheck`, ADR 0136 §3).
 *
 *  Fail closed, and forward in time: an answer naming a record the reader can no
 *  longer read is `withheld`, and so is every later answer of that chat, since a turn
 *  that called no tool can repeat an earlier answer's names and prose. Past
 *  `REF_CHECKS` distinct codes, counted from the oldest answer, an answer is
 *  `unchecked`, and so is every later one. Either way it has no body, no refs and no
 *  place in the replay. An answer whose turn revealed gated text (`reveals`, ADR 0147)
 *  is `withheld` from a reader without the permission or outside the reach its tool
 *  re-asks (`revealReach`), and unknown tools fail closed; a reach read that failed
 *  leaves it `unchecked`.
 *  The replay drops the folded summary when an answer it covers is shut, and a fold
 *  stops before a shut answer (`checkChat`). */

/** Ten turns that each list a whole desk (40 codes): two book reads per kind at most. */
export const REF_CHECKS = 400

/** `reveals`: a null is a revealing call whose tool declares no permission now.
 *  `revealing`: the tool and codes of those whose tool re-asks a reach, for the
 *  reach re-check and the audit. */
export type MessageCodes = {
  id: string
  codes: readonly string[]
  reveals: readonly (Permission | null)[]
  revealing: readonly { tool: string; codes: readonly string[] }[]
}
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

/** `reached` undefined = the tool has no reach check; null = the read failed, which
 *  is unchecked like a failed book read. No codes to match is out of reach: fail closed. */
function reachVerdict(
  reached: ReadonlySet<string> | null | undefined,
  codes: readonly string[],
): Shut | null {
  if (reached === undefined) return null
  if (reached === null) return 'unchecked'
  return codes.length === 0 || codes.some((code) => !reached.has(code)) ? 'withheld' : null
}

/** The subject codes of the revealing calls in a chat, once each. */
export const revealedCodes = (chat: readonly MessageCodes[]): string[] => [
  ...new Set(chat.flatMap((m) => m.revealing.flatMap((call) => call.codes))),
]

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
  const revealing = chats.flatMap((chat) => chat.flatMap((m) => m.revealing))
  const reach: Awaited<ReturnType<AssistantToolGate['reachOf']>> =
    revealing.length > 0 ? await gate.reachOf(who, revealing) : new Map()
  const refs = new Map<string, AssistantRef[]>()
  const shut = new Map<string, Shut>()
  for (const chat of chats) {
    let taint: Shut | null = null
    for (const { id, codes, reveals, revealing } of chat) {
      const lacking = reveals.some((p) => p === null || !gate.holds(who, p))
      const reached = revealing.reduce<Shut | null>(
        (acc, call) => worse(acc, reachVerdict(reach.get(call.tool), call.codes)),
        null,
      )
      const own = past.has(id) ? 'unchecked' : verdictOf(codes, found)
      taint = worse(taint, lacking ? 'withheld' : worse(own, reached))
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

/** The re-read sites build a chat's lines here, so none can leave `reveals` out. */
export const chatOf = (
  gate: AssistantToolGate,
  ids: readonly string[],
  calls: ReadonlyMap<string, readonly StoredCall[]>,
): MessageCodes[] =>
  ids.map((id) => {
    const stored = calls.get(id) ?? []
    /* Only a reach-checked reveal re-opens a door that audits its own content read. */
    const revealing = stored
      .filter((c) => c.revealsContent && gate.reaches(c.name))
      .map((c) => ({ tool: c.name, codes: c.codes }))
    return {
      id,
      codes: stored.flatMap((c) => c.codes),
      reveals: gate.revealsOf(stored),
      revealing,
    }
  })

/** A whole chat as `who` reads it now, for the two sites that feed old turns to a
 *  model: the replay (the owner, at the next turn) and the fold (after a turn). */
export async function checkChat(
  gate: AssistantToolGate,
  repo: AssistantRepository,
  who: Actor,
  sessionId: string,
): Promise<{ answers: { id: string; seq: number }[]; shut: ReadonlyMap<string, Shut> }> {
  const answers = await repo.answersOf(sessionId)
  const calls = await repo.callsOf(answers.map((a) => a.id))
  const { shut } = await recheck(
    gate,
    who,
    chatOf(
      gate,
      answers.map((a) => a.id),
      calls,
    ),
  )
  return { answers, shut }
}
