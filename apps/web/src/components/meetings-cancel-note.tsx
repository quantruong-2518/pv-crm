import { useQueries } from '@tanstack/react-query'
import { message, useI18n } from '@/app/i18n'
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
  const { t } = useI18n()
  const now = useMinuteClock()
  const lists = useQueries({ queries: subjects.map((s) => ({ ...meetingsQuery(s), enabled })) })
  const rows = lists.flatMap((list) => cancellableOf(list.data?.rows, now))

  if (rows.length === 0) return null
  /* Guests get a mail only for a meeting that reached Google Calendar. */
  const mailed = rows.some((row) => row.eventUrl)
  return (
    <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">
      {t(
        mailed
          ? message(
              `${rows.length} lịch họp sắp tới sẽ huỷ, khách nhận thư báo huỷ.`,
              `${rows.length} upcoming ${rows.length === 1 ? 'meeting' : 'meetings'} will be cancelled and guests receive a cancellation email.`,
              `예정된 미팅 ${rows.length}건이 취소되며 게스트에게 취소 메일이 발송됩니다.`,
            )
          : message(
              `${rows.length} lịch họp sắp tới sẽ huỷ.`,
              `${rows.length} upcoming ${rows.length === 1 ? 'meeting' : 'meetings'} will be cancelled.`,
              `예정된 미팅 ${rows.length}건이 취소됩니다.`,
            ),
      )}
    </p>
  )
}
