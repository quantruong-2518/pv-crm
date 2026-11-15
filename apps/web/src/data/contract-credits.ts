import {
  CONTRACT_CREDITS_MAX,
  CREDIT_TOTAL_BP,
  creditIssues,
  type ContractCredit,
  type CreditIssue,
  type ContractCreditRow,
} from '@pv/contracts'
import { formatNumber } from '@/app/i18n'

/** The sign drawer's split (ADR 0155): what the boxes hold while typing, and
 *  the one place that turns them into the wire list. Percent boxes are text
 *  because "33," is a number half way through being typed. */

export type CreditOther = { actorId: string; percent: string }
export type CreditsDraft = {
  on: boolean
  /** The closer's own box; the closer is fixed, so there is no person to pick. */
  closerPercent: string
  /** One or two more people. */
  others: CreditOther[]
}

export const NO_CREDITS: CreditsDraft = { on: false, closerPercent: '', others: [] }

/** Others beside the closer: three people at most in all. */
export const OTHERS_MAX = CONTRACT_CREDITS_MAX - 1

/** `"33,33"` or `"33.33"` → basis points; `null` for anything else, three decimals included. */
export function bpOfText(text: string): number | null {
  const clean = text.trim().replace(',', '.')
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(clean)) return null
  const bp = Math.round(Number(clean) * 100)
  return bp >= 1 && bp <= CREDIT_TOTAL_BP ? bp : null
}

/** `7000` → `"70%"`, `3333` → `"33,33%"`. */
export const shareText = (bp: number): string =>
  `${formatNumber(bp / 100, undefined, { maximumFractionDigits: 2 })}%`

/** The contract's complaints plus one of the drawer's own: a row with no person yet. */
export type CreditsIssue = CreditIssue | 'person'

export type CreditsState = {
  /** The list for the body; absent while the switch is off or the boxes are not whole. */
  credits: ContractCredit[] | undefined
  /** `true` when the press may go: switch off, or a complete split the contract accepts. */
  ready: boolean
  /** What the boxes add up to, in basis points. */
  total: number
  /** The contract's own complaint beyond the total, when every box is filled. */
  issue: CreditsIssue | null
}

export function creditsState(draft: CreditsDraft, closerId: string): CreditsState {
  if (!draft.on) return { credits: undefined, ready: true, total: 0, issue: null }
  const rows = [
    { actorId: closerId, bp: bpOfText(draft.closerPercent) },
    ...draft.others.map((o) => ({ actorId: o.actorId, bp: bpOfText(o.percent) })),
  ]
  const total = rows.reduce((sum, r) => sum + (r.bp ?? 0), 0)
  const whole = rows.every((r) => r.bp !== null && r.actorId !== '')
  if (!whole) {
    const unchosen =
      total === CREDIT_TOTAL_BP &&
      rows.every((r) => r.bp !== null) &&
      rows.some((r) => r.actorId === '')
    return { credits: undefined, ready: false, total, issue: unchosen ? 'person' : null }
  }
  const credits = rows.map((r) => ({ actorId: r.actorId, shareBp: r.bp ?? 0 }))
  const issues = creditIssues(credits)
  const ready = issues.length === 0 && credits.length >= 2
  return {
    credits: ready ? credits : undefined,
    ready,
    total,
    issue: total === CREDIT_TOTAL_BP ? (issues[0] ?? null) : null,
  }
}

/** `Nari 70% · Vivian 30%`, the split of a signed contract. */
export const creditsLine = (credits: readonly ContractCreditRow[]): string =>
  credits.map((c) => `${c.name} ${shareText(c.shareBp)}`).join(' · ')
