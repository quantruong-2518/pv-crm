import { z } from 'zod'
import { MoneyVnd } from '../primitives'

/** `GET /sales/performance/:period` — the overview's period figures in one read.
 *
 *  One route rather than a period param on three scorecards: the tiles compare a
 *  period with the one before it, and three reads fenced separately could each
 *  place the boundary differently. Figures here are whole-book, like the
 *  scorecards they sit beside. */

/** `2026-10` for a month, `2026-Q4` for a quarter. */
export const SalesPeriodKey = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2]|Q[1-4])$/)

export const SalesPerformanceParams = z.object({ period: SalesPeriodKey })

const count = z.number().int().nonnegative()

/** Leads that ENTERED THE BOOK in the span, and how far they have got by now.
 *  Every step counts DISTINCT LEADS of that cohort, so none outgrows `leads`.
 *  `LeadScorecard` uses the same step names but counts deal and contract rows:
 *  one lead with three deals is 3 there and 1 here, and the two differ by design. */
export const SalesCohort = z.object({
  leads: count,
  firstMeetings: count,
  opportunities: count,
  contracts: count,
})

export const SalesPeriodFigures = z.object({
  cohort: SalesCohort,
  /** Contracts SIGNED in the span — by the day it happened, unlike `cohort.contracts`. */
  signedCount: count,
  signedAmountVnd: MoneyVnd,
  /** Signed contracts carrying no amount — missing from the sum above. */
  blankAmount: count,
})

/** One calendar month of the quarter the period sits in. */
export const SalesMonthPoint = SalesPeriodFigures.extend({
  key: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
})

export const SalesPerformanceResponse = z.object({
  period: SalesPeriodKey,
  current: SalesPeriodFigures,
  /** The period of the same grain right before `period`. */
  previous: SalesPeriodFigures,
  /** A snapshot of today, not of the period: the open book keeps no history,
   *  so it has no previous figure to compare with. */
  open: z.object({ count, amountVnd: MoneyVnd, blank: count }),
  /** The three months of the quarter containing `period`, oldest first. */
  months: z.array(SalesMonthPoint).length(3),
})

export type SalesPeriodKey = z.infer<typeof SalesPeriodKey>
export type SalesPerformanceParams = z.infer<typeof SalesPerformanceParams>
export type SalesCohort = z.infer<typeof SalesCohort>
export type SalesPeriodFigures = z.infer<typeof SalesPeriodFigures>
export type SalesMonthPoint = z.infer<typeof SalesMonthPoint>
export type SalesPerformanceResponse = z.infer<typeof SalesPerformanceResponse>
