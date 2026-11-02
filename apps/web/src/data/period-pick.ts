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
import { message, translate, type Message } from '@/app/i18n'

/** The overview's period picker and how a period and its buckets print. The
 *  arithmetic is `@pv/contracts`' (`sales-period`), shared with the API fence;
 *  this file only picks and labels. Buckets are labelled from the response's
 *  own days, never recomputed, so a placeholder kept across a period change
 *  still prints the days its figures cover. */

export const GRAINS: { value: SalesGrain; label: Message }[] = [
  { value: 'week', label: message('Tuần', 'Week', '주') },
  { value: 'month', label: message('Tháng', 'Month', '월') },
  { value: 'quarter', label: message('Quý', 'Quarter', '분기') },
  { value: 'year', label: message('Năm', 'Year', '연') },
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

const dm = (day: string) => {
  const d = Number(day.slice(8, 10))
  const m = Number(day.slice(5, 7))
  return translate(message(`${d}/${m}`, `${m}/${d}`, `${m}/${d}`))
}

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
  const year = key.slice(0, 4)
  if (grain === 'year') return translate(message(`Năm ${key}`, `Year ${key}`, `${key}년`))
  if (grain === 'quarter') {
    const q = key.slice(6)
    return translate(message(`Quý ${q} · ${year}`, `Q${q} · ${year}`, `${year}년 ${q}분기`))
  }
  if (grain === 'month') {
    const m = Number(key.slice(5))
    return translate(message(`Tháng ${m} · ${year}`, `Month ${m} · ${year}`, `${year}년 ${m}월`))
  }
  const span = salesPeriodSpan(key)
  const range = rangeLabel({ first: span.from, last: lastDayOf(span) }, vnDayOf(new Date()))
  return translate(message(`Tuần ${range}`, `Week ${range}`, `${range} 주`))
}

const DAY_NAMES: Message[] = [
  message('CN', 'Sun', '일'),
  message('T2', 'Mon', '월'),
  message('T3', 'Tue', '화'),
  message('T4', 'Wed', '수'),
  message('T5', 'Thu', '목'),
  message('T6', 'Fri', '금'),
  message('T7', 'Sat', '토'),
]

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
        label: translate(DAY_NAMES[weekday] ?? message('', '', '')),
        sub: state === 'now' ? translate(message('hôm nay', 'today', '오늘')) : dm(bucket.first),
        state,
      }
    }
    const n = Number(bucket.key.slice(5))
    const label =
      grain === 'month' ? rangeLabel(bucket) : translate(message(`T${n}`, `M${n}`, `${n}월`))
    const sub = state === 'now' ? translate(message('đang chạy', 'running', '진행 중')) : ''
    return { bucket, label, sub, state }
  })
}

/** What the progress line reads: the overview's response and a book scorecard's
 *  `inPeriod` both carry it, so each screen prints the same line. */
export type PeriodRead = { span: SalesDayRange; asOf: string; compare: SalesDayRange }

/** How far the period has run, in days, for the header's progress line; a
 *  finished period has run all of them. */
export function progressOf(data: PeriodRead): { ran: number; total: number } {
  const dayNo = (day: string) => Date.parse(`${day}T00:00:00Z`) / 86_400_000
  const total = dayNo(data.span.last) - dayNo(data.span.first) + 1
  const ran = Math.min(total, Math.max(0, dayNo(data.asOf) - dayNo(data.span.first) + 1))
  return { ran, total }
}

/** The header's comparison line, read off the span the server compared with. */
export const compareLabel = (data: PeriodRead): string => {
  const range = rangeLabel(data.compare, data.span.first)
  return translate(message(`so với ${range}`, `compared with ${range}`, `${range} 대비`))
}
