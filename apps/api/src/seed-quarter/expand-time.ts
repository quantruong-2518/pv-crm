import { addDays, dayOf, isWeekend, vnAt } from './clock'
import { HOURS } from './params'
import type { Rng } from './rng'
import type { Beat, Day } from './story.types'

/** Time helpers and the numbers the generator needs that `params.ts` does not
 *  carry. Every instant a human acts on goes through `Timer`, so working hours,
 *  the weekend share and "never after now" live in one place. */

export const DAY_MS = 86_400_000
const MIN_MS = 60_000

// generator-local: not in params.ts, listed in the report so they can be promoted.
export const LOCAL = {
  eventSpike: 4, // day-weight multiplier on the 3 days after an event
  webinarShare: 0.6, // INBOUND leads born in the webinar window that carry it
  referralCampaignShare: 0.5, // REFERRAL leads that belong to 'expansion'
  claimLagHours: [0.5, 20] as [number, number], // born -> claimed
  leadToDealDays: [1, 6] as [number, number], // lead care before the deal is opened
  careCount: [1, 6] as [number, number],
  snapMarginDays: 2, // slack for weekend / working-hour snapping on deal chains
  reclaimDays: 4, // extra age a recycled lead needs: park, then reclaim
  holdOpenShare: 0.5, // of sampled holds on open subjects, the share still open
  nextStepOverdueShare: 0.2, // of open next steps that are already late
  growthTailDays: 35, // sign must be this far back for a re-buy to be born
  growthAfterSignDays: [30, 60] as [number, number],
  terminationTailDays: 14, // first due (<=20) + termination lag after sign
  approvalLagDays: [0.5, 2] as [number, number], // request -> decision
  resubmitDays: [0.3, 1] as [number, number], // rejection -> second request
  signLagDays: [0.05, 0.3] as [number, number], // approval -> signed
  nextStepDoneShare: 0.5, // open next steps that follow an earlier done one
  meetingMinutes: [
    [30, 2],
    [45, 3],
    [60, 5],
    [90, 1],
    [120, 0.5],
  ] as [30 | 45 | 60 | 90 | 120, number][],
  meetingMode: [
    ['online', 40],
    ['onsite', 35],
    ['office', 25],
  ] as ['online' | 'onsite' | 'office', number][],
  channel: [
    ['call', 50],
    ['mail', 30],
    ['message', 20],
  ] as ['call' | 'mail' | 'message', number][],
  reachedShare: 0.7,
  rejectReasons: [
    'Thiếu điều khoản thanh toán, bổ sung rồi gửi lại.',
    'Giá trị hợp đồng khác báo giá đã chốt.',
    'Chưa có biên bản nghiệm thu mẫu đính kèm.',
    'Thông tin pháp nhân của khách chưa khớp đăng ký.',
  ],
}

/** Thrown when one random draw cannot meet a fixed outcome; the caller redraws. */
export class Infeasible extends Error {}

const vnHour = (t: Date): number =>
  Number(new Date(t.getTime() + 7 * 3.6e6).toISOString().slice(11, 13))
export const hourOf = vnHour

export type Timer = {
  now: Date
  today: Day
  /** Nearest working-hours instant to `t`, strictly after `floor`, never after now. */
  snap(t: Date, floor: Date): Date
  after(prev: Date, days: number): Date
  /** Random working instant in [a, b]; `a` when the interval is empty. */
  between(a: Date, b: Date): Date
  /** Working instant on `day`; capped at now when the day is today. */
  onDay(day: Day, floor?: Date): Date
  /** Working instant on a day after today (weekends move to Monday). */
  ahead(day: Day): Date
  minutes(t: Date, n: number): Date
}

