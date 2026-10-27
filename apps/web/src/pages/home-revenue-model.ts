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
 *  due unpaid or is still to fall due. Expected revenue is the live contracts'
 *  installments due in the period, paid or not (`settledVnd` + due + upcoming). */

export type RevenueColumn = {
  view: BucketView
  money: SalesMoneyBucket
  /** A refund can push a slice's collected sum below zero; a bar cannot. */
  collected: number
  due: number
  upcoming: number
  /** The column's frame: collected + due + upcoming. */
  total: number
}

export type Revenue = {
  columns: RevenueColumn[]
  actual: number
  collected: number
  /** Installments due in the period and already paid. */
  paid: number
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
    return {
      view,
      money: m,
      collected,
      due: m.dueUnpaidVnd,
      upcoming: m.upcomingVnd,
      total: collected + m.dueUnpaidVnd + m.upcomingVnd,
    }
  })
  const t = cash.totals
  return {
    columns,
    actual: t.actualVnd,
    collected: t.collectedVnd,
    paid: t.settledVnd,
    due: t.dueUnpaidVnd,
    upcoming: t.upcomingVnd,
    expected: t.settledVnd + t.dueUnpaidVnd + t.upcomingVnd,
    penaltyIn: t.penaltyIn,
    penaltyOut: t.penaltyOut,
  }
}

/** A future bucket still draws when money already sits in it. */
export const hasData = ({ view, total, money: m }: RevenueColumn) =>
  view.state !== 'future' || total > 0 || m.penaltyIn.count > 0 || m.penaltyOut.count > 0

/** The column's sections: the frame's parts bottom-up, then the penalties; empty ones are left out. */
export const columnKinds = ({ money: m, due, upcoming }: RevenueColumn) =>
  (
    [
      [m.collectedVnd !== 0, 'collected'],
      [due > 0, 'due-unpaid'],
      [upcoming > 0, 'upcoming'],
      [m.penaltyIn.amountVnd > 0, 'penalty-in'],
      [m.penaltyOut.amountVnd > 0, 'penalty-out'],
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
  settled: 'Đến hạn trong kỳ, đã thu',
  upcoming: 'Sắp đến hạn',
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
  settled: 'text-success',
  upcoming: 'text-success',
  'penalty-in': 'text-channel-meeting',
  'penalty-out': 'text-destructive-foreground',
}
