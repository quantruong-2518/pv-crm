import { vnDayOf } from '@pv/contracts'

/** The re-contact choice and the day it becomes (ADR 0125 D5), apart from the
 *  field so the drawers can judge readiness and build the body. The months turn
 *  into a day on the Vietnam calendar; the door judges "after today" itself. */

export const RECONTACT_CHOICES = [
  { value: '1', label: '1 tháng' },
  { value: '3', label: '3 tháng' },
  { value: '6', label: '6 tháng' },
  { value: 'pick', label: 'Chọn ngày' },
  { value: 'none', label: 'Không hẹn' },
] as const

export type RecontactChoice = (typeof RECONTACT_CHOICES)[number]['value']
export type RecontactPick = { choice: RecontactChoice; day: string }

export const RECONTACT_DEFAULT: RecontactPick = { choice: '3', day: '' }

const DAY_MS = 86_400_000
export const tomorrowOf = (today: string) =>
  new Date(Date.parse(`${today}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10)

/** `day` plus whole months, held to the month's end (31/01 + 1 → 28/02). */
function addMonths(day: string, months: number): string {
  const [y = 0, m = 1, d = 1] = day.split('-').map(Number)
  const lastDay = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate()
  return new Date(Date.UTC(y, m - 1 + months, Math.min(d, lastDay))).toISOString().slice(0, 10)
}

/** What the body carries: a day, `null` for no date, `undefined` while
 *  the pick-a-day choice still lacks a day after today. */
export function recontactOnOf(
  pick: RecontactPick,
  today = vnDayOf(new Date()),
): string | null | undefined {
  if (pick.choice === 'none') return null
  if (pick.choice === 'pick') return pick.day > today ? pick.day : undefined
  return addMonths(today, Number(pick.choice))
}
