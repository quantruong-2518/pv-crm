import { billions, millions } from '@pv/ui'
import {
  StageKey,
  salesPeriodOf,
  salesPeriodSpan,
  stepSalesPeriod,
  vnDayOf,
  type SalesCohort,
  type SalesStopReason,
  type WorkstreamBookQuery,
} from '@pv/contracts'
import { DEFAULT_WORKSTREAM_BOOK_QUERY, workstreamBookQueryToParams } from '@/data/workstreams'

/** Calculation behind the overview screen (`home.tsx`): how a figure compares
 *  with the period before, and which question the short list asks the
 *  workstream book. The overview's own four-grain picker lives in
 *  `home-period.ts`; the month/quarter picker below is the KPI and cost
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
// THE SHORT LIST — one filter at a time, set by a tile
// ---------------------------------------------------------------------------

/** The list has one narrowing, set by the overdue tile or tab; null shows every open run. */
export type ListFilter = { by: 'overdue' }

/** Rows the overview shows before sending the reader to the book. */
export const LIST_ROWS = 3

/** The book's own priority ladder over open runs, narrowed by the tile filter
 *  with the same params the book's score strip sends. */
export function listQueryOf(filter: ListFilter | null): WorkstreamBookQuery {
  return {
    ...DEFAULT_WORKSTREAM_BOOK_QUERY,
    status: 'open',
    sort: 'priority',
    size: LIST_ROWS,
    ...(filter?.by === 'overdue' ? { overdue: true } : {}),
  }
}

/** The book opened on the same filter, at the book's own page size. */
export function bookHrefOf(filter: ListFilter | null): string {
  const params = workstreamBookQueryToParams({
    ...listQueryOf(filter),
    size: DEFAULT_WORKSTREAM_BOOK_QUERY.size,
  })
  return params === '' ? '/sales/workstreams' : `/sales/workstreams?${params}`
}