export function makeTimer(rng: Rng, now: Date): Timer {
  const today = dayOf(now)
  const s = HOURS.weekendShare
  const weekendKeep = (5 * s) / (2 * (1 - s))
  const nowMs = now.getTime()
  const clamp = (t: Date, floor: Date): Date => {
    if (t.getTime() <= nowMs) return t
    const back = new Date(nowMs - rng.int(5, 120) * MIN_MS)
    return back.getTime() > floor.getTime() ? back : floor
  }
  const nearestWeekday = (day: Day, floorDay: Day): Day => {
    let back = day
    while (isWeekend(back)) back = addDays(back, -1)
    if (back >= floorDay) return back
    let fwd = day
    while (isWeekend(fwd)) fwd = addDays(fwd, 1)
    return fwd
  }
  const snap = (t: Date, floor: Date): Date => {
    let day = dayOf(t)
    if (isWeekend(day) && !rng.chance(weekendKeep)) day = nearestWeekday(day, dayOf(floor))
    let c = vnAt(day, rng.int(8, 17), rng.int(0, 59))
    if (c.getTime() <= floor.getTime()) {
      c = new Date(floor.getTime() + rng.int(10, 90) * MIN_MS)
      const h = vnHour(c)
      if (h >= 18) c = vnAt(addDays(dayOf(c), 1), 8, rng.int(0, 50))
      else if (h < 8) c = vnAt(dayOf(c), 8, rng.int(0, 50))
    }
    return clamp(c, floor)
  }
  const between = (a: Date, b: Date): Date => {
    if (b.getTime() <= a.getTime()) return a
    const t = new Date(a.getTime() + rng.next() * (b.getTime() - a.getTime()))
    const r = snap(t, a)
    return r.getTime() > b.getTime() ? b : r
  }
  const onDay = (day: Day, floor?: Date): Date => {
    const maxH = day === today ? Math.max(8, Math.min(17, vnHour(now) - 1)) : 17
    let c = vnAt(day, rng.int(8, maxH), rng.int(0, 59))
    if (floor && c.getTime() <= floor.getTime()) {
      c = new Date(floor.getTime() + rng.int(10, 60) * MIN_MS)
    }
    return day <= today ? clamp(c, floor ?? c) : c
  }
  const ahead = (day: Day): Date => {
    let d = day
    while (isWeekend(d)) d = addDays(d, 1)
    return vnAt(d, rng.int(8, 17), rng.int(0, 59))
  }
  return {
    now,
    today,
    snap,
    after: (prev, days) => snap(new Date(prev.getTime() + days * DAY_MS), prev),
    between,
    onDay,
    ahead,
    minutes: (t, n) => {
      const r = new Date(t.getTime() + n * MIN_MS)
      return r.getTime() > nowMs ? new Date(nowMs) : r
    },
  }
}

/** Durations for a chain of steps: each drawn in its range, then squeezed
 *  toward its minimum when the chain would not fit in `avail` days. */
export function compress(rng: Rng, steps: [number, number][], avail: number): number[] {
  const d = steps.map(([lo, hi]) => rng.real(lo, hi))
  const lows = steps.reduce((n, [lo]) => n + lo, 0)
  const total = d.reduce((n, x) => n + x, 0)
  if (total <= avail || total <= lows) return d
  const k = Math.max(0, avail - lows) / (total - lows)
  return d.map((x, i) => steps[i]![0] + (x - steps[i]![0]) * k)
}

/** Sort key of a beat. An installment has no `at`: it sorts by its last real
 *  event, or by its due morning capped at now. */
export function beatAt(b: Beat, now: Date): Date {
  if (b.kind !== 'installment') return b.at
  const due = vnAt(b.due, 9)
  return b.paidAt ?? b.reason?.at ?? (due.getTime() > now.getTime() ? now : due)
}

/** Deal-side kinds: after `deal-lost` none of these may follow. */
export const DEAL_KINDS: ReadonlySet<Beat['kind']> = new Set([
  'deal-opened',
  'deal-accepted',
  'stage',
  'activity',
  'quote',
  'owner-changed',
  'sign-requested',
  'sign-decided',
  'signed',
])

/** `n` increasing working instants in [start, stop], spread uniformly; an
 *  instant the snapping pushes past `stop` is held at `stop`. */
export function spread(rng: Rng, tm: Timer, start: Date, stop: Date, n: number): Date[] {
  const span = Math.max(0, stop.getTime() - start.getTime())
  const fractions = Array.from({ length: n }, () => rng.next()).sort((x, y) => x - y)
  const out: Date[] = []
  let prev = start
  for (const f of fractions) {
    let t = tm.snap(new Date(start.getTime() + f * span), prev)
    if (t.getTime() > stop.getTime()) t = stop.getTime() >= prev.getTime() ? stop : prev
    out.push(t)
    prev = t
  }
  return out
}

/** Instants the lead, deal and contract phases hand to the side beats (holds,
 *  next steps, meetings). Null = that step never happened. */
export type Anchors = {
  claim: Date | null
  firstTouch: Date | null
  /** The park that ended the lead's own work (not the automatic one after a loss). */
  parked: Date | null
  disabledAt: Date | null
  dealOpen: Date | null
  accept: Date | null
  lost: Date | null
  signed: Date | null
  /** Who owns the deal at an instant (primary SALE, after any hand-over). */
  ownerAt: (t: Date) => string
}
