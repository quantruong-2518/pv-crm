import {
  salesGrainOf,
  salesPeriodOf,
  salesPeriodSpan,
  stepSalesPeriod,
  vnDayOf,
  lastDayOf,
  type SalesBucket,
  type SalesDayRange,
  type SalesGrain,
  type SalesPerformanceResponse,
} from '@pv/contracts'

/** The overview's period picker and how a period and its buckets print. The
 *  arithmetic is `@pv/contracts`' (`sales-period`), shared with the API fence;
 *  this file only picks and labels. Buckets are labelled from the response's
 *  own days, never recomputed, so a placeholder kept across a period change
 *  still prints the days its figures cover. */

export const GRAINS: { value: SalesGrain; label: string }[] = [
  { value: 'week', label: 'Tuần' },
  { value: 'month', label: 'Tháng' },
  { value: 'quarter', label: 'Quý' },
  { value: 'year', label: 'Năm' },
]

/** One remembered key per grain, so switching grain and back returns to the
 *  same period. */
export type PeriodPick = { grain: SalesGrain } & Record<SalesGrain, string>

/** The periods `today` falls in on the Vietnam calendar, for every reader. */
export function currentPick(today = new Date()): PeriodPick {
  const day = vnDayOf(today)
  return {
    grain: 'quarter',
    week: salesPeriodOf('week', day),
    month: salesPeriodOf('month', day),
    quarter: salesPeriodOf('quarter', day),
    year: salesPeriodOf('year', day),
  }
}

export const keyOf = (pick: PeriodPick): string => pick[pick.grain]

/** The neighbouring period, or null past the running one: nothing has been
 *  measured there yet. Backwards is unbounded. */
export function stepPick(pick: PeriodPick, by: -1 | 1, today = new Date()): PeriodPick | null {
  const next = stepSalesPeriod(keyOf(pick), by)
  if (salesPeriodSpan(next).from > vnDayOf(today)) return null
  return { ...pick, [pick.grain]: next }
}

const dm = (day: string) => `${Number(day.slice(8, 10))}/${Number(day.slice(5, 7))}`

/** '12/10 – 13/10'; the year is added when it is not the year of `home`. */
export function rangeLabel(range: SalesDayRange, home?: string): string {
  const year = range.last.slice(0, 4)
  const tail = home !== undefined && home.slice(0, 4) !== year ? `/${year}` : ''
  return range.first === range.last
    ? `${dm(range.first)}${tail}`
    : `${dm(range.first)} – ${dm(range.last)}${tail}`
}

/** The picker's label: a week by its days, the other grains by number and year. */
export function periodLabel(key: string): string {
  const grain = salesGrainOf(key)
  if (grain === 'year') return `Năm ${key}`
  if (grain === 'quarter') return `Quý ${key.slice(6)} · ${key.slice(0, 4)}`
  if (grain === 'month') return `Tháng ${Number(key.slice(5))} · ${key.slice(0, 4)}`
  const span = salesPeriodSpan(key)
  return `Tuần ${rangeLabel({ first: span.from, last: lastDayOf(span) }, vnDayOf(new Date()))}`
}

const DAY_NAMES = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

export type BucketState = 'past' | 'now' | 'future'

/** A bucket as a chart column prints it. `sub` names the running bucket, and
 *  in a week the date of every day. */
export type BucketView = {
  bucket: SalesBucket
  label: string
  sub: string
  state: BucketState
}

export function bucketViews(data: SalesPerformanceResponse): BucketView[] {
  const grain = salesGrainOf(data.period)
  return data.buckets.map((bucket) => {
    const state: BucketState =
      bucket.first > data.asOf ? 'future' : bucket.last < data.asOf ? 'past' : 'now'
    if (grain === 'week') {
      const weekday = new Date(`${bucket.first}T00:00:00Z`).getUTCDay()
      return {
        bucket,
        label: DAY_NAMES[weekday] ?? '',
        sub: state === 'now' ? 'hôm nay' : dm(bucket.first),
        state,
      }
    }
    const label = grain === 'month' ? rangeLabel(bucket) : `T${Number(bucket.key.slice(5))}`
    return { bucket, label, sub: state === 'now' ? 'đang chạy' : '', state }
  })
}

/** How far the period has run, in days, for the header's progress line; a
 *  finished period has run all of them. */
export function progressOf(data: SalesPerformanceResponse): { ran: number; total: number } {
  const dayNo = (day: string) => Date.parse(`${day}T00:00:00Z`) / 86_400_000
  const total = dayNo(data.span.last) - dayNo(data.span.first) + 1
  const ran = Math.min(total, Math.max(0, dayNo(data.asOf) - dayNo(data.span.first) + 1))
  return { ran, total }
}

/** The header's comparison line, read off the span the server compared with. */
export const compareLabel = (data: SalesPerformanceResponse): string =>
  `so với ${rangeLabel(data.compare, data.span.first)}`
