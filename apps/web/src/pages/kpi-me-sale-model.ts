import type { KpiSignedByDayResponse } from '@pv/contracts'
import { VN_OFFSET_MS, currentPick } from './home-model'

/** Geometry and arithmetic behind the personal board of ADR 0160 §9: the
 *  cumulative signed chart and the 0–120 % score bar. No render, no fetch. Every
 *  figure drawn comes from the response; the scale end below is an axis end. */

/** The server caps a score line here (ADR 0158); it lives only in the API, so the bar's end is kept in step by hand. */
export const SCORE_CAP = 120

export const share = (value: number, top: number) => Math.min(Math.max(value / top, 0), 1)

const dayOf = (iso: string) => Number(iso.slice(8, 10))

export const daysIn = (period: string) =>
  new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5)), 0)).getUTCDate()

/** Days of the month already lived in Vietnam time: all of a past month, none of a coming one. */
export function dayThrough(period: string, now = new Date()): number {
  const running = currentPick(now).month
  if (period < running) return daysIn(period)
  if (period > running) return 0
  return new Date(now.getTime() + VN_OFFSET_MS).getUTCDate()
}

/** A top that three even steps reach, each a round number: 1, 2, 2.5 or 5 × a power of ten. */
function niceStep(top: number): number {
  const raw = top / 3
  const power = 10 ** Math.floor(Math.log10(raw))
  const unit = [1, 2, 2.5, 5, 10].find((m) => m * power >= raw) ?? 10
  return unit * power
}

export type ChartDot = { x: number; y: number; code: string; amount: number }

export type Chart = {
  days: number
  through: number
  /** Axis values bottom to top. */
  ticks: number[]
  top: number
  signed: string
  signedArea: string
  forecast: string | null
  pace: string | null
  targetY: number | null
  todayX: number | null
  dots: ChartDot[]
  signedTotal: number
  /** Where the picked opportunities take the month; `null` with none picked. */
  forecastEnd: number | null
}

/** Points are in a 100 × 100 box with y down, drawn with a stretched viewBox. */
export function chartOf(data: KpiSignedByDayResponse, period: string, now = new Date()): Chart {
  const days = daysIn(period)
  const through = dayThrough(period, now)
  const signedTotal = data.signed.at(-1)?.cumulative ?? 0
  const picked = [...data.forecast].sort((a, b) => dayOf(a.day) - dayOf(b.day))
  const forecastEnd = picked.at(-1)?.cumulative ?? null
  const peak = Math.max(data.target ?? 0, signedTotal, forecastEnd ?? 0)
  const step = peak > 0 ? niceStep(peak) : 1
  const top = step * 3
  const x = (day: number) => (day / days) * 100
  const y = (value: number) => 100 - (value / top) * 100
  const at = (day: number, value: number) => `${x(day).toFixed(2)},${y(value).toFixed(2)}`

  const stairs = ['0,100']
  let before = 0
  for (const s of data.signed) {
    stairs.push(at(dayOf(s.day), before), at(dayOf(s.day), s.cumulative))
    before = s.cumulative
  }
  stairs.push(at(through, signedTotal))

  const lift = picked.length > 0 ? [at(through, signedTotal)] : []
  let level = signedTotal
  for (const f of picked) {
    const day = Math.max(dayOf(f.day), through)
    lift.push(at(day, level), at(day, f.cumulative))
    level = f.cumulative
  }
  lift.push(at(days, level))

  return {
    days,
    through,
    ticks: [0, 1, 2, 3].map((i) => i * step),
    top,
    signed: stairs.join(' '),
    signedArea: `${stairs.join(' ')} ${x(through).toFixed(2)},100`,
    forecast: picked.length > 0 ? lift.join(' ') : null,
    pace: data.target === null ? null : `0,100 100,${y(data.target).toFixed(2)}`,
    targetY: data.target === null ? null : y(data.target),
    todayX: through > 0 && through < days ? x(through) : null,
    dots: data.signed.map((s) => ({
      x: x(dayOf(s.day)),
      y: y(s.cumulative),
      code: s.contractCode,
      amount: s.amount,
    })),
    signedTotal,
    forecastEnd,
  }
}

/** Share of the running month already gone, for a spend or pipeline mark; null in any
 *  other month, where today is not inside it. */
export function monthPace(period: string, now = new Date()): number | null {
  return period === currentPick(now).month ? dayThrough(period, now) / daysIn(period) : null
}
