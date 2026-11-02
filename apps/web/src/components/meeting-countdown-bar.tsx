import { useNavigate } from 'react-router-dom'
import { ArrowRight, Button, CalendarCheck, CalendarClock, Icon, Link, Timer } from '@pv/ui'
import type { MeetingTodayResponse } from '@pv/contracts'
import { subjectKindLabel, subjectPath } from '@/data/comm-record-detail'
import { message, useI18n } from '@/app/i18n'
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
  const { t, lang } = useI18n()
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
  const kind = subjectKindLabel(next.subjectCode, lang)
  const leftText = t(message(`Còn ${left}`, `${left} left`, `${left} 남음`))
  const remaining = today.remaining

  return (
    <section
      aria-label={t(message('Buổi họp tiếp theo hôm nay', 'Next meeting today', '오늘 다음 회의'))}
      className="relative"
    >
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
                {leftText}
              </span>
              <span className="sr-only sm:not-sr-only">
                {t(
                  message(
                    `Đang họp · còn ${left}`,
                    `In meeting · ${left} left`,
                    `회의 중 · ${left} 남음`,
                  ),
                )}
              </span>
            </>
          ) : (
            leftText
          )}
        </span>
        {!live && (
          <span className="text-muted-foreground tnum hidden shrink-0 text-[12px] sm:inline">
            {t(
              message(
                `tới buổi họp lúc ${meetingSlotOf(next.at).time}`,
                `until the meeting at ${meetingSlotOf(next.at).time}`,
                `회의 시작(${meetingSlotOf(next.at).time})까지`,
              ),
            )}
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
            {t(
              message(
                `còn ${remaining} buổi khác hôm nay`,
                `${remaining} more ${remaining === 1 ? 'meeting' : 'meetings'} today`,
                `오늘 회의 ${remaining}건 더 있음`,
              ),
            )}
          </span>
        )}
        {next.link && (
          <Button
            size="sm"
            variant="ghost"
            className="pointer-coarse:h-12 pointer-coarse:max-sm:w-12 shrink-0"
            aria-label={t(message('Vào họp', 'Join meeting', '회의 참여'))}
            onClick={() => openTab(next.link)}
          >
            <Icon icon={Link} size={16} />
            <span className="hidden sm:inline">
              {t(message('Vào họp', 'Join meeting', '회의 참여'))}
            </span>
          </Button>
        )}
        {next.eventUrl && (
          <Button
            size="sm"
            variant="ghost"
            className="pointer-coarse:h-12 shrink-0 max-sm:hidden"
            aria-label={t(
              message(
                'Mở buổi họp trên Google Calendar',
                'Open the meeting in Google Calendar',
                'Google Calendar에서 회의 열기',
              ),
            )}
            onClick={() => openTab(next.eventUrl)}
          >
            <Icon icon={CalendarCheck} size={16} />
            <span>
              {t(message('Mở Google Calendar', 'Open Google Calendar', 'Google Calendar 열기'))}
            </span>
          </Button>
        )}
        {path && (
          <Button
            size="sm"
            variant="ghost"
            className="pointer-coarse:h-12 pointer-coarse:max-sm:w-12 shrink-0"
            aria-label={t(
              message(
                `Mở ${kind.toLowerCase()} ${next.subjectCode}`,
                `Open ${kind.toLowerCase()} ${next.subjectCode}`,
                `${kind} ${next.subjectCode} 열기`,
              ),
            )}
            onClick={() => navigate(path)}
          >
            <span className="hidden sm:inline">
              {t(message(`Mở ${kind.toLowerCase()}`, `Open ${kind.toLowerCase()}`, `${kind} 열기`))}
            </span>
            <Icon icon={ArrowRight} size={16} />
          </Button>
        )}
      </div>
    </section>
  )
}

/** A button, not an anchor: `Button` has no anchor form, and `noopener` keeps
 *  the pasted meeting link away from `window.opener`. */
const openTab = (url: string | null | undefined) =>
  window.open(url ?? '', '_blank', 'noopener,noreferrer')

/** "01:05" — whole minutes rounded up, so a meeting never reads "00:00" while
 *  it is still ahead. */
function hhmm(ms: number): string {
  const minutes = Math.max(0, Math.ceil(ms / MINUTE_MS))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`
}
