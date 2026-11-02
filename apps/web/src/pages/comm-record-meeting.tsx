import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Button, CalendarClock, Check, GlassCard, Icon, Link, SectionTitle, Skeleton } from '@pv/ui'
import type { DebriefView, MeetingRow } from '@pv/contracts'
import { useCan } from '@/app/auth'
import { message, useI18n } from '@/app/i18n'
import { isApiError, userMessage } from '@/app/api'
import { dmhm } from '@/lib/date'
import { CommRecordFrame } from '@/components/comm-record-frame'
import { MeetingHeldForm } from '@/components/meeting-held-form'
import { MeetingScheduleDrawer } from '@/components/meeting-schedule-drawer'
import { subjectKindLabel } from '@/data/comm-record-detail'
import {
  MEETING_MODE_LABEL,
  meetingCancelCauseLabel,
  meetingRowLabel,
  meetingSlotOf,
} from '@/data/meeting-labels'
import { meetingSubjectOf, meetingsQuery } from '@/data/meetings'
import { useMinuteClock } from '@/data/minute-clock'

/** A booked meeting on `/comms/:id` (`scheduled`, `cancelled`): the booking,
 *  read-only, and for a closer the two verbs in the header — held (the
 *  close-out form) and reschedule (the booking drawer in edit mode). Anybody
 *  else gets a line saying whose it is. A cancelled booking keeps the facts
 *  and loses both verbs (ADR 0074 §2, 0075 §2). */

const HELD_REASON_ID = 'meeting-held-reason'

export function ScheduledMeeting({ record }: { record: DebriefView }) {
  const { t, lang } = useI18n()
  const subject = meetingSubjectOf(record.subject.code)
  const deal = subject?.kind === 'opportunity'
  const canRead = useCan(deal ? 'opportunity.view' : 'lead.view')
  const canMove = useCan(deal ? 'opportunity.edit' : 'lead.edit')
  const list = useQuery({
    ...meetingsQuery(subject ?? { kind: 'lead', code: record.subject.code }),
    enabled: subject !== null && canRead,
  })
  const meeting = list.data?.rows.find((row) => row.id === record.meeting?.id)
  const [holding, setHolding] = useState(false)
  const [moving, setMoving] = useState(false)
  const navigate = useNavigate()
  /* Rescheduling rewrites the booking, so it needs the booking in hand. */
  const cancelled = record.state === 'cancelled'
  const closable = record.closableByMe && !cancelled
  const movable = closable && subject !== null && meeting !== undefined && canMove
  const now = useMinuteClock()
  const startsAt = record.meeting?.at
  const started = !startsAt || now >= Date.parse(startsAt)
  /* The close-out sends who attended; without the booked list it would guess. */
  const listMissing = !canRead
    ? t(
        message(
          `Cần quyền xem ${subjectKindLabel(record.subject.code).toLowerCase()} để ghi kết quả.`,
          `You need permission to view this ${subjectKindLabel(record.subject.code).toLowerCase()} before logging the outcome.`,
          `${subjectKindLabel(record.subject.code)}을(를) 조회할 권한이 있어야 회의 결과를 기록할 수 있습니다.`,
        ),
      )
    : list.isLoading
      ? t(message('Đang tải danh sách người dự…', 'Loading attendees…', '참석자를 불러오는 중…'))
      : list.error
        ? `${t(message('Không tải được danh sách người dự.', 'Could not load attendees.', '참석자를 불러오지 못했습니다.'))} ${isApiError(list.error) ? userMessage(list.error) : t(message('Thử lại.', 'Try again.', '다시 시도하세요.'))}`
        : meeting === undefined
          ? t(
              message(
                'Không tìm thấy lịch họp này.',
                'Meeting not found.',
                '회의를 찾을 수 없습니다.',
              ),
            )
          : null

  const held = started && (
    <Button
      size="lg"
      disabled={listMissing !== null}
      aria-describedby={listMissing ? HELD_REASON_ID : undefined}
      onClick={() => setHolding(true)}
    >
      <Icon icon={Check} size={16} />
      {t(message('Họp xong', 'Meeting held', '회의 완료'))}
    </Button>
  )
  const note = cancelled
    ? meeting?.cancelCause
      ? (() => {
          const cause = meetingCancelCauseLabel(meeting.cancelCause, lang).toLowerCase()
          return t(message(`Huỷ vì ${cause}.`, `Cancelled: ${cause}.`, `취소 사유: ${cause}.`))
        })()
      : null
    : !record.closableByMe
      ? t(
          message(
            `Chỉ ${record.owner.name} hoặc cấp trên ghi được kết quả buổi họp.`,
            `Only ${record.owner.name} or their manager can log the meeting outcome.`,
            `${record.owner.name}님 또는 관리자만 회의 결과를 기록할 수 있습니다.`,
          ),
        )
      : started
        ? listMissing
        : t(
            message(
              `Có thể ghi kết quả từ ${meetingRowLabel(startsAt ?? '')} (giờ Việt Nam).`,
              `Log the outcome from ${meetingRowLabel(startsAt ?? '')} (Vietnam time).`,
              `${meetingRowLabel(startsAt ?? '')} (베트남 시간)부터 결과를 기록할 수 있습니다.`,
            ),
          )

  return (
    <CommRecordFrame
      record={record}
      title={record.title ?? record.subject.label}
      subjectInTitle={record.title === null}
      actions={
        closable && (
          <>
            {held}
            {movable && (
              <Button variant="secondary" size="lg" onClick={() => setMoving(true)}>
                <Icon icon={CalendarClock} size={16} />
                {t(message('Dời lịch', 'Reschedule', '일정 변경'))}
              </Button>
            )}
          </>
        )
      }
      note={note}
      noteId={HELD_REASON_ID}
      noteFailed={record.closableByMe && started && Boolean(list.error)}
    >
      <MeetingFacts
        record={record}
        meeting={meeting}
        pending={list.isLoading}
        cancelled={cancelled}
      />
      {closable && (
        <MeetingHeldForm
          record={record}
          meeting={meeting}
          open={holding}
          onClose={() => setHolding(false)}
        />
      )}
      {movable && (
        <MeetingScheduleDrawer
          subject={subject}
          editing={meeting}
          open={moving}
          onClose={() => setMoving(false)}
          onDropped={() => navigate(-1)}
        />
      )}
    </CommRecordFrame>
  )
}

