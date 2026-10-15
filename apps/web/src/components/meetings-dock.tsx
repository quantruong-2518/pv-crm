import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, CalendarClock, Drawer, Icon, Plus } from '@pv/ui'
import { dmhm } from '@/lib/date'
import { meetingsQuery, type MeetingSubject } from '@/data/meetings'
import { useMinuteClock } from '@/data/minute-clock'
import { MeetingScheduleDrawer } from '@/components/meeting-schedule-drawer'
import { MeetingsPanel } from '@/components/meetings-card'
import { upcomingOf } from '@/data/meeting-upcoming'

/** The meeting row on top of a lead's or a deal's floating bar: the next
 *  meeting in one line, a button for the whole list (the meetings panel in a
 *  drawer) and one to book, for a reader who may. With no meeting to show and
 *  no right to book there is nothing to draw. Where the bar is not drawn (a
 *  lost deal, a switched-off lead) the page puts this row in its main column,
 *  read-only, so past meetings stay reachable. */
export function MeetingsDock({ subject, canEdit }: { subject: MeetingSubject; canEdit: boolean }) {
  const { data } = useQuery(meetingsQuery(subject))
  const now = useMinuteClock()
  const [listing, setListing] = useState(false)
  const [booking, setBooking] = useState(false)
  const rows = data?.rows ?? []
  const next = upcomingOf(rows, now)

  if (rows.length === 0 && !canEdit) return null

  return (
    <div
      role="group"
      aria-label="Lịch gặp"
      className="bg-surface-ink/9 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-md py-1 pl-3 pr-1"
    >
      <Icon icon={CalendarClock} size={16} className="text-accent-foreground shrink-0" />
      <span className="tnum min-w-0 basis-full truncate text-[13px] sm:flex-1 sm:basis-0">
        {next ? (
          <>
            <span className="font-semibold">{dmhm(next.at).replace(' ', ' · ')}</span> ·{' '}
            {next.title}
            {next.guests.length > 0 && (
              <span className="text-muted-foreground"> · {next.guests.length} khách mời</span>
            )}
          </>
        ) : (
          <span className="text-muted-foreground">
            {rows.length === 0 ? 'Chưa có lịch họp' : 'Không còn buổi nào sắp tới'}
          </span>
        )}
      </span>
      {rows.length > 0 && (
        <Button
          size="sm"
          variant="ghost"
          className="pointer-coarse:h-12"
          onClick={() => setListing(true)}
        >
          Xem lịch
        </Button>
      )}
      {canEdit && (
        <Button
          size="sm"
          variant="secondary"
          className="pointer-coarse:h-12"
          onClick={() => setBooking(true)}
        >
          <Icon icon={Plus} size={16} />
          Đặt lịch
        </Button>
      )}

      <Drawer
        open={listing}
        onClose={() => setListing(false)}
        title="Lịch gặp"
        subtitle={<span className="font-mono">{subject.code}</span>}
        width="lg"
      >
        <MeetingsPanel subject={subject} canEdit={canEdit} all />
      </Drawer>
      {canEdit && (
        <MeetingScheduleDrawer subject={subject} open={booking} onClose={() => setBooking(false)} />
      )}
    </div>
  )
}
