import {
  salesBucketsOf,
  salesCompareSpan,
  salesPeriodOf,
  salesPeriodSpan,
  stepSalesPeriod,
  type SalesPeriodKey,
} from '@pv/contracts'

/** A period key turned into the spans one read has to fence.
 *
 *  The calendar math is the contract's (`sales-period.ts`), so the web picker
 *  and this fence agree on one week. It reads no zone, and `asOf` comes from
 *  the database clock the SQL fence cuts on: two clocks would be two boundaries. */

/** `from` inclusive, `to` exclusive, both `YYYY-MM-DD`. */
export type PeriodSpan = { key: string; from: string; to: string }

const spanOf = (key: string): PeriodSpan => ({ key, ...salesPeriodSpan(key) })

/** `previous` is always the whole period before, so KPI's `.key` stays a month
 *  key. `compare` is that period cut like-for-like by `asOf` (whole without it),
 *  keyed apart: a cut month must not answer for the same month in `months`. */
export function spansOf(
  period: SalesPeriodKey,
  asOf?: string,
): {
  current: PeriodSpan
  previous: PeriodSpan
  compare: PeriodSpan
  months: PeriodSpan[]
  buckets: PeriodSpan[]
} {
  const current = spanOf(period)
  const before = stepSalesPeriod(period, -1)
  const previous = spanOf(before)
  return {
    current,
    previous,
    compare: asOf ? { key: `${before}@compare`, ...salesCompareSpan(period, asOf) } : previous,
    months: salesBucketsOf(salesPeriodOf('quarter', current.from)),
    buckets: salesBucketsOf(period),
  }
}
