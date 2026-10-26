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
 *  due unpaid or is still to fall due (money), plus the open deals expected to
 *  close in that slice (figures). Expected revenue is actual plus everything not
 *  yet collected: owed, upcoming and open. */

export type RevenueColumn = {
  view: BucketView
  money: SalesMoneyBucket
  /** A refund can push a slice's collected sum below zero; a bar cannot. */
  collected: number
  due: number
  upcoming: number
  open: number
  /** The column's frame: collected + due + upcoming + open. */
  total: number
}

export type Revenue = {
  columns: RevenueColumn[]
  actual: number
  open: number
  due: number
  upcoming: number
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
      upcoming: m.upcomingVnd,
      open,
      total: collected + m.dueUnpaidVnd + m.upcomingVnd + open,
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
    upcoming: t.upcomingVnd,
    expected: t.actualVnd + t.dueUnpaidVnd + t.upcomingVnd + open,
    penaltyIn: t.penaltyIn,
    penaltyOut: t.penaltyOut,
  }
}

/** A future bucket still draws when money or an open deal already sits in it. */
export const hasData = ({ view, total, money: m }: RevenueColumn) =>
  view.state !== 'future' || total > 0 || m.penaltyIn.count > 0 || m.penaltyOut.count > 0

/** The column's sections bottom-up, as the frame stacks them; empty ones are left out. */
export const columnKinds = ({ money: m, due, upcoming, open }: RevenueColumn) =>
  (
    [
      [m.collectedVnd !== 0, 'collected'],
      [due > 0, 'due-unpaid'],
      [upcoming > 0, 'upcoming'],
      [open > 0, 'open-deal'],
    ] as const
  )
    .filter(([on]) => on)
    .map(([, kind]): SalesMoneyFigureKind => kind)

/** Every figure of the chart and its strip, in millions with at most one decimal. */
export const millions = (vnd: number) => num(vnd / 1_000_000)

/** `money()` with a true minus sign: `toLocaleString` prints a hyphen. */
export const signedMoney = (vnd: number) => (vnd < 0 ? `−${money(-vnd)}` : money(vnd))

/** A popover section's name for each figure. */
export const KIND_TITLE: Record<SalesMoneyFigureKind, string> = {
  collected: 'Đã thu',
  'due-unpaid': 'Đến hạn chưa thu',
  upcoming: 'Sắp đến hạn',
  'open-deal': 'Cơ hội dự kiến chốt',
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
  upcoming: 'text-success',
  'open-deal': 'text-accent-foreground',
  'penalty-in': 'text-channel-meeting',
  'penalty-out': 'text-destructive-foreground',
}
