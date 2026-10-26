import {
  salesGrainOf,
  type SalesGrain,
  type SalesMoneyBucket,
  type SalesMoneyFigureKind,
  type SalesMoneyResponse,
  type SalesPenaltyFigure,
  type SalesPerformanceResponse,
} from '@pv/contracts'
import { bucketViews, rangeLabel, type BucketView } from '@/data/period-pick'
import { money, num } from './home-model'

/** Calculation behind the revenue tile (`home-revenue*.tsx`). No render, no fetch.
 *
 *  The money read and the figures read carry the same buckets in the same
 *  order, so one column is the pair of both: what was collected and what fell
 *  due unpaid (money), plus the open deals expected to close in that slice
 *  (figures). Expected revenue is actual plus what is still owed and still open. */

export type RevenueColumn = {
  view: BucketView
  money: SalesMoneyBucket
  /** A refund can push a slice's collected sum below zero; a bar cannot. */
  collected: number
  due: number
  open: number
  /** The column's frame: collected + due + open. */
  total: number
}

export type Revenue = {
  columns: RevenueColumn[]
  actual: number
  open: number
  due: number
  expected: number
  penaltyIn: SalesPenaltyFigure
  penaltyOut: SalesPenaltyFigure
}

/** Both reads must be of the same period (the caller checks). */
export function revenueOf(perf: SalesPerformanceResponse, cash: SalesMoneyResponse): Revenue {
  const columns = bucketViews(perf).map((view, i): RevenueColumn => {
    const m = cash.buckets[i]!
    const collected = Math.max(0, m.collectedVnd)
    const open = view.bucket.open.amountVnd
    return {
      view,
      money: m,
      collected,
      due: m.dueUnpaidVnd,
      open,
      total: collected + m.dueUnpaidVnd + open,
    }
  })
  const t = cash.totals
  /* Only the deals placed in a column: the unplaced ones are named under the signed tile. */
  const open = perf.open.amountVnd - perf.open.unplaced.amountVnd
  return {
    columns,
    actual: t.actualVnd,
    open,
    due: t.dueUnpaidVnd,
    expected: t.actualVnd + t.dueUnpaidVnd + open,
    penaltyIn: t.penaltyIn,
    penaltyOut: t.penaltyOut,
  }
}

/** A future bucket still draws when money or an open deal already sits in it. */
export const hasData = ({ view, total, money: m }: RevenueColumn) =>
  view.state !== 'future' || total > 0 || m.penaltyIn.count > 0 || m.penaltyOut.count > 0

/** Whether the column has rows to open: money collected (or refunded) or due. */
export const hasEntries = ({ money: m }: RevenueColumn) =>
  m.collectedVnd !== 0 || m.dueUnpaidVnd > 0

/** Every figure of the chart and its strip, in millions with at most one decimal. */
export const millions = (vnd: number) => num(vnd / 1_000_000)

/** `money()` with a true minus sign: `toLocaleString` prints a hyphen. */
export const signedMoney = (vnd: number) => (vnd < 0 ? `−${money(-vnd)}` : money(vnd))

/** A popover section's name for each figure. */
export const KIND_TITLE: Record<SalesMoneyFigureKind, string> = {
  collected: 'Đã thu',
  'due-unpaid': 'Đến hạn chưa thu',
  'penalty-in': 'Khách thanh toán',
  'penalty-out': 'Mình thanh toán',
}

/** A column's name in a popover title: a week's day by its date, the rest by label. */
export const columnName = (perf: SalesPerformanceResponse, view: BucketView) =>
  salesGrainOf(perf.period) === 'week' ? rangeLabel(view.bucket) : view.label

/** What one column of the chart covers, by the grain of the picked period. */
export const BUCKET_UNIT: Record<SalesGrain, string> = {
  week: 'ngày',
  month: 'tuần',
  quarter: 'tháng',
  year: 'tháng',
}

/** The figure's ink, the same as its mark on the chart. */
export const KIND_INK: Record<SalesMoneyFigureKind, string> = {
  collected: 'text-success',
  'due-unpaid': 'text-on-tint-warning',
  'penalty-in': 'text-channel-meeting',
  'penalty-out': 'text-destructive-foreground',
}
