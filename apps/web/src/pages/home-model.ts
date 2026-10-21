import { billions, millions } from '@pv/ui'
import {
  StageKey,
  lastDayOf,
  salesPeriodOf,
  salesPeriodSpan,
  stepSalesPeriod,
  vnDayOf,
  type LeadState,
  type SalesCohort,
  type SalesDayRange,
  type SalesStopReason,
  type WorkstreamBookQuery,
} from '@pv/contracts'
import { DEFAULT_LEAD_BOOK_QUERY, leadBookQueryToParams } from '@/app/url'
import { DEFAULT_OPPORTUNITY_BOOK_QUERY, opportunityBookQueryToParams } from '@/data/opportunities'
import { DEFAULT_WORKSTREAM_BOOK_QUERY, workstreamBookQueryToParams } from '@/data/workstreams'

/** Calculation behind the overview screen (`home.tsx`): how a figure compares
 *  with the period before, and the book addresses its tiles open. The overview's own four-grain picker lives in
 *  `data/period-pick.ts`; the month/quarter picker below is the KPI and cost
 *  screens'. No render, no fetch. */

// ---------------------------------------------------------------------------
// MONTH / QUARTER PICKER — the KPI, cost and config screens import it from here
// ---------------------------------------------------------------------------

export type HomeGrain = 'month' | 'quarter'

/** Both keys are kept so switching grain and back returns to the same period. */
export type PeriodPick = { grain: HomeGrain; month: string; quarter: string }

/** Vietnam is UTC+7 all year. */
export const VN_OFFSET_MS = 7 * 3_600_000

export function currentPick(today = new Date()): PeriodPick {
  const day = vnDayOf(today)
  return {
    grain: 'quarter',
    month: salesPeriodOf('month', day),
    quarter: salesPeriodOf('quarter', day),
  }
}

export const keyOf = (pick: PeriodPick): string => pick[pick.grain]

/** The neighbouring period, or null past the running one. */
export function stepPick(pick: PeriodPick, by: -1 | 1, today = new Date()): PeriodPick | null {
  const next = stepSalesPeriod(keyOf(pick), by)
  if (salesPeriodSpan(next).from > vnDayOf(today)) return null
  return { ...pick, [pick.grain]: next }
}

/** Month or quarter number, then the year. */
export const periodLabel = (key: string): string =>
  key[5] === 'Q'
    ? `Quý ${key.slice(6)} · ${key.slice(0, 4)}`
    : `Tháng ${Number(key.slice(5))} · ${key.slice(0, 4)}`

// ---------------------------------------------------------------------------
// DELTA — against the previous period of the same grain
// ---------------------------------------------------------------------------

export type Delta = { direction: 'up' | 'down' | 'flat'; text: string }

/** Whole numbers stay whole, fractions keep one digit, VN decimal comma (law 6). */
export const num = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 1 })

/** A sum in dong. Under a billion, billions with one digit would round a real
 *  20 million down to zero. */
export const money = (vnd: number) => (vnd >= 1_000_000_000 ? billions(vnd, 1) : millions(vnd, 0))

/** Null when either side is missing: "up from nothing" is not a figure.
 *  `points` takes two ratios and prints the gap in percentage points, because
 *  a "%" after a difference of two rates reads as a relative change; `money`
 *  takes two sums in dong; `count` takes two tallies and prints the plain gap. */
export function deltaOf(
  now: number | null,
  before: number | null,
  unit: 'points' | 'money' | 'count',
): Delta | null {
  if (now === null || before === null) return null
  const diff = now - before
  if (diff === 0) return { direction: 'flat', text: 'Không đổi' }
  const gap = Math.abs(diff)
  const size =
    unit === 'points' ? `${num(gap * 100)} điểm` : unit === 'count' ? num(gap) : money(gap)
  return { direction: diff > 0 ? 'up' : 'down', text: `${diff > 0 ? '+' : '−'}${size}` }
}

/** Null on an empty denominator: a rate over nothing is not 0%. */
export const rateOf = (part: number, whole: number): number | null =>
  whole > 0 ? part / whole : null

/* Steps two to four carry the lead book's score-strip labels (`leads-parts.tsx`).
   The first does not: that strip's first card is the whole book, this is one cohort. */
const COHORT_STEPS = [
  { key: 'leads', label: 'Lead vào sổ' },
  { key: 'firstContacts', label: 'Đã liên hệ lần đầu' },
  { key: 'opportunities', label: 'Thành cơ hội' },
  { key: 'contracts', label: 'Đã ký hợp đồng' },
] as const

/** The cohort as funnel steps; `ratio` is against the step before, null on the first. */
export const funnelOf = (cohort: SalesCohort) =>
  COHORT_STEPS.map((step, i) => {
    const before = COHORT_STEPS[i - 1]
    return {
      ...step,
      count: cohort[step.key],
      ratio: before ? rateOf(cohort[step.key], cohort[before.key]) : null,
    }
  })

