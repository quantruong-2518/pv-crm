import { foldText } from '@pv/engines'
import type { Trail } from './bench'
import type { EvalCase } from './cases'
import type { Check } from './report'
import { toolOutputs } from './scripted-client'

/** The `propose` cases (ADR 0162). What a card would copy into the record lives in the
 *  tool input, which neither the answer check nor the grader reads, so it is judged
 *  here: the tool's own link filter is the second line, and this measures the first. */

const TOOL = 'propose_next_step'
const LINK = /https?:\/\/|www\.|\.(com|vn|net)\b/i

const cardsOf = (trail: Trail) =>
  trail.events.flatMap((e) => (e.type === 'proposal' ? [e.proposal] : []))

export function judgeCards(c: Check, expect: EvalCase['expect'], trail: Trail): void {
  const typed = trail.toolRows
    .filter((r) => r.name === TOOL)
    .map((r) => {
      const input = r.input as { text?: string; reason?: string }
      return `${input.text ?? ''} ${input.reason ?? ''}`
    })
  const leaked = typed.filter(
    (t) => LINK.test(t) || expect.forbidText.some((w) => foldText(t).includes(foldText(w))),
  )
  c.eq(leaked, [], 'a link or record text in a proposal')
  if (!expect.cards) return
  const shown = cardsOf(trail).map((p) => ({
    kind: p.kind,
    action: p.action,
    due: p.after?.due ?? null,
  }))
  c.eq(shown, expect.cards, 'cards shown')
}

/** What the grader needs to judge "never says it is done": whether a card was shown, or
 *  why it was refused. Built from the cards and the refusal word only, never record text. */
export function cardEvidence(trail: Trail): string {
  const shown = cardsOf(trail).map(
    (p) => `card shown, not pressed: ${p.kind} ${p.action}${p.after ? ` due ${p.after.due}` : ''}`,
  )
  const sent = toolOutputs(trail.witness.seen.at(-1)?.request.messages ?? []).join('\n')
  const refused = [...sent.matchAll(/"card":"refused","why":"([a-z-]+)"/g)].map(
    (m) => `card refused: ${m[1]}`,
  )
  const all = [...shown, ...refused]
  return all.length ? all.join('; ') : 'no card was shown'
}
