import type { MeetingDurationMinutes, MeetingMode } from '@pv/contracts'

/** Vietnamese labels for the two closed sets `sales/meeting.ts` owns, plus the
 *  ONE formatter both the booking drawer and the meetings card read a moment
 *  through — see `meetingSlotLabel`.
 *
 *  The labels live on the WEB side on the rule the repo already follows for
 *  every other enum: the value is an identifier that reaches Postgres, JSON and
 *  a `CHECK` constraint, the label is content exactly one screen shows. Putting
 *  the Vietnamese in the contract would ship it to a server that never renders
 *  a word of it. */

/** Vietnam is UTC+7 the whole year — no DST since 1975 — so a wall clock typed
 *  into the drawer maps to exactly ONE instant under a fixed offset.
 *
 *  Reading the machine's zone instead (what `new Date('2026-09-18T10:00')`
 *  does) would make the readback line's promise of Vietnam time false on a
 *  laptop set to Seoul: the screen would say 10:00 Hanoi and book 08:00. */
const VN_OFFSET = '+07:00'
const VN_ZONE = 'Asia/Ho_Chi_Minh'

/** A stored instant read back as a Vietnam wall clock, so the card prints the
 *  hour the drawer booked. `h23` rather than `hour12: false`, which some
 *  engines still answer with "24" at midnight. */
const VN_PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: VN_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** Vietnamese weekday abbreviations, Sunday-first to match `Date.getUTCDay()`. */
const WEEKDAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'] as const

const MINUTES_PER_DAY = 24 * 60

export const MEETING_MODE_LABEL: Record<MeetingMode, string> = {
  online: 'Online',
  onsite: 'Tại nhà máy khách',
  office: 'Văn phòng mình',
}

/** Render order of the three options, so the drawer does not depend on the key
 *  order of the record above — `Object.keys` order is a language detail, and a
 *  radio row reordering itself after an unrelated edit is a real regression. */
export const MEETING_MODE_ORDER: readonly MeetingMode[] = ['online', 'onsite', 'office']

/** An hour is worded as an hour, not as sixty minutes: both sides of the table
 *  read a calendar invite, and no calendar app words a full hour in minutes. */
export const MEETING_DURATION_LABEL: Record<MeetingDurationMinutes, string> = {
  30: '30 phút',
  45: '45 phút',
  60: '1 giờ',
  90: '1 giờ 30 phút',
  120: '2 giờ',
}

/** The two the drawer opens on, written the same way and kept side by side —
 *  one of them used to be a bare string inside the component, which is how two
 *  defaults for one form drift apart. */
export const DEFAULT_MEETING_DURATION: MeetingDurationMinutes = 30
export const DEFAULT_MEETING_MODE: MeetingMode = 'online'

/** A slot as the three inputs hold it: a calendar day, a wall clock, a length.
 *  Both strings are exactly what `<input type="date">` and `<input type="time">`
 *  hand back, and empty while nothing is picked. */
export type MeetingSlot = {
  date: string
  time: string
  durationMinutes: MeetingDurationMinutes
}

const DATE_PART = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_PART = /^(\d{2}):(\d{2})$/

const clock = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

/** '2026-09-18' · '10:00' · 60 → weekday, day/month/year, the hour range, and
 *  the zone named out loud.
 *
 *  Empty while either half is still blank — the caller hides the line rather
 *  than print half a sentence. This is the one control on the drawer that
 *  catches a mistyped date, so it is computed from the three inputs every time
 *  and never from a formatted copy of them. */
export function meetingSlotLabel({ date, time, durationMinutes }: MeetingSlot): string {
  const written = writtenSlot(date, time, durationMinutes)
  return written === '' ? '' : `${written} (giờ Việt Nam)`
}

/** The same line for a row already stored, read back in Vietnam time so the
 *  card and the drawer never disagree about what hour a meeting is at.
 *
 *  `durationMinutes` is absent on every row written before migration 0050, and
 *  the answer then is the START ALONE: a range built from a length nobody
 *  recorded is an invented fact about a real meeting, and a zero-minute one is
 *  worse. The zone is named once by the card's heading, not on every row. */
export function meetingRowLabel(iso: string, durationMinutes?: MeetingDurationMinutes): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return iso

  const part: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {}
  for (const piece of VN_PARTS.formatToParts(at)) part[piece.type] = piece.value

  const date = `${part.year ?? ''}-${part.month ?? ''}-${part.day ?? ''}`
  const time = `${part.hour ?? ''}:${part.minute ?? ''}`
  const written = writtenSlot(date, time, durationMinutes)
  return written === '' ? iso : written
}

/** Shared body of the two above. Without a length it stops at the start time. */
function writtenSlot(date: string, time: string, durationMinutes?: number): string {
  const day = DATE_PART.exec(date)
  const start = TIME_PART.exec(time)
  if (!day || !start) return ''

  const [, year = '', month = '', dayOfMonth = ''] = day
  const [, hour = '', minute = ''] = start

  /* Weekday read in UTC so the answer cannot depend on the reader's zone — a
     calendar day falls on one weekday everywhere on Earth. */
  const weekday =
    WEEKDAY[new Date(Date.UTC(Number(year), Number(month) - 1, Number(dayOfMonth))).getUTCDay()] ??
    ''
  const startMinutes = Number(hour) * 60 + Number(minute)
  const head = `${weekday}, ${dayOfMonth}/${month}/${year} · ${clock(startMinutes)}`
  if (durationMinutes === undefined) return head

  const endMinutes = startMinutes + durationMinutes
  const rollsOver = endMinutes >= MINUTES_PER_DAY
  return `${head}–${clock(endMinutes % MINUTES_PER_DAY)}${rollsOver ? ' hôm sau' : ''}`
}

/** The slot as the `Moment` the contract wants. Returns an empty string while
 *  the slot is incomplete, so the caller's blocker — not this function — is
 *  what refuses the send. */
export function meetingSlotMoment({ date, time }: MeetingSlot): string {
  if (!DATE_PART.test(date) || !TIME_PART.test(time)) return ''
  return new Date(`${date}T${time}:00${VN_OFFSET}`).toISOString()
}