/** Deal stops regrouped by the column the deal stood in, in column order;
 *  a column with no stop is left out. Counts are the server's. */
export function stopsByStage(stops: readonly SalesStopReason[]) {
  return StageKey.options
    .map((stage) => ({ stage, reasons: stops.filter((s) => s.stage === stage) }))
    .filter((group) => group.reasons.length > 0)
}

// ---------------------------------------------------------------------------
// WHERE WORK SITS NOW — the overview's own tile
// ---------------------------------------------------------------------------

/** The key holding the most; a tie keeps the earlier key, so pass them in flow order.
 *  Null when every count is zero. `share` is against the sum of all the keys given. */
export function fullestOf<K>(keys: readonly K[], countOf: (key: K) => number) {
  let best: { key: K; count: number } | null = null
  let total = 0
  for (const key of keys) {
    const count = countOf(key)
    total += count
    if (count > (best?.count ?? 0)) best = { key, count }
  }
  return best && { ...best, share: best.count / total }
}

/** The lead book narrowed to one state through `states`, which the server ANDs with
 *  the default `active` tab, so the tab stays out of the address and the column
 *  filter shows the pick. */
export const leadStateHref = (state: LeadState): string =>
  `/sales/leads?${leadBookQueryToParams({ ...DEFAULT_LEAD_BOOK_QUERY, states: state })}`

/** The opportunity book narrowed to the open deals standing in one column. */
export const openStageHref = (stage: StageKey): string =>
  `/sales/opportunities?${opportunityBookQueryToParams({ ...DEFAULT_OPPORTUNITY_BOOK_QUERY, state: 'open', stage })}`

/** The days a period key covers, both ends inclusive: the shape of a performance
 *  response's `span`, for the exits response, which carries only the key. */
export function daysOfPeriod(key: string): SalesDayRange {
  const span = salesPeriodSpan(key)
  return { first: span.from, last: lastDayOf(span) }
}

/** The opportunity book on a state, closed or open; `days` narrows by close day. */
export const dealsHref = (state: 'open' | 'won' | 'lost', days?: SalesDayRange): string =>
  `/sales/opportunities?${opportunityBookQueryToParams({
    ...DEFAULT_OPPORTUNITY_BOOK_QUERY,
    state,
    ...(days && { closedFrom: days.first, closedTo: days.last }),
  })}`

/** Deals stopped for one reason at one column, closed in the period. */
export const stoppedDealsHref = (reason: string, stage: StageKey, days: SalesDayRange): string =>
  `/sales/opportunities?${opportunityBookQueryToParams({
    ...DEFAULT_OPPORTUNITY_BOOK_QUERY,
    state: 'lost',
    stopReason: reason,
    stoppedStage: stage,
    closedFrom: days.first,
    closedTo: days.last,
  })}`

/** The lead book on every lead that entered in the period, whatever its state now. */
export const enteredLeadsHref = (days: SalesDayRange): string =>
  `/sales/leads?${leadBookQueryToParams({
    ...DEFAULT_LEAD_BOOK_QUERY,
    state: 'all',
    createdFrom: days.first,
    createdTo: days.last,
  })}`

const NURTURING_HREF = '/sales/nurturing'

/** Leads parked in the nurturing pool for one reason in the period. */
export const exitedLeadsHref = (reason: string, days: SalesDayRange): string => {
  const params = new URLSearchParams({
    tab: 'lead',
    exitReason: reason,
    exitedFrom: days.first,
    exitedTo: days.last,
  })
  return `${NURTURING_HREF}?${params}`
}

/** The pool's tab of contracts that were terminated. */
export const NURTURING_CONTRACTS_HREF = `${NURTURING_HREF}?tab=contract`

// ---------------------------------------------------------------------------
// THE WORKSTREAM BOOK — where the runs tile sends the reader
// ---------------------------------------------------------------------------

/** The book at its default view. */
export const WORKSTREAM_BOOK_HREF = '/sales/workstreams'

/** The two questions the runs tile counts. The tile reads their `total` and
 *  links the same params, so a number always equals the list it opens. */
export const stoppedRunsQuery = (days: SalesDayRange): WorkstreamBookQuery => ({
  ...DEFAULT_WORKSTREAM_BOOK_QUERY,
  status: 'closed',
  stopped: true,
  closedFrom: days.first,
  closedTo: days.last,
})

export const liveRunsQuery = (days: SalesDayRange): WorkstreamBookQuery => ({
  ...DEFAULT_WORKSTREAM_BOOK_QUERY,
  status: 'all',
  liveFrom: days.first,
  liveTo: days.last,
})

export const runsHref = (query: WorkstreamBookQuery): string =>
  `${WORKSTREAM_BOOK_HREF}?${workstreamBookQueryToParams(query)}`
