import { queryOptions } from '@tanstack/react-query'
import {
  PageQuery,
  type ConditionSide,
  type ContractBookResponse,
  type ContractDetailResponse,
  type ContractRow,
  type ContractSummary,
  type InstallmentConditionRow,
  type InstallmentRow,
  type InstallmentSummaryRow,
} from '@pv/contracts'
import { daysUntil, dueLevelOf, needsAttention, systemClock, type DueLevel } from '@pv/engines'
import { api, type ApiNeed } from '@/app/api'

/** Read side of the contract book — on the server, no fixture left.
 *
 *  No query here carries `load:`, and by the ritual in `app/api/client.ts` that
 *  absence IS the cut: `load` means the query still reads a frozen scenario.
 *
 *  What did NOT move to the server is the derivation — level, days left, which
 *  condition blocks. It stays in `@pv/engines/contract-due` because the daily
 *  sweep and this screen have to read the same level for the same day, and the
 *  only way to guarantee that is one function.
 *
 *  What DID move is the scope cut. `hidden` on the paged response is the
 *  server's receipt for rows it dropped by owner, so no screen filters rows it
 *  never held. */

/** Today, ISO date. The scenario is no longer frozen, so the ladder is read
 *  against the real clock — and the read happens HERE: `@pv/engines` takes
 *  `today` from its caller precisely so the browser and the server sweep can be
 *  told apart. */
export const today = () => systemClock().slice(0, 10)

export type { ConditionSide }

/** Wire shapes under the names three screens and `components/contract-bits`
 *  already spell. Aliases rather than a rename so the cut lands in this file
 *  instead of in every call site. */
export type Contract = ContractDetailResponse
export type Installment = InstallmentRow
export type InstallmentCondition = InstallmentConditionRow

/** Anything the ladder can read: the book's lean row or the detail's full one.
 *  `conditions` is optional because `GET /sales/contracts` deliberately does not
 *  ship the checklist — see `InstallmentSummaryRow` in `@pv/contracts`. */
export type InstallmentLike = InstallmentSummaryRow & { conditions?: InstallmentConditionRow[] }

/** What one installment looks like once the ladder has been applied to it. */
export type InstallmentView<T extends InstallmentLike = InstallmentLike> = {
  installment: T
  level: DueLevel
  /** Positive = days remaining, negative = days slipped. */
  daysLeft: number
  doneConditions: number
  totalConditions: number
  /** The single condition holding this installment up — the one that is late and
   *  furthest past its date. `null` once nothing is late, and ALWAYS `null` on a
   *  book row, which carries no checklist to look at.
   *
   *  ONE, not a list: a screen that shows three blockers gives the reader a
   *  sorting job. The other late lines are still in the checklist below. */
  blocking: InstallmentCondition | null
}

export function viewInstallment<T extends InstallmentLike>(
  installment: T,
  now = today(),
): InstallmentView<T> {
  const conditions = installment.conditions ?? []
  const late = conditions
    .filter((c) => !c.doneAt && daysUntil(c.due, now) <= 0)
    .sort((a, b) => daysUntil(a.due, now) - daysUntil(b.due, now))

  return {
    installment,
    level: dueLevelOf(installment.due, now, installment.paidAt),
    daysLeft: daysUntil(installment.due, now),
    doneConditions: conditions.filter((c) => c.doneAt).length,
    totalConditions: conditions.length,
    blocking: late[0] ?? null,
  }
}

/** One row of the book: the wire row plus the numbers the row actually prints.
 *  Computed once here so the list and the detail screen cannot drift apart. */
export type ContractBookRow = {
  contract: ContractRow
  collected: number
  /** Signed value minus what has already landed. */
  remaining: number
  /** Unpaid and already at or past its date — the money someone must chase. */
  overdue: number
  /** The next installment that is not yet paid, in date order. */
  next: InstallmentView<InstallmentSummaryRow> | null
  /** Whether anything on this contract wants attention today. */
  urgent: boolean
}

/** Both `amount` and `installments` are nullable on the wire, and both nulls are
 *  real rows rather than bad data: a contract signed before anyone drafted a
 *  schedule has neither. They read as zero here instead of as a crash. */
