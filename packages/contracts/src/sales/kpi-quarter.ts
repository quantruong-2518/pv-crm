import { z } from 'zod'
import { RoleId } from '../auth'
import { KpiMetricKey, KpiPeriodKey, KpiVerdict } from './kpi'
import { isSalesPeriodKey, salesBucketsOf, salesGrainOf, salesPeriodOf } from './sales-period'

/** `GET /sales/kpi/quarters/:quarter/me` — read-only quarter view (ADR 0146).
 *
 *  A quarter is the sum of its three monthly readings, never a figure of its
 *  own: no target is stored for it, and month verdicts and alerts stay monthly.
 *  Each reading therefore carries its three months, so the screen can show
 *  where the total came from. Who sees the month view sees the quarter. */

// The calendar lives in sales-period; this only narrows its keys to the quarter grain.
export const KpiQuarterKey = z
  .string()
  .refine((k) => isSalesPeriodKey(k) && salesGrainOf(k) === 'quarter')

export const KpiQuarterParams = z.object({ quarter: KpiQuarterKey })

/** A month against today by the Vietnam calendar; the same three values as the server's `phaseOf`. */
export const KpiMonthPhase = z.enum(['closed', 'running', 'future'])

export const KpiQuarterMonth = z.object({ period: KpiPeriodKey, phase: KpiMonthPhase })

export const KpiQuarterMonthReading = z.object({
  period: KpiPeriodKey,
  value: z.number().nullable(),
  target: z.number().nonnegative().nullable(),
})

// The year view (ADR 0158 §6) is the same sum over twelve months, so both grains share these builders.
const readingOf = (months: number) =>
  z.object({
    key: KpiMetricKey,
    /** Sum of the month values; a month without one counts 0. */
    value: z.number(),
    /** `null` when any month has no target: the quarter or year target is then unset. */
    target: z.number().nonnegative().nullable(),
    expected: z.number().nonnegative().nullable(),
    verdict: KpiVerdict,
    months: z.array(KpiQuarterMonthReading).length(months),
  })

const scorecardOf = (months: number) =>
  z.object({
    role: RoleId,
    readings: z.array(readingOf(months)),
    /** The role's metrics with no summed figure, i.e. those `isCumulative` (kpi.ts) rejects. */
    monthOnly: z.array(KpiMetricKey),
  })

const spanOf = {
  daysGone: z.number().int().nonnegative(),
  days: z.number().int().positive(),
}

export const KpiQuarterReading = readingOf(3)
export const KpiQuarterScorecard = scorecardOf(3)

export const KpiQuarterMeResponse = z.object({
  quarter: KpiQuarterKey,
  months: z.array(KpiQuarterMonth).length(3),
  ...spanOf,
  scorecards: z.array(KpiQuarterScorecard),
})

/** `GET /sales/kpi/years/:year/me` — `2026`; twelve months where the quarter has three. */
export const KpiYearKey = z
  .string()
  .refine((k) => isSalesPeriodKey(k) && salesGrainOf(k) === 'year')

export const KpiYearParams = z.object({ year: KpiYearKey })

export const KpiYearReading = readingOf(12)
export const KpiYearScorecard = scorecardOf(12)

export const KpiYearMeResponse = z.object({
  year: KpiYearKey,
  months: z.array(KpiQuarterMonth).length(12),
  ...spanOf,
  scorecards: z.array(KpiYearScorecard),
})

export type KpiQuarterKey = z.infer<typeof KpiQuarterKey>
export type KpiQuarterParams = z.infer<typeof KpiQuarterParams>
export type KpiMonthPhase = z.infer<typeof KpiMonthPhase>
export type KpiQuarterMonth = z.infer<typeof KpiQuarterMonth>
export type KpiQuarterMonthReading = z.infer<typeof KpiQuarterMonthReading>
export type KpiQuarterReading = z.infer<typeof KpiQuarterReading>
export type KpiQuarterScorecard = z.infer<typeof KpiQuarterScorecard>
export type KpiQuarterMeResponse = z.infer<typeof KpiQuarterMeResponse>
export type KpiYearKey = z.infer<typeof KpiYearKey>
export type KpiYearParams = z.infer<typeof KpiYearParams>
export type KpiYearReading = z.infer<typeof KpiYearReading>
export type KpiYearScorecard = z.infer<typeof KpiYearScorecard>
export type KpiYearMeResponse = z.infer<typeof KpiYearMeResponse>

/** The three month keys of a quarter, in order: `2026-Q4` -> `2026-10 … 2026-12`. */
export const quarterMonths = (
  q: KpiQuarterKey,
): readonly [KpiPeriodKey, KpiPeriodKey, KpiPeriodKey] =>
  // A quarter's buckets are always its three months, so the tuple cast is safe.
  salesBucketsOf(q).map((b) => b.key) as [KpiPeriodKey, KpiPeriodKey, KpiPeriodKey]

/** The quarter a month falls in: `2026-11` -> `2026-Q4`. */
export const quarterOf = (period: KpiPeriodKey): KpiQuarterKey =>
  salesPeriodOf('quarter', `${period}-01`)
