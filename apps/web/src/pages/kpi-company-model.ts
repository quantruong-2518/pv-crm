import {
  catalogFor,
  salesPeriodSpan,
  vnDayOf,
  type KpiDeskPrimary,
  type KpiMetricDef,
  type KpiMetricKey,
  type KpiVerdict,
} from '@pv/contracts'
import { BAR_FILL } from './kpi-model'

/** Arithmetic behind the company tab's bars; no render. Every figure and every
 *  verdict is the server's: this file only turns them into shares of a bar. */

/** Share of the month already gone (today excluded), the server's pace share. */
export function paceShare(period: string, today = new Date()): number {
  const { from, to } = salesPeriodSpan(period)
  const day = vnDayOf(today)
  if (day >= to) return 1
  if (day < from) return 0
  return (Date.parse(day) - Date.parse(from)) / (Date.parse(to) - Date.parse(from))
}

/** The def of a metric in the period's catalog, switched off or not: a unit
 *  card names a metric whatever the role overlay says. */
export function defOfKey(period: string, key: KpiMetricKey): KpiMetricDef | undefined {
  return Object.values(catalogFor(period))
    .flat()
    .find((d) => d.key === key)
}

/** `value ÷ target` of a primary, `null` while either is missing or the target is 0. */
export function shareOfPrimary(p: KpiDeskPrimary): number | null {
  return p.value === null || p.target === null || p.target <= 0 ? null : p.value / p.target
}

/** One axis for a set of bars: the longest share or the pace tick, a little
 *  rounded up to a whole ten percent so the tick never sits on the edge. */
export function axisMax(shares: readonly (number | null)[], pace: number): number {
  const top = Math.max(pace, ...shares.map((s) => s ?? 0))
  return Math.max(0.1, Math.ceil(top * 10 + 1) / 10)
}

/** A bar of `share` on an axis ending at `axis`. */
export const onAxis = (share: number, axis: number) => Math.min(Math.max(share / axis, 0), 1)

/** The fill of a verdict; a unit's reading that has none yet stays quiet. */
export const toneOf = (verdict: KpiVerdict) => BAR_FILL[verdict]

/** A secondary metric as a bar: figure over target, with the target as the tick.
 *  Past the target the axis grows, so a ceiling (lower is better) is crossed visibly.
 *  `null` when there is no target to measure against. */
export function otherBar(p: KpiDeskPrimary): { fill: number; mark: number } | null {
  if (p.target === null || p.target <= 0) return null
  const value = p.value ?? 0
  const axis = Math.max(p.target * 1.5, value)
  return { fill: value / axis, mark: p.target / axis }
}
