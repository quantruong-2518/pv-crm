import type { SalesPeriodKey } from '@pv/contracts'

/** A period key turned into the spans one read has to fence.
 *
 *  Calendar arithmetic on the key's own digits, never through `Date`: a `Date`
 *  built in Node carries Node's zone, and the fence these days feed is cut in
 *  SQL (`performance.repository.ts`). Two clocks would be two boundaries. */

/** `from` inclusive, `to` exclusive, both `YYYY-MM-DD`. */
export type PeriodSpan = { key: string; from: string; to: string }

const pad = (n: number): string => String(n).padStart(2, '0')

/** `count` whole months starting at month `index`, counted from year 0 so a
 *  step back from January lands in December without a special case. */
function span(key: string, index: number, count: number): PeriodSpan {
  const day = (i: number): string => `${Math.floor(i / 12)}-${pad((i % 12) + 1)}-01`
  return { key, from: day(index), to: day(index + count) }
}

const monthKey = (index: number): string => `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`

export function spansOf(period: SalesPeriodKey): {
  current: PeriodSpan
  previous: PeriodSpan
  months: PeriodSpan[]
} {
  const year = Number(period.slice(0, 4))
  const tail = period.slice(5)
  const quarterly = tail.startsWith('Q')
  const size = quarterly ? 3 : 1
  const start = year * 12 + (quarterly ? (Number(tail.slice(1)) - 1) * 3 : Number(tail) - 1)
  const before = start - size
  const quarterStart = start - (start % 3)

  return {
    current: span(period, start, size),
    previous: span(
      quarterly ? `${Math.floor(before / 12)}-Q${(before % 12) / 3 + 1}` : monthKey(before),
      before,
      size,
    ),
    months: [0, 1, 2].map((i) => span(monthKey(quarterStart + i), quarterStart + i, 1)),
  }
}
