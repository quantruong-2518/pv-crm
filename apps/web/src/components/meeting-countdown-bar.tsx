import { useNavigate } from 'react-router-dom'
import { ArrowRight, Button, CalendarClock, Icon, Timer } from '@pv/ui'
import type { MeetingTodayResponse } from '@pv/contracts'
import { subjectKindLabel, subjectPath } from '@/data/comm-record-detail'
import { meetingSlotOf } from '@/data/meeting-labels'
import { useMinuteClock } from '@/data/minute-clock'

/** The second bar under the header — today's next meeting of this person,
 *  counted down in HH:MM (the `subBar` slot of `AppShell`).
 *
 *  Before the start: the time left to it. Between start and end: "in the
 *  meeting", with the time left to its end. After the end it hides — a meeting
 *  not yet closed out is marked on its record, never nagged from here. The
 *  server sends the moments; this side only ticks once a minute. Flat warning
 *  tint over the opaque bar surface: no glow of its own (law 12). One row at
 *  every width; a phone drops the secondary facts rather than wrap. */

const MINUTE_MS = 60_000

export function MeetingCountdownBar({ today }: { today: MeetingTodayResponse | undefined }) {
  const now = useMinuteClock()
  const navigate = useNavigate()
  const next = today?.next
  if (!next) return null

  const at = Date.parse(next.at)
  const ends = Date.parse(next.endsAt)
  if (!(now < ends)) return null
  const live = now >= at
  const left = hhmm((live ? ends : at) - now)
  const path = subjectPath(next.subjectCode)
  const kind = subjectKindLabel(next.subjectCode)
  const remaining = today.remaining

  return (
    <section aria-label="Buổi họp tiếp theo hôm nay" className="relative">
      <div aria-hidden className="bg-popover absolute inset-0" />
      <div aria-hidden className="bg-warning/12 absolute inset-0" />
      <div className="pointer-coarse:min-h-12 relative mx-auto flex min-h-10 w-full max-w-[1648px] items-center gap-x-3 px-4 py-1 lg:px-6">
        <Icon
          icon={live ? Timer : CalendarClock}
          size={16}
          className="text-on-tint-warning shrink-0"
        />
        {/* A phone drops the "in the meeting" prefix (the timer icon says it) so the title keeps its room. */}
        <span className="text-on-tint-warning tnum shrink-0 text-[12.5px] font-semibold">
          {live ? (
            <>
              <span aria-hidden className="sm:hidden">
                Còn {left}
              </span>
              <span className="sr-only sm:not-sr-only">Đang họp · còn {left}</span>
            </>
          ) : (
            `Còn ${left}`
          )}
        </span>
        {!live && (
          <span className="text-muted-foreground tnum hidden shrink-0 text-[12px] sm:inline">
            tới buổi họp lúc {meetingSlotOf(next.at).time}
          </span>
        )}
        <span className="text-foreground min-w-0 flex-1 truncate text-[12.5px] font-medium">
          {next.title}
          <span className="text-muted-foreground hidden font-normal sm:inline">
            {' · '}
            {kind} <span className="font-mono text-[11.5px]">{next.subjectCode}</span>
          </span>
        </span>
        {remaining > 0 && (
          <span className="text-muted-foreground tnum hidden shrink-0 text-[12px] md:inline">
            còn {remaining} buổi khác hôm nay
          </span>
        )}
        {path && (
          <Button
            size="sm"
            variant="ghost"
            className="pointer-coarse:h-12 pointer-coarse:max-sm:w-12 shrink-0"
            aria-label={`Mở ${kind.toLowerCase()} ${next.subjectCode}`}
            onClick={() => navigate(path)}
          >
            <span className="hidden sm:inline">Mở {kind.toLowerCase()}</span>
            <Icon icon={ArrowRight} size={16} />
          </Button>
        )}
      </div>
    </section>
  )
}

/** "01:05" — whole minutes rounded up, so a meeting never reads "00:00" while
 *  it is still ahead. */
function hhmm(ms: number): string {
  const minutes = Math.max(0, Math.ceil(ms / MINUTE_MS))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`
}
