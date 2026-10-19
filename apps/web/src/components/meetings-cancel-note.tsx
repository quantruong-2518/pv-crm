import { useQueries } from '@tanstack/react-query'
import { cancellableOf } from '@/data/meeting-upcoming'
import { meetingsQuery, type MeetingSubject } from '@/data/meetings'
import { useMinuteClock } from '@/data/minute-clock'

/** The line a stop dialog prints when it will cancel booked meetings. Reads
 *  the lists the profile already holds; a failed or forbidden read prints
 *  nothing, because the stop itself does not depend on it. */
export function MeetingsCancelNote({
  subjects,
  enabled,
}: {
  subjects: readonly MeetingSubject[]
  enabled: boolean
}) {
  const now = useMinuteClock()
  const lists = useQueries({ queries: subjects.map((s) => ({ ...meetingsQuery(s), enabled })) })
  const rows = lists.flatMap((list) => cancellableOf(list.data?.rows, now))

  if (rows.length === 0) return null
  /* Guests get a mail only for a meeting that reached Google Calendar. */
  const mailed = rows.some((row) => row.eventUrl)
  return (
    <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">
      {rows.length} lịch họp sắp tới sẽ huỷ{mailed ? ', khách nhận thư báo huỷ' : ''}.
    </p>
  )
}
