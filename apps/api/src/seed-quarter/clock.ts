import type { Day } from './story.types'

/** Vietnam calendar arithmetic. Asia/Ho_Chi_Minh is UTC+7 all year with no
 *  DST, so a fixed offset is exact and needs no tz database (the repo's other
 *  seed, `seed-kpi/cast.ts`, does the same). Days are 'YYYY-MM-DD' strings. */

const OFFSET_MS = 7 * 3.6e6
const DAY_MS = 86_400_000
const pad = (n: number): string => String(n).padStart(2, '0')

/** The instant at `hour:minute` Vietnam time on `day`. */
export const vnAt = (day: Day, hour: number, minute = 0): Date =>
  new Date(`${day}T${pad(hour)}:${pad(minute)}:00+07:00`)

/** The Vietnam calendar day an instant falls on. */
export const dayOf = (at: Date): Day =>
  new Date(at.getTime() + OFFSET_MS).toISOString().slice(0, 10)

const utcMidnight = (day: Day): number => Date.parse(`${day}T00:00:00Z`)

export const addDays = (day: Day, n: number): Day =>
  new Date(utcMidnight(day) + n * DAY_MS).toISOString().slice(0, 10)

/** Whole days from `a` to `b`; negative when `b` is earlier. */
export const daysBetween = (a: Day, b: Day): number =>
  Math.round((utcMidnight(b) - utcMidnight(a)) / DAY_MS)

export const isWeekend = (day: Day): boolean => {
  const d = new Date(utcMidnight(day)).getUTCDay()
  return d === 0 || d === 6
}

/** 'YYYY-MM' of a day. */
export const monthOf = (day: Day): string => day.slice(0, 7)

/** Whole hours added to an instant. */
export const plusHours = (at: Date, hours: number): Date => new Date(at.getTime() + hours * 3.6e6)
