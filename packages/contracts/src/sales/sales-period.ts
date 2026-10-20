/** Calendar arithmetic for the overview's four period grains, shared so the
 *  web picker and the API's SQL fence agree on one week, one month, one cut.
 *
 *  Keys: `2026-W43` (ISO week, Monday first) · `2026-10` · `2026-Q4` · `2026`.
 *  Days are `YYYY-MM-DD` and a span's `to` is exclusive. Day numbers come from
 *  `Date.UTC`, which reads no zone, so every clock gets the same answer. */

export type SalesGrain = 'week' | 'month' | 'quarter' | 'year'

/** `from` inclusive, `to` exclusive. */
export type DaySpan = { from: string; to: string }

const DAY_MS = 86_400_000
const VN_OFFSET_MS = 7 * 3_600_000

const pad = (n: number): string => String(n).padStart(2, '0')

const dayNo = (day: string): number =>
  Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10))) / DAY_MS

function dayAt(n: number): string {
  const d = new Date(n * DAY_MS)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/** `Date.UTC` rolls month 12 into January of the next year, so no edge case. */
const monthStart = (year: number, month0: number): string =>
  dayAt(Date.UTC(year, month0, 1) / DAY_MS)

/** Monday 0 … Sunday 6. Day 0 (1970-01-01) was a Thursday. */
const weekdayOf = (n: number): number => (((n + 3) % 7) + 7) % 7

/** Monday of ISO week 1: the week that holds 4 January. */
function weekOneMonday(year: number): number {
  const jan4 = Date.UTC(year, 0, 4) / DAY_MS
  return jan4 - weekdayOf(jan4)
}

/** 52 or 53. */
export const isoWeeksIn = (year: number): number =>
  (weekOneMonday(year + 1) - weekOneMonday(year)) / 7

const KEY = /^(20\d{2})(?:-(0[1-9]|1[0-2]|Q[1-4]|W(0[1-9]|[1-4]\d|5[0-3])))?$/

/** The shape, plus week 53 only in a year that has one. */
export function isSalesPeriodKey(key: string): boolean {
  const m = KEY.exec(key)
  return m !== null && (m[3] === undefined || Number(m[3]) <= isoWeeksIn(Number(m[1])))
}

export function salesGrainOf(key: string): SalesGrain {
  if (key.length === 4) return 'year'
  if (key[5] === 'W') return 'week'
  return key[5] === 'Q' ? 'quarter' : 'month'
}

export function salesPeriodSpan(key: string): DaySpan {
  const year = Number(key.slice(0, 4))
  const grain = salesGrainOf(key)
  if (grain === 'year') return { from: monthStart(year, 0), to: monthStart(year + 1, 0) }
  if (grain === 'week') {
    const monday = weekOneMonday(year) + (Number(key.slice(6)) - 1) * 7
    return { from: dayAt(monday), to: dayAt(monday + 7) }
  }
  const first = grain === 'quarter' ? (Number(key.slice(6)) - 1) * 3 : Number(key.slice(5)) - 1
  const size = grain === 'quarter' ? 3 : 1
  return { from: monthStart(year, first), to: monthStart(year, first + size) }
}

/** The key of the given grain that holds `day`. */
export function salesPeriodOf(grain: SalesGrain, day: string): string {
  const year = Number(day.slice(0, 4))
  if (grain === 'year') return String(year)
  if (grain === 'month') return day.slice(0, 7)
  if (grain === 'quarter') return `${year}-Q${Math.ceil(Number(day.slice(5, 7)) / 3)}`
  /* An ISO week-year can start in late December or end in early January. */
  const n = dayNo(day)
  let weekYear = year + 1
  while (n < weekOneMonday(weekYear)) weekYear -= 1
  return `${weekYear}-W${pad(Math.floor((n - weekOneMonday(weekYear)) / 7) + 1)}`
}

export function stepSalesPeriod(key: string, by: -1 | 1): string {
  const { from, to } = salesPeriodSpan(key)
  return salesPeriodOf(salesGrainOf(key), by < 0 ? dayAt(dayNo(from) - 1) : to)
}

/** The period one grain finer: the days of a week, the Monday-first weeks of a
 *  month cut at the month's edges (4 to 6 of them), the months of a quarter or
 *  a year. A bucket's key is its first day, or its month for month buckets. */
export function salesBucketsOf(key: string): (DaySpan & { key: string })[] {
  const span = salesPeriodSpan(key)
  const grain = salesGrainOf(key)
  const out: (DaySpan & { key: string })[] = []
  if (grain === 'quarter' || grain === 'year') {
    for (let day = span.from; day < span.to;) {
      const month = salesPeriodSpan(day.slice(0, 7))
      out.push({ key: day.slice(0, 7), ...month })
      day = month.to
    }
    return out
  }
  const end = dayNo(span.to)
  for (let n = dayNo(span.from); n < end;) {
    const next = grain === 'week' ? n + 1 : Math.min(end, n + 7 - weekdayOf(n))
    out.push({ key: dayAt(n), from: dayAt(n), to: dayAt(next) })
    n = next
  }
  return out
}

/** The period before `key`, cut to as many days as `key` has run by `asOf`
 *  (inclusive): 20 days into Q4 compares with 1–20 July, not all of Q3. A
 *  finished period compares with the whole one before. Equal day counts, not
 *  equal dates, so across a 29 February the cut lands a calendar day off. */
export function salesCompareSpan(key: string, asOf: string): DaySpan {
  const current = salesPeriodSpan(key)
  const previous = salesPeriodSpan(stepSalesPeriod(key, -1))
  if (asOf < current.from || asOf >= current.to) return previous
  const ran = dayNo(asOf) - dayNo(current.from) + 1
  return {
    from: previous.from,
    to: dayAt(Math.min(dayNo(previous.to), dayNo(previous.from) + ran)),
  }
}

/** The day before an exclusive `to`, for printing a span as first – last. */
export const lastDayOf = (span: DaySpan): string => dayAt(dayNo(span.to) - 1)

/** The Vietnam calendar day an instant falls on: UTC+7 all year, no DST. */
export const vnDayOf = (instant: Date): string =>
  dayAt(Math.floor((instant.getTime() + VN_OFFSET_MS) / DAY_MS))
