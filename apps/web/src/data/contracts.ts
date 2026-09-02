import {
  SAO_DO_CONTRACTS,
  SAO_DO_FROZEN_AT,
  type Contract,
  type Installment,
  type ConditionSide,
  type InstallmentCondition,
} from '@pv/engines/fixtures/sao-do'
import { daysUntil, dueLevelOf, needsAttention, type Actor, type DueLevel } from '@pv/engines'

/** Read side of the contract book, still on the frozen scenario.
 *
 *  Every function here is shaped like the endpoint that will replace it, so the
 *  cut-over is mechanical: `contractBook` becomes `GET /sales/contracts`,
 *  `contractOf` becomes `GET /sales/contracts/:code`, and the screens keep the
 *  same fields. What must NOT move to the server is the derivation — level,
 *  days left, which condition blocks — because those already live in
 *  `@pv/engines/contract-due` and both sides have to read the same answer.
 *
 *  The scope cut is done HERE rather than in the screen. A screen that filters
 *  its own rows is a screen that forgets to, and the row it forgets belongs to
 *  someone else. */

/** The scenario is frozen, so "today" is a constant rather than a clock read.
 *  Every level on these screens is computed against this one instant. */
export const TODAY = SAO_DO_FROZEN_AT

export type { Contract, ConditionSide, Installment, InstallmentCondition }

/** What one installment looks like once the ladder has been applied to it. */
export type InstallmentView = {
  installment: Installment
  level: DueLevel
  /** Positive = days remaining, negative = days slipped. */
  daysLeft: number
  doneConditions: number
  totalConditions: number
  /** The single condition holding this installment up — the one that is late and
   *  furthest past its date. `null` once nothing is late.
   *
   *  ONE, not a list: a screen that shows three blockers gives the reader a
   *  sorting job. The other late lines are still in the checklist below. */
  blocking: InstallmentCondition | null
}

export function viewInstallment(installment: Installment, today = TODAY): InstallmentView {
  const late = installment.conditions
    .filter((c) => !c.doneAt && daysUntil(c.due, today) <= 0)
    .sort((a, b) => daysUntil(a.due, today) - daysUntil(b.due, today))

  return {
    installment,
    level: dueLevelOf(installment.due, today, installment.paidAt),
    daysLeft: daysUntil(installment.due, today),
    doneConditions: installment.conditions.filter((c) => c.doneAt).length,
    totalConditions: installment.conditions.length,
    blocking: late[0] ?? null,
  }
}

/** One row of the book: the contract plus the numbers the row actually prints.
 *  Computed once here so the list and the detail screen cannot drift apart. */
export type ContractRow = {
  contract: Contract
  collected: number
  /** Signed value minus what has already landed. */
  remaining: number
  /** Unpaid and already at or past its date — the money someone must chase. */
  overdue: number
  /** The next installment that is not yet paid, in date order. */
  next: InstallmentView | null
  /** Whether anything on this contract wants attention today. */
  urgent: boolean
}

function rowOf(contract: Contract, today: string): ContractRow {
  const collected = contract.installments.filter((d) => d.paidAt).reduce((n, d) => n + d.amount, 0)

  const unpaid = contract.installments
    .filter((d) => !d.paidAt)
    .sort((a, b) => a.due.localeCompare(b.due))

  const next = unpaid[0] ? viewInstallment(unpaid[0], today) : null
  const overdue = unpaid
    .filter((d) => daysUntil(d.due, today) <= 0)
    .reduce((n, d) => n + d.amount, 0)

  return {
    contract,
    collected,
    remaining: contract.amount - collected,
    overdue,
    next,
    urgent: next ? needsAttention(next.level) : false,
  }
}

export type ContractBook = {
  rows: ContractRow[]
  /** Rows dropped by the scope axis, not by the role axis. The screen says so
   *  out loud: a Sale who cannot see a colleague's contract should be told which
   *  axis stopped them, because asking for a wider role will not open it. */
  hiddenByScope: number
  totals: {
    value: number
    collected: number
    overdue: number
    /** Conditions past their date across every visible contract, split by side
     *  so the tile can say which side of the table is holding things up. */
    lateOurs: number
    lateTheirs: number
  }
}

/** The book as one actor sees it.
 *
 *  `ownOnly` is E2's third axis and it is the only filter applied: role and
 *  branch are checked at the door by `RequireAccess`, and re-checking them here
 *  would let the two disagree. */
export function contractBook(actor: Actor | null, today = TODAY): ContractBook {
  const mine = actor?.ownOnly
    ? SAO_DO_CONTRACTS.filter((c) => c.ownerId === actor.id)
    : SAO_DO_CONTRACTS

  const rows = mine
    .map((c) => rowOf(c, today))
    .sort((a, b) => Number(b.urgent) - Number(a.urgent) || b.overdue - a.overdue)

  const lateConditions = rows
    .flatMap((r) => r.contract.installments)
    .flatMap((d) => d.conditions)
    .filter((c) => !c.doneAt && daysUntil(c.due, today) <= 0)

  return {
    rows,
    hiddenByScope: SAO_DO_CONTRACTS.length - mine.length,
    totals: {
      value: rows.reduce((n, r) => n + r.contract.amount, 0),
      collected: rows.reduce((n, r) => n + r.collected, 0),
      overdue: rows.reduce((n, r) => n + r.overdue, 0),
      lateOurs: lateConditions.filter((c) => c.side === 'ta').length,
      lateTheirs: lateConditions.filter((c) => c.side === 'khách').length,
    },
  }
}

/** One contract, or `null` when the code is unknown OR out of this actor's
 *  scope. Both cases collapse on purpose: telling someone a contract exists but
 *  is not theirs leaks the customer list. */
export function contractOf(code: string, actor: Actor | null): Contract | null {
  const found = SAO_DO_CONTRACTS.find((c) => c.code === code)
  if (!found) return null
  if (actor?.ownOnly && found.ownerId !== actor.id) return null
  return found
}

export function installmentOf(contract: Contract, no: number): Installment | null {
  return contract.installments.find((d) => d.no === no) ?? null
}

/** Vietnamese label of a level. Kept beside the ladder rather than inside a
 *  component because three screens print it and they must all read the same. */
export const DUE_LABEL: Record<DueLevel, string> = {
  'đã-xong': 'Đã thu',
  'chưa-tới': 'Chưa tới',
  'gần-hạn': 'Gần hạn',
  'đến-hạn': 'Đến hạn',
  'quá-hạn': 'Quá hạn',
  'quá-hạn-lâu': 'Quá hạn lâu',
}

/** How many days, said the way a person would say it. */
export function daysPhrase(daysLeft: number): string {
  if (daysLeft > 0) return `còn ${daysLeft} ngày`
  if (daysLeft === 0) return 'đến hạn hôm nay'
  return `trễ ${-daysLeft} ngày`
}
