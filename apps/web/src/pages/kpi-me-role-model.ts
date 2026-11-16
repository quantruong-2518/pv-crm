import type { KpiFunnelResponse, KpiMetricDef, KpiTrendResponse, RoleId } from '@pv/contracts'
import { bottleneckOf, type FunnelFact } from './kpi-me-bottleneck'

/** Pure shaping of the Marketing, BD and Presales boards (ADR 0160 §8–9).
 *  Facts only: a verdict compares a figure with its own target, and a sentence
 *  under a chart names a step and a gap, never what to do about it. */

/** The three roles whose board this is; the others keep the plain scorecard. */
export const BOARD_ROLES = ['marketing', 'bd', 'presales'] as const
export type BoardRole = (typeof BOARD_ROLES)[number]
export const isBoardRole = (role: RoleId): role is BoardRole => BOARD_ROLES.some((r) => r === role)

export type FunnelStepRead = KpiFunnelResponse['steps'][number]

const clamp = (share: number) => Math.min(Math.max(share, 0), 1)

/** The bottleneck and its gap, else the step that loses the most; null while nothing is lost. */
export const funnelFact = (steps: readonly FunnelStepRead[]): FunnelFact | null =>
  bottleneckOf(
    steps.map((s, i) => ({
      rate: s.rate,
      target: s.target,
      lost: i > 0 ? steps[i - 1]!.count - s.count : 0,
    })),
  )

/** Last step over the first, e.g. leads that became opportunities; null over an empty base. */
export function overallShare(steps: readonly FunnelStepRead[]): number | null {
  const first = steps[0]
  const last = steps[steps.length - 1]
  return first && last && steps.length > 1 && first.count > 0 ? last.count / first.count : null
}

type Reading = KpiTrendResponse['series'][number]['months'][number]

const readingsOf = (trend: KpiTrendResponse, def: KpiMetricDef): Reading[] | null =>
  trend.series.find((s) => s.key === def.key)?.months ?? null

export type RateVerdict = 'met' | 'under' | 'unset' | 'none'

export type RateBar = {
  def: KpiMetricDef
  value: number | null
  target: number | null
  /** Where the bar ends and the mark sits, as shares of `top`. */
  fill: number
  tick: number | null
  top: number
  verdict: RateVerdict
}

/** Steps a printed scale may end on, as multiples of a power of ten. */
const NICE = [1, 1.5, 2, 3, 4, 5, 6, 8, 10]

/** Round up to the next readable step, so the printed scale is never "0–96,2%". */
function niceCeil(value: number): number {
  const mag = 10 ** Math.floor(Math.log10(value))
  const step = NICE.find((n) => n * mag >= value * (1 - 1e-9)) ?? 10
  return step * mag
}

/** Headroom of a quarter past the larger figure keeps the tick off the bar's end; a ratio
 *  stops at 100% unless a figure is above it, so the printed scale never hides one. The
 *  top is then rounded up: next 10% for a ratio, a 1-1.5-2-3-5-8 step for money and days. */
function scaleTop(def: KpiMetricDef, value: number | null, target: number | null): number {
  const high = Math.max(value ?? 0, target ?? 0)
  if (high <= 0) return 1
  if (def.unit !== 'ratio') return niceCeil(high * 1.25)
  return Math.ceil(Math.max(Math.min(high * 1.25, 1), high) * 10 - 1e-9) / 10
}

/** The metrics the rates card draws: not the headline, and without a pace (the hero's job).
 *  The tiles of the same roles leave these out so no figure is drawn twice. */
export const drawnAsRate = (def: KpiMetricDef): boolean => !def.primary && !def.paced

/** One bar per `drawnAsRate` metric: ratios, response times, cost. Read from the month the
 *  trend ends on; a month with neither figure nor target still draws, as "no figure yet". */
export function rateBars(defs: readonly KpiMetricDef[], trend: KpiTrendResponse): RateBar[] {
  return defs.flatMap((def) => {
    const reading = drawnAsRate(def) ? readingsOf(trend, def)?.[5] : undefined
    if (!reading) return []
    const { value, target } = reading
    const top = scaleTop(def, value, target)
    const met =
      value !== null && target !== null && (def.higherIsBetter ? value >= target : value <= target)
    const verdict: RateVerdict =
      value === null ? 'none' : target === null ? 'unset' : met ? 'met' : 'under'
    return [
      {
        def,
        value,
        target,
        top,
        verdict,
        fill: value === null ? 0 : clamp(value / top),
        tick: target === null ? null : clamp(target / top),
      },
    ]
  })
}

export type TrendSeries = { def: KpiMetricDef; values: (number | null)[]; top: number }

export type TrendView = { months: string[]; bars: TrendSeries; line: TrendSeries | null }

const seriesOf = (def: KpiMetricDef, months: Reading[]): TrendSeries => {
  const values = months.map((m) => m.value)
  return { def, values, top: Math.max(...values.map((v) => v ?? 0), 0) }
}

/** Bars for the headline metric, a line for the first rate beside it. Null when no month has a figure. */
export function trendOf(defs: readonly KpiMetricDef[], trend: KpiTrendResponse): TrendView | null {
  const head = defs.find((d) => d.primary)
  const headMonths = head ? readingsOf(trend, head) : null
  if (!head || !headMonths) return null
  const rate = defs.find((d) => !d.primary && d.unit === 'ratio' && readingsOf(trend, d))
  const rateMonths = rate ? readingsOf(trend, rate) : null
  const bars = seriesOf(head, headMonths)
  const line = rate && rateMonths ? seriesOf(rate, rateMonths) : null
  if (bars.values.every((v) => v === null) && (line?.values ?? []).every((v) => v === null)) {
    return null
  }
  return { months: [...trend.months], bars, line }
}

/** "T8": the column foot; the full month rides in the title attribute. */
export const monthFoot = (period: string) => `T${Number(period.slice(5))}`