export function rowOf(contract: ContractRow, now = today()): ContractBookRow {
  const installments = contract.installments ?? []
  const collected = installments.filter((d) => d.paidAt).reduce((n, d) => n + d.amount, 0)

  const unpaid = installments.filter((d) => !d.paidAt).sort((a, b) => a.due.localeCompare(b.due))

  const next = unpaid[0] ? viewInstallment(unpaid[0], now) : null
  const overdue = unpaid.filter((d) => daysUntil(d.due, now) <= 0).reduce((n, d) => n + d.amount, 0)

  return {
    contract,
    collected,
    remaining: (contract.amount ?? 0) - collected,
    overdue,
    next,
    urgent: next ? needsAttention(next.level) : false,
  }
}

/** One page of the book, derived and sorted by urgency rather than by signing
 *  date — a book sorted by date makes the reader scan for red, a book sorted by
 *  urgency has already scanned for them.
 *
 *  The sort stays on this side because `GET /sales/contracts` takes no sort key
 *  and urgency is a derived level the server never ships. It therefore orders
 *  the PAGE, not the book; the day the book outgrows one page, the sort has to
 *  move into SQL along with the level. */
export function bookRowsOf(page: ContractBookResponse, now = today()): ContractBookRow[] {
  return page.rows
    .map((c) => rowOf(c, now))
    .sort((a, b) => Number(b.urgent) - Number(a.urgent) || b.overdue - a.overdue)
}

export function installmentOf(contract: Contract, no: number): Installment | null {
  return contract.installments.find((d) => d.no === no) ?? null
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const CONTRACT_BOOK_KEY = ['sales', 'contract-book'] as const

/** The two axes `ContractController` declares on both read doors. `scoped` cuts
 *  nothing here — the browser holds no rows and must never be what decides; it
 *  is the DECLARATION, so a route whose scope axis is on and a query that forgot
 *  it can be spotted by diffing two lines. */
const BOOK_NEED: ApiNeed = { branch: 'Sales', permission: 'hợp-đồng.xem', scoped: true }

/** Built by the contract rather than typed out, so a new required field fails at
 *  module load instead of falling back to something invented. */
export const DEFAULT_CONTRACT_PAGE: PageQuery = PageQuery.parse({})

/** The book, one page at a time — `{ rows, total, hidden }`, the shape of
 *  `paged()`. Takes the page so `queryKey` carries it; without that, TanStack
 *  hands page 1's cache to page 2. */
export const contractBookQuery = (page: PageQuery = DEFAULT_CONTRACT_PAGE) =>
  queryOptions({
    queryKey: [...CONTRACT_BOOK_KEY, 'page', page] as const,
    queryFn: ({ signal }) =>
      api.read<ContractBookResponse>(`/sales/contracts?page=${page.page}&size=${page.size}`, {
        need: BOOK_NEED,
        signal,
      }),
  })

/** One contract, fully nested. `encodeURIComponent` is not decoration: a
 *  contract code carries a letter outside `A-Z`, which is not URL-safe. */
export const contractDetailQuery = (code: string) =>
  queryOptions({
    queryKey: [...CONTRACT_BOOK_KEY, 'one', code] as const,
    queryFn: ({ signal }) =>
      api.read<ContractDetailResponse>(`/sales/contracts/${encodeURIComponent(code)}`, {
        need: BOOK_NEED,
        signal,
      }),
  })

/** The whole book folded to one row of numbers — sums over EVERY contract, not
 *  over the page the screen is holding.
 *
 *  NOT `scoped`, copying the door's own declaration and the two scorecards
 *  before it: these are the desk's numbers, and cutting them by who holds what
 *  makes everyone read a different figure under one label. The consequence has
 *  to be said out loud on screen — for a role that only sees its own rows,
 *  `signedCount` here is larger than the book below it. */
export const contractSummaryQuery = queryOptions({
  queryKey: [...CONTRACT_BOOK_KEY, 'summary'] as const,
  queryFn: ({ signal }) =>
    api.read<ContractSummary>('/sales/contracts/summary', {
      need: { branch: 'Sales', permission: 'hợp-đồng.xem' },
      signal,
    }),
  staleTime: 60 * 1000,
})

// ---------------------------------------------------------------------------
// How a level reads on screen
// ---------------------------------------------------------------------------

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
