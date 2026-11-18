import type { Lang } from '@/app/i18n'
import { asOf, footerLine } from '@/data/assistant-copy'
import { proposalEnd } from '@/data/assistant-proposal-copy'
import type { AnswerView, ThreadItem } from '@/data/assistant-thread'

/** What the drawer's answer and the page's answer both decide from an answer: its evidence
 *  line, and whether it has anything to draw. Kept apart from the components for fast refresh. */

/** The turn's footer, live or saved; a row with none (a stopped turn) still dates its figures.
 *  Lower case in both, because the drawer prints it after its basis label. */
export const basisOf = (answer: AnswerView, lang: Lang) =>
  answer.footer ? footerLine(answer.footer, lang) : asOf(answer.at, lang)

/** An answer with no text to draw: access withdrawn, no longer shown, or stopped before a word. */
export function quietKind(answer: AnswerView): 'withheld' | 'unchecked' | 'stopped' | null {
  if (answer.withheld) return 'withheld'
  if (answer.unchecked) return 'unchecked'
  return answer.body ? null : 'stopped'
}

/** The answer holds a proposal the person can still press (its card shows a button). */
export const hasPendingProposal = (answer: AnswerView) =>
  answer.proposals.some((p) => proposalEnd(p) === null)

/** A pending proposal is on screen: the box's send button yields the one filled button to it. */
export const threadHasPending = (items: readonly ThreadItem[]) =>
  items.some((item) => item.kind === 'answer' && hasPendingProposal(item.answer))