/** The booking as written. Without the meeting list (no read right on the
 *  subject) only the record's own slot is known, so only that is printed. */
function MeetingFacts({
  record,
  meeting,
  pending,
  cancelled,
}: {
  record: DebriefView
  meeting: MeetingRow | undefined
  pending: boolean
  cancelled: boolean
}) {
  const { t } = useI18n()
  const slot = record.meeting
  const when = meeting
    ? meetingRowLabel(meeting.at, meeting.durationMinutes)
    : slot && `${meetingRowLabel(slot.at)}–${meetingSlotOf(slot.endsAt).time}`

  return (
    <GlassCard
      className="flex flex-col gap-4 p-5 lg:p-6"
      aria-label={t(message('Lịch họp', 'Meeting details', '회의 일정'))}
    >
      <SectionTitle size="detail">
        {t(message('Lịch họp', 'Meeting details', '회의 일정'))}
      </SectionTitle>
      {pending ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <dl className="m-0 grid gap-x-3 gap-y-3 text-[12.5px] leading-[1.6] sm:grid-cols-[minmax(0,1fr)_minmax(0,3fr)]">
          {when && (
            <Fact
              label={t(
                message('Thời gian (giờ Việt Nam)', 'Time (Vietnam time)', '시간 (베트남 시간)'),
              )}
            >
              {when}
            </Fact>
          )}
          {meeting?.mode && (
            <Fact label={t(message('Hình thức', 'Format', '형식'))}>
              {MEETING_MODE_LABEL[meeting.mode]}
            </Fact>
          )}
          {!cancelled && meeting?.link && (
            <Fact label={t(message('Link họp', 'Meeting link', '회의 링크'))}>
              {/* Pasted by a person: `noreferrer` keeps the target off `window.opener`. */}
              <a
                href={meeting.link}
                target="_blank"
                rel="noreferrer"
                className="text-accent-foreground pointer-coarse:min-h-12 inline-flex items-center gap-1 break-all"
              >
                <Icon icon={Link} size={14} className="shrink-0" />
                {meeting.link}
              </a>
            </Fact>
          )}
          {cancelled && record.closedAt && (
            <Fact label={t(message('Huỷ lúc', 'Cancelled at', '취소 시각'))}>
              {dmhm(record.closedAt)}
            </Fact>
          )}
          {meeting?.goal && (
            <Fact label={t(message('Mục tiêu', 'Goal', '목표'))}>{meeting.goal}</Fact>
          )}
          {meeting && (
            <Fact label={t(message('Bên mình', 'Our attendees', '내부 참석자'))}>
              {namesOf(meeting.hosts)}
            </Fact>
          )}
          {meeting && meeting.guests.length > 0 && (
            <Fact label={t(message('Khách', 'Customer attendees', '고객 참석자'))}>
              {namesOf(meeting.guests)}
            </Fact>
          )}
        </dl>
      )}
    </GlassCard>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="m-0 min-w-0 break-words">{children}</dd>
    </>
  )
}

const namesOf = (people: readonly { name: string; role?: string }[]) =>
  people.map((p) => (p.role ? `${p.name} (${p.role})` : p.name)).join(', ')
