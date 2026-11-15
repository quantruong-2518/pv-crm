import { dayNo, salesPeriodSpan, stepSalesPeriod, weekdayOf } from './sales-period'

/** Working days and the newcomer ramp (ADR 0156), one pure copy for web and API.
 *
 *  Working day = Monday to Friday of a Vietnam calendar day. There is no holiday
 *  table yet, so the Lunar New Year lowers nothing until one exists. Periods are `YYYY-MM`,
 *  days are `YYYY-MM-DD`; no timezone maths because both are plain dates. */

/** Mon–Fri days in the half-open day-number range [from, to). */
function countWeekdays(from: number, to: number): number {
  let n = 0
  for (let d = from; d < to; d++) if (weekdayOf(d) < 5) n++
  return n
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(Math.max(n, lo), hi)

/** First month the ramp, transfers and late lines apply: December 2026 was already
 *  being assigned when ADR 0156 was decided, so it stays untouched. */
export const RAMP_FROM = '2027-01'

export function workingDaysIn(period: string): number {
  const span = salesPeriodSpan(period)
  return countWeekdays(dayNo(span.from), dayNo(span.to))
}

/** From `day` (inclusive) to the month end; a day outside the month is clamped. */
export function workingDaysFrom(period: string, day: string): number {
  const span = salesPeriodSpan(period)
  const lo = dayNo(span.from)
  const hi = dayNo(span.to)
  return countWeekdays(clamp(dayNo(day), lo, hi), hi)
}

/** From the month start up to `day` (exclusive); a day outside the month is clamped. */
export function workingDaysBefore(period: string, day: string): number {
  const span = salesPeriodSpan(period)
  const lo = dayNo(span.from)
  const hi = dayNo(span.to)
  return countWeekdays(lo, clamp(dayNo(day), lo, hi))
}

/** The two fixed steps after the first month: 50 % (scaled by days left) then 75 %. */
export const RAMP_STEPS = [0.5, 0.75] as const

/** 0 before the start month, then 50 % (scaled by days left) · 75 % · 100 %.
 *  `null` = no start date recorded = fully ramped. */
export function rampFactor(startedOn: string | null, period: string): number {
  if (startedOn === null) return 1
  const first = startedOn.slice(0, 7)
  if (period < first) return 0
  if (period === first)
    return (RAMP_STEPS[0] * workingDaysFrom(period, startedOn)) / workingDaysIn(period)
  return period === stepSalesPeriod(first, 1) ? RAMP_STEPS[1] : 1
}
