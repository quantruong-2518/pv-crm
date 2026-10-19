import { useQuery } from '@tanstack/react-query'
import type { MeetingRow } from '@pv/contracts'
import { meetingsQuery, type MeetingSubject } from '@/data/meetings'

/** Not yet over and not closed out (held or cancelled) — an in-progress one
 *  counts, the same cut as `GET /sales/meetings/today` (no length = over at its
 *  start), so this card and the countdown bar agree. */
function isUpcoming(row: MeetingRow, now: number): boolean {
  const at = Date.parse(row.at)
  const ends = at + (row.durationMinutes ?? 0) * 60_000
  return row.heldAt === null && row.cancelledAt === null && Number.isFinite(at) && ends > now
}

/** The EARLIEST upcoming meeting. The server answers in its own order, so
 *  "next" is chosen here rather than taken off the top. */
export function upcomingOf(rows: readonly MeetingRow[], now: number): MeetingRow | undefined {
  let best: MeetingRow | undefined
  let bestAt = Infinity
  for (const row of rows) {
    const at = Date.parse(row.at)
    if (!isUpcoming(row, now) || at >= bestAt) continue
    best = row
    bestAt = at
  }
  return best
}

/** The meetings a stop would cancel: the server's cut is a start strictly in
 *  the future, so an in-progress one (which `isUpcoming` counts) is not among
 *  them. A failed or unauthorised read is none: the stop must not wait on it. */
export function cancellableOf(rows: readonly MeetingRow[] | undefined, now: number): MeetingRow[] {
  return (rows ?? []).filter(
    (row) => row.heldAt === null && row.cancelledAt === null && Date.parse(row.at) > now,
  )
}

/** Whether the meeting row on the floating bar will draw: it shows the list
 *  when there are meetings and the booking button when the reader may book.
 *  The bar sizes its room (one row or two) off this. */
export function useDockRow(subject: MeetingSubject, canEdit: boolean): boolean {
  const { data } = useQuery(meetingsQuery(subject))
  return canEdit || (data?.rows.length ?? 0) > 0
}
