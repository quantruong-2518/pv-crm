import { queryOptions } from '@tanstack/react-query'
import {
  PageQuery,
  type ContractBookQuery,
  type ConditionSide,
  ContractBookResponse,
  ContractCollectorCandidates,
  ContractDetailResponse,
  ContractSummary,
  ContractTerminationReasons,
  type ContractRow,
  type InstallmentConditionRow,
  type InstallmentRow,
  type InstallmentSummaryRow,
  type RecordChannel,
} from '@pv/contracts'
import { daysUntil, dueLevelOf, needsAttention, type DueLevel } from '@pv/engines'
import { api, type ApiNeed } from '@/app/api'
import { cacheTier } from '@/app/query-client'
import { bookQueryParams, keepPageUnderSameFilters } from '@/app/book-query'
import { vnToday } from '@/data/opportunities'
import { getLang, message, translate, type Lang, type Message } from '@/app/i18n'

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

/** Today as a Vietnam calendar day — the server's day boundary, so a due today
 *  is not yet late. The scenario is no longer frozen, so the ladder is read
 *  against the real clock — and the read happens HERE: `@pv/engines` takes
 *  `today` from its caller precisely so the browser and the server sweep can be
 *  told apart. */
export const today = vnToday

const OVERDUE = new Set<DueLevel>(['overdue', 'long-overdue'])
export const overdue = (level: DueLevel | null | undefined): level is DueLevel =>
  level !== null && level !== undefined && OVERDUE.has(level)

/** The level itself when it is overdue, else null — the one reading of "late"
 *  shared by the workstream tree and the deal book. */
export const lateLevel = (level: DueLevel | null | undefined) => (overdue(level) ? level : null)

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
    .filter((c) => !c.doneAt && daysUntil(c.due, now) < 0)
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
  /** Unpaid and already past its date — the money someone must chase. */
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
  /* A terminated contract owes nothing more (ADR 0107), so no row reads it as receivable. */
  if (contract.termination) {
    return { contract, collected, remaining: 0, overdue: 0, next: null, urgent: false }
  }

  const unpaid = installments.filter((d) => !d.paidAt).sort((a, b) => a.due.localeCompare(b.due))

  const next = unpaid[0] ? viewInstallment(unpaid[0], now) : null
  const overdue = unpaid.filter((d) => daysUntil(d.due, now) < 0).reduce((n, d) => n + d.amount, 0)

  return {
    contract,
    collected,
    remaining: (contract.amount ?? 0) - collected,
    overdue,
    next,
    urgent: next ? needsAttention(next.level) : false,
  }
}

/** One page of the book, derived. The ORDER is the server's (`sort`/`dir` on
 *  `ContractBookQuery`) — re-sorting the page here would fight the column the
 *  reader just clicked. */
