import { z } from 'zod'
import { Day } from '../primitives'
import { ConfigCode } from './config'

/** `GET /sales/reports/industries?period=` — the industry report screen.
 *
 *  A tree, category -> its industries, plus one row with no category (`id`
 *  null) for leads without one and for industries not grouped yet. A lead with
 *  several industries counts in EACH of them, so children do not sum to their
 *  parent and rows do not sum to `totals` — the screen says so in its meta line.
 *  The period is the current month, quarter or year by the Vietnam calendar;
 *  `open` is a count as of now and is not bound to it. */
export const IndustryReportPeriod = z.enum(
  ['month', 'quarter', 'year'],
  'Kỳ không có trong danh sách',
)
export const IndustryReportQuery = z.object({ period: IndustryReportPeriod.default('month') })

const count = z.number().int().nonnegative()

const IndustryReportCounts = z.object({
  /** Live leads (not switched off) in an open state, now. */
  open: count,
  /** Leads created in the period. */
  fresh: count,
  /** Opportunities created in the period from those leads. */
  deals: count,
  /** Contracts signed in the period from those leads. */
  won: count,
  /** Lead-to-opportunity rate: of the leads created in the period (`fresh`), the share
   *  that already have an opportunity (owner's decision); null when `fresh` is 0. */
  conversion: z.number().nonnegative().nullable(),
})

export const IndustryReportIndustry = IndustryReportCounts.extend({
  id: ConfigCode,
  name: z.string().min(1),
})

export const IndustryReportCategory = IndustryReportCounts.extend({
  /** Both null together: the "not grouped" row. */
  id: ConfigCode.nullable(),
  name: z.string().min(1).nullable(),
  industries: z.array(IndustryReportIndustry),
})

export const IndustryReportResponse = z.object({
  period: IndustryReportPeriod,
  /** First day of the period, and the day after its last (`DaySpan`'s rule). */
  from: Day,
  to: Day,
  /** Distinct leads, not a sum of the rows. */
  totals: IndustryReportCounts,
  rows: z.array(IndustryReportCategory),
})

export type IndustryReportPeriod = z.infer<typeof IndustryReportPeriod>
export type IndustryReportQuery = z.infer<typeof IndustryReportQuery>
export type IndustryReportIndustry = z.infer<typeof IndustryReportIndustry>
export type IndustryReportCategory = z.infer<typeof IndustryReportCategory>
export type IndustryReportResponse = z.infer<typeof IndustryReportResponse>
