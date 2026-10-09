import { billions, millions } from '@pv/ui'
import type { SalesCohort, WorkstreamBookQuery, WorkstreamStandKind } from '@pv/contracts'
import { DEFAULT_WORKSTREAM_BOOK_QUERY, workstreamBookQueryToParams } from '@/data/workstreams'

/** Calculation behind the overview screen (`home.tsx`): which period is
 *  picked, how a figure compares with the period before, and which question
 *  the short list asks the workstream book. No render, no fetch. */

// ---------------------------------------------------------------------------
// PERIOD — a calendar month or quarter, one remembered key per grain
// ---------------------------------------------------------------------------

export type HomeGrain = 'month' | 'quarter'

/** Keys are `SalesPeriodKey`s: `2026-10` · `2026-Q4`. Both are kept so
 *  switching grain and back returns to the same period. */
export type PeriodPick = { grain: HomeGrain; month: string; quarter: string }

const PER_YEAR = { month: 12, quarter: 4 }

const grainOf = (key: string): HomeGrain => (key.includes('Q') ? 'quarter' : 'month')

const nthOf = (key: string) => Number(key.slice(grainOf(key) === 'quarter' ? 6 : 5))

/** A period as a count of its grain since year 0, so stepping is plus or minus one. */
const indexOf = (key: string) => Number(key.slice(0, 4)) * PER_YEAR[grainOf(key)] + nthOf(key) - 1

function keyAt(grain: HomeGrain, index: number): string {
  const year = Math.floor(index / PER_YEAR[grain])
  const nth = (index % PER_YEAR[grain]) + 1
  return grain === 'quarter' ? `${year}-Q${nth}` : `${year}-${String(nth).padStart(2, '0')}`
}

const quarterOf = (month: string) =>
  `${month.slice(0, 4)}-Q${Math.ceil(Number(month.slice(5)) / 3)}`

/** Vietnam is UTC+7 all year; the API fences periods on Vietnam days. */
const VN_OFFSET_MS = 7 * 3_600_000

/** The month and the quarter `today` falls in on the Vietnam calendar, so the
 *  running period is the same one for every reader, whatever their clock. */
export function currentPick(today = new Date()): PeriodPick {
  const vn = new Date(today.getTime() + VN_OFFSET_MS)
  const month = keyAt('month', vn.getUTCFullYear() * PER_YEAR.month + vn.getUTCMonth())
  return { grain: 'quarter', month, quarter: quarterOf(month) }
}

export const keyOf = (pick: PeriodPick): string => pick[pick.grain]

/** The neighbouring period, or null past the running one: nothing has been
 *  measured there yet. Backwards is unbounded. */
export function stepPick(pick: PeriodPick, by: -1 | 1, today = new Date()): PeriodPick | null {
  const index = indexOf(keyOf(pick)) + by
  if (index > indexOf(currentPick(today)[pick.grain])) return null
  return { ...pick, [pick.grain]: keyAt(pick.grain, index) }
}

export const previousKey = (key: string) => keyAt(grainOf(key), indexOf(key) - 1)

/** The picker's long label: month or quarter number, then the year. */
export const periodLabel = (key: string) =>
  `${grainOf(key) === 'quarter' ? 'Quý' : 'Tháng'} ${nthOf(key)} · ${key.slice(0, 4)}`

/** 'T10' · 'Q4' */
export const periodShort = (key: string) => `${grainOf(key) === 'quarter' ? 'Q' : 'T'}${nthOf(key)}`

/** Whether a calendar month lies inside the period: itself, or its quarter. */
export const monthInPeriod = (month: string, period: string) =>
  period === month || period === quarterOf(month)

// ---------------------------------------------------------------------------
// DELTA — against the previous period of the same grain
// ---------------------------------------------------------------------------

export type Delta = { direction: 'up' | 'down' | 'flat'; text: string }

/** Whole numbers stay whole, fractions keep one digit, VN decimal comma (law 6). */
export const num = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 1 })

/** Null when either side is missing: "up from nothing" is not a figure.
 *  `points` takes two ratios and prints the gap in percentage points, because
 *  a "%" after a difference of two rates reads as a relative change; `money`
 *  takes two sums in dong. */
export function deltaOf(
  now: number | null,
  before: number | null | undefined,
  unit: 'count' | 'points' | 'money',
): Delta | null {
  if (now === null || before === null || before === undefined) return null
  const diff = now - before
  if (diff === 0) return { direction: 'flat', text: 'Không đổi' }
  const gap = Math.abs(diff)
  /* Under a billion the tile's own unit would round a real gap down to zero. */
  const money = gap >= 1_000_000_000 ? billions(gap, 1) : millions(gap, 0)
  const size = unit === 'points' ? `${num(gap * 100)} điểm` : unit === 'money' ? money : num(gap)
  return { direction: diff > 0 ? 'up' : 'down', text: `${diff > 0 ? '+' : '−'}${size}` }
}

/** Null on an empty denominator: a rate over nothing is not 0%. */
export const rateOf = (part: number, whole: number): number | null =>
  whole > 0 ? part / whole : null

/* Steps two to four carry the lead book's score-strip labels (`leads-parts.tsx`).
   The first does not: that strip's first card is the whole book, this is one cohort. */
const COHORT_STEPS = [
  { key: 'leads', label: 'Lead vào sổ' },
  { key: 'firstMeetings', label: 'Đã liên hệ lần đầu' },
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

// ---------------------------------------------------------------------------
// THE SHORT LIST — one filter at a time, set by a tile
// ---------------------------------------------------------------------------

/** A stage filter is a LIVE rung: `kind`, `key` and `label` are copied from
 *  the workstream scorecard, never from a frozen fixture row. */
export type ListFilter =
  { by: 'overdue' } | { by: 'stage'; kind: WorkstreamStandKind; key: string; label: string }

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
    ...(filter?.by === 'stage' ? { standKind: filter.kind, standKey: filter.key } : {}),
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
