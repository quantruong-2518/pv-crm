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
  /** Every drawn line in box units (0–100), for placing labels clear of them. */
  lines: Pt[][]
  signedTotal: number
  /** Where the picked opportunities take the month; `null` with none picked. */
  forecastEnd: number | null
}

type Pt = [number, number]

const pointsOf = (points: string | null): Pt[] =>
  points === null ? [] : points.split(' ').map((p) => p.split(',').map(Number) as Pt)

export type Rect = { left: number; top: number; width: number; height: number }

/** Plot height in px; labels are placed in px because their size does not stretch with the box. */
export const PLOT_H = 224
export const LABEL_H = 18
/** Clear space kept between a label and any line, dot or other label. */
const MARGIN = 6
const DOT_R = 5

/** A text label's width: a 12 px figure font plus the 4 px padding either side. */
export const labelWidth = (text: string) => Math.ceil(text.length * 6.8) + 8

/** Whether the segment touches the rect (Liang–Barsky clipping). */
function segmentHits(a: Pt, b: Pt, r: Rect): boolean {
  let t0 = 0
  let t1 = 1
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const edges: [number, number][] = [
    [-dx, a[0] - r.left],
    [dx, r.left + r.width - a[0]],
    [-dy, a[1] - r.top],
    [dy, r.top + r.height - a[1]],
  ]
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false
    } else {
      const f = q / p
      if (p < 0) t0 = Math.max(t0, f)
      else t1 = Math.min(t1, f)
      if (t0 > t1) return false
    }
  }
  return true
}

const grow = (r: Rect, by: number): Rect => ({
  left: r.left - by,
  top: r.top - by,
  width: r.width + 2 * by,
  height: r.height + 2 * by,
})

const overlaps = (a: Rect, b: Rect) =>
  a.left < b.left + b.width &&
  b.left < a.left + a.width &&
  a.top < b.top + b.height &&
  b.top < a.top + a.height

/** Where each named dot's label goes, in px from the plot's top-left. A spot is taken only
 *  when no drawn segment, dot, the target label or an earlier label comes within MARGIN of
 *  it; a dot with no such spot gets no label (its tooltip and the list below name it). */
export function placeLabels(
  chart: Chart,
  size: { width: number; height: number },
  named: readonly ChartDot[],
  texts: ReadonlyMap<ChartDot, string>,
  blocked: readonly Rect[],
): Map<ChartDot, Rect> {
  const px = (p: Pt): Pt => [(p[0] / 100) * size.width, (p[1] / 100) * size.height]
  const segments = chart.lines.flatMap((line) =>
    line.slice(1).map((to, i) => [px(line[i]!), px(to)] as const),
  )
  const dots = chart.dots.map((d) => {
    const [x, y] = px([d.x, d.y])
    return { d, r: { left: x - DOT_R, top: y - DOT_R, width: 2 * DOT_R, height: 2 * DOT_R } }
  })
  const taken: Rect[] = [...blocked]
  const placed = new Map<ChartDot, Rect>()
  for (const dot of named) {
    const width = labelWidth(texts.get(dot) ?? '')
    const [cx, cy] = px([dot.x, dot.y])
    const spots: Rect[] = []
    for (const lift of [8, 22, 38]) {
      for (const right of [true, false]) {
        for (const above of [true, false]) {
          spots.push({
            left: right ? cx + 8 : cx - 8 - width,
            top: above ? cy - lift - LABEL_H : cy + lift,
            width,
            height: LABEL_H,
          })
        }
      }
    }
    const clear = spots.find((r) => {
      if (
        r.left < 0 ||
        r.left + r.width > size.width ||
        r.top < 0 ||
        r.top + r.height > size.height
      )
        return false
      const wide = grow(r, MARGIN)
      const others = dots.filter((o) => o.d !== dot).map((o) => o.r)
      return (
        !segments.some(([a, b]) => segmentHits(a, b, wide)) &&
        ![...taken, ...others].some((t) => overlaps(wide, t))
      )
    })
    if (clear) {
      placed.set(dot, clear)
      taken.push(clear)
    }
  }
  return placed
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

  const dots = data.signed.map((s) => ({
    x: x(dayOf(s.day)),
    y: y(s.cumulative),
    code: s.contractCode,
    amount: s.amount,
  }))
  const pace = data.target === null ? null : `0,100 100,${y(data.target).toFixed(2)}`
  const lines = [pointsOf(stairs.join(' ')), pointsOf(lift.join(' ')), pointsOf(pace)]
  if (data.target !== null)
    lines.push([
      [0, y(data.target)],
      [100, y(data.target)],
    ])
  if (through > 0 && through < days)
    lines.push([
      [x(through), 0],
      [x(through), 100],
    ])

  return {
    days,
    through,
    ticks: [0, 1, 2, 3].map((i) => i * step),
    top,
    signed: stairs.join(' '),
    signedArea: `${stairs.join(' ')} ${x(through).toFixed(2)},100`,
    forecast: picked.length > 0 ? lift.join(' ') : null,
    pace,
    targetY: data.target === null ? null : y(data.target),
    todayX: through > 0 && through < days ? x(through) : null,
    dots,
    lines,
    signedTotal,
    forecastEnd,
  }
}

/** Share of the running month already gone, for a spend or pipeline mark; null in any
 *  other month, where today is not inside it. */
export function monthPace(period: string, now = new Date()): number | null {
  return period === currentPick(now).month ? dayThrough(period, now) / daysIn(period) : null
}
