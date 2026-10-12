import { z } from 'zod'
import { MoneyVnd } from '../primitives'
import { StageKey } from './enums'

/** `GET /sales/performance/:period` — the overview's period figures in one read.
 *  `GET /sales/performance/:period/exits` — why leads and deals left, same span.
 *
 *  One route rather than a period param on three scorecards: the tiles compare a
 *  period with the one before it, and three reads fenced separately could each
 *  place the boundary differently. Figures here are whole-book, like the
 *  scorecards they sit beside, and COUNTS: the screen owns how a ratio prints. */

/** `2026-10` for a month, `2026-Q4` for a quarter. */
export const SalesPeriodKey = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2]|Q[1-4])$/)

export const SalesPerformanceParams = z.object({ period: SalesPeriodKey })

const count = z.number().int().nonnegative()

/** Leads that ENTERED THE BOOK in the span, and how far they have got by now.
 *  Every step counts DISTINCT LEADS of that cohort, so none outgrows `leads`.
 *  `LeadScorecard` counts deal and contract rows instead: one lead with three
 *  deals is 3 there and 1 here, and the two differ by design.
 *
 *  `contracts / opportunities` is the LEAD-TO-CONTRACT rate — cohort leads with
 *  a contract over cohort leads with a deal. It is not a win rate: that one is
 *  `wonDeals` and `lostDeals` on `SalesPeriodFigures`. */
export const SalesCohort = z.object({
  leads: count,
  /** Leads with any real exchange: a confirmed call, a message, a mail sent or
   *  a meeting HELD. A meeting only scheduled does not count. */
  firstContacts: count,
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
  /** DEALS closed in the span, by their close moment: won = has a contract,
   *  lost = stopped. Win rate is `wonDeals / (wonDeals + lostDeals)`, the KPI
   *  `win-rate` reading over the whole room. A deal signing twice is one deal. */
  wonDeals: count,
  lostDeals: count,
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

// ---------------------------------------------------------------------------
// WHY THEY LEFT — `GET /sales/performance/:period/exits`
// ---------------------------------------------------------------------------

export const SalesExitsParams = SalesPerformanceParams

/** One reason and how many left for it. `key` is a catalogue id or `other`,
 *  a string for the reason `OpportunityStopBody.reasonKey` is one; `label` is
 *  resolved server-side, so a reader without `config.view` still reads why. */
export const SalesExitReason = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  count: z.number().int().positive(),
})

/** Deal stops are split by the column the deal stood in when it was stopped
 *  (`OpportunityRow.stoppedAtStage`): one reason may appear once per stage. */
export const SalesStopReason = SalesExitReason.extend({ stage: StageKey })

/** Both lists hold only reasons that occurred, most frequent first. */
export const SalesExitsResponse = z.object({
  period: SalesPeriodKey,
  /** Leads that left the funnel (`:code/exit`) in the span, by `EXIT_REASON`. */
  leadExits: z.array(SalesExitReason),
  /** Deals stopped in the span, by stage and `LOSS_REASON`. */
  dealStops: z.array(SalesStopReason),
})

export type SalesPeriodKey = z.infer<typeof SalesPeriodKey>
export type SalesPerformanceParams = z.infer<typeof SalesPerformanceParams>
export type SalesCohort = z.infer<typeof SalesCohort>
export type SalesPeriodFigures = z.infer<typeof SalesPeriodFigures>
export type SalesMonthPoint = z.infer<typeof SalesMonthPoint>
export type SalesPerformanceResponse = z.infer<typeof SalesPerformanceResponse>
export type SalesExitsParams = z.infer<typeof SalesExitsParams>
export type SalesExitReason = z.infer<typeof SalesExitReason>
export type SalesStopReason = z.infer<typeof SalesStopReason>
export type SalesExitsResponse = z.infer<typeof SalesExitsResponse>