export function bookRowsOf(page: ContractBookResponse, now = today()): ContractBookRow[] {
  return page.rows.map((c) => rowOf(c, now))
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
const BOOK_NEED: ApiNeed = { branch: 'Sales', permission: 'contract.view', scoped: true }

/** Built by the contract rather than typed out, so a new required field fails at
 *  module load instead of falling back to something invented. */
export const DEFAULT_CONTRACT_PAGE: PageQuery = PageQuery.parse({})

/** The book, one filtered page at a time — `{ rows, total, hidden }`, the shape
 *  of `paged()`. The whole query rides the `queryKey`; without it TanStack
 *  hands page 1's cache to page 2 and an old filter's rows to a new one. Callers
 *  that only page (the home scan) pass `{ page, size }` and take the defaults. */
export const contractBookQuery = (
  query: PageQuery & Partial<ContractBookQuery> = DEFAULT_CONTRACT_PAGE,
) =>
  queryOptions({
    placeholderData: keepPageUnderSameFilters(query),
    queryKey: [...CONTRACT_BOOK_KEY, 'page', query] as const,
    queryFn: ({ signal }) => {
      const params = bookQueryParams(query)
      return api.read<ContractBookResponse>(`/sales/contracts?${params}`, {
        need: BOOK_NEED,
        schema: ContractBookResponse,
        signal,
      })
    },
  })

/** One contract, fully nested. `encodeURIComponent` is not decoration: a
 *  contract code carries a letter outside `A-Z`, which is not URL-safe. */
export const contractDetailQuery = (code: string) =>
  queryOptions({
    queryKey: [...CONTRACT_BOOK_KEY, 'one', code] as const,
    queryFn: ({ signal }) =>
      api.read<ContractDetailResponse>(`/sales/contracts/${encodeURIComponent(code)}`, {
        need: BOOK_NEED,
        schema: ContractDetailResponse,
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
      need: { branch: 'Sales', permission: 'contract.view' },
      schema: ContractSummary,
      signal,
    }),
  ...cacheTier.aggregate,
})

/** `GET /sales/contracts/termination-reasons` — the active
 *  `CONTRACT_TERMINATION_REASON` list. Its own key, outside the book's, so a
 *  book refresh does not re-read a reference list. */
export const contractTerminationReasonsQuery = queryOptions({
  queryKey: ['sales', 'contract-termination-reasons'] as const,
  queryFn: ({ signal }) =>
    api.read<ContractTerminationReasons>('/sales/contracts/termination-reasons', {
      need: { branch: 'Sales', permission: 'contract.terminate' },
      schema: ContractTerminationReasons,
      signal,
    }),
  ...cacheTier.reference,
})

/** `GET /sales/contracts/collector-candidates` — who may be picked as the
 *  payment PIC. Gated by the signer's permission (`opportunity.close`), not the
 *  PIC's, because the reader is whoever creates the contract. */
export const contractCollectorCandidatesQuery = queryOptions({
  queryKey: ['sales', 'contract-collector-candidates'] as const,
  queryFn: ({ signal }) =>
    api.read<ContractCollectorCandidates>('/sales/contracts/collector-candidates', {
      need: { branch: 'Sales', permission: 'opportunity.close' },
      schema: ContractCollectorCandidates,
      signal,
    }),
  ...cacheTier.reference,
})

// ---------------------------------------------------------------------------
// How a level reads on screen
// ---------------------------------------------------------------------------

/** The one sentence a reader without write rights gets on a contract (ADR 0110).
 *  With nobody holding it, only the head of sales and the director are named.
 *  `collects` is the payment PIC: they do get the collect button, so the line
 *  says what they may do instead of "view only". */
export function contractReadOnlyNote(
  holder: string | null | undefined,
  collects = false,
  lang: Lang = getLang(),
): string {
  const m = (vi: string, en: string, ko: string) => translate(message(vi, en, ko), lang)
  if (collects) {
    return m(
      'Bạn được ghi thu tiền, không sửa được hợp đồng này.',
      'You can record payments but cannot edit this contract.',
      '수납 기록은 할 수 있지만 이 계약은 수정할 수 없습니다.',
    )
  }
  return holder
    ? m(
        `Bạn chỉ xem được hợp đồng này. ${holder}, trưởng phòng hoặc giám đốc mới sửa được.`,
        `You can only view this contract. Only ${holder}, the head of sales or the director can edit it.`,
        `이 계약은 조회만 가능합니다. ${holder}, 영업팀장 또는 이사만 수정할 수 있습니다.`,
      )
    : m(
        'Trưởng phòng hoặc giám đốc mới sửa được hợp đồng này.',
        'Only the head of sales or the director can edit this contract.',
        '영업팀장 또는 이사만 이 계약을 수정할 수 있습니다.',
      )
}

/** How many days, said the way a person would say it. */
export function daysPhrase(daysLeft: number, lang: Lang = getLang()): string {
  const m = (vi: string, en: string, ko: string) => translate(message(vi, en, ko), lang)
  if (daysLeft > 0) return m(`còn ${daysLeft} ngày`, `${daysLeft} days left`, `${daysLeft}일 남음`)
  if (daysLeft === 0) return m('đến hạn hôm nay', 'due today', '오늘 기한')
  return m(`trễ ${-daysLeft} ngày`, `${-daysLeft} days late`, `${-daysLeft}일 지연`)
}

/** How the desk chased an installment — the one map every screen prints. */
export const RECORD_CHANNEL_LABEL: Record<RecordChannel, Message> = {
  email: message('Gửi mail', 'Send email', '메일 발송'),
  'zalo-oa': message('Zalo', 'Zalo', 'Zalo'),
  'in-app': message('Nhắn trong PV One', 'Message in PV One', 'PV One 내 메시지'),
  call: message('Gọi điện', 'Phone call', '전화'),
}

/** Which side owes an unlock condition, as the drawer and its dialogs say it. */
export const CONDITION_SIDE_LABEL: Record<ConditionSide, Message> = {
  ours: message('Bên mình', 'Our side', '우리 측'),
  customer: message('Bên khách', 'Customer side', '고객 측'),
}

/** Every query key a header, a tab or a shared link can set — what "clear all" resets. */
export const CONTRACT_FILTER_KEYS = [
  'status',
  'owner',
  'kind',
  'signedFrom',
  'signedTo',
  'dueFrom',
  'dueTo',
  'amountMin',
  'amountMax',
] as const satisfies readonly (keyof ContractBookQuery)[]

/** The customer column also shows the contract kind, so its header names both. */
export const CUSTOMER_HEADER = message(
  'Khách hàng / Loại hợp đồng',
  'Customer / Contract type',
  '고객 / 계약 유형',
)

/** Why a contract shows no closer: the dash's tooltip and the filter's "nobody" option. */
export const NO_CLOSER = message('Chưa có người chốt', 'No closer yet', '체결 담당자 없음')

/** Where a contract stands in collecting — the ONE rule, said the way the
 *  book's tabs say it (the contract itself stores no state): any installment
 *  overdue, else every one paid, else still collecting. Both the contract
 *  screens (off due levels) and the deal's cards (off the money block's
 *  statuses) reduce their rows to these two flags and call it. */
export type Standing = { tone: 'danger' | 'success' | 'running' }

export function standingOf(rows: { overdue: boolean; paid: boolean }[]): Standing {
  if (rows.some((r) => r.overdue)) return { tone: 'danger' }
  if (rows.length > 0 && rows.every((r) => r.paid)) return { tone: 'success' }
  return { tone: 'running' }
}
