import { useQuery } from '@tanstack/react-query'
import type { MeetingRow } from '@pv/contracts'
import { meetingsQuery, type MeetingSubject } from '@/data/meetings'

/** The EARLIEST meeting not yet over and not closed out — an in-progress one
 *  counts, the same cut as `GET /sales/meetings/today` (no length = over at its
 *  start), so this card and the countdown bar agree. The server answers in its
 *  own order, so "next" is chosen here rather than taken off the top. */
export function upcomingOf(rows: readonly MeetingRow[], now: number): MeetingRow | undefined {
  let best: MeetingRow | undefined
  let bestAt = Infinity
  for (const row of rows) {
    const at = Date.parse(row.at)
    const ends = at + (row.durationMinutes ?? 0) * 60_000
    if (row.heldAt !== null || !Number.isFinite(at) || ends <= now || at >= bestAt) continue
    best = row
    bestAt = at
  }
  return best
}

/** Whether the meeting row on the floating bar will draw: it shows the list
 *  when there are meetings and the booking button when the reader may book.
 *  The bar sizes its room (one row or two) off this. */
export function useDockRow(subject: MeetingSubject, canEdit: boolean): boolean {
  const { data } = useQuery(meetingsQuery(subject))
  return canEdit || (data?.rows.length ?? 0) > 0
}
