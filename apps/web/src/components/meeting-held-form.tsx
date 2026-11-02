import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Check, Checkbox, Drawer, Icon, Input, Plus, SectionTitle, Textarea } from '@pv/ui'
import {
  DEBRIEF_SUMMARY_MAX,
  MEETING_GUEST_NAME_MAX,
  MEETING_MAX_GUESTS,
  type DebriefView,
  type MeetingDebriefClose,
  type MeetingRow,
} from '@pv/contracts'
import { userMessage } from '@/app/api'
import { toastDone } from '@/app/toast'
import { message, useI18n } from '@/app/i18n'
import { CommAiContent, CommAiEvaluation, CommAiSteps } from '@/components/comm-ai-report'
import { CommEvaluation } from '@/components/comm-evaluation'
import { CommFileDrop, CommFileList } from '@/components/comm-files'
import { CommNextStepFields } from '@/components/comm-next-step-fields'
import { Field } from '@/components/field-bits'
import { MEETING_AI_WORDS, useCommAiReport } from '@/data/comm-ai-report'
import { commVocabularyQuery } from '@/data/comm-vocabulary'
import { EMPTY_STEP_DRAFT, evaluationBlockerOf, subjectKindLabel } from '@/data/comm-record-detail'
import { useCloseStep } from '@/data/customer-close'
import { meetingRowLabel } from '@/data/meeting-labels'
import { useCloseMeeting } from '@/data/meeting-today'
import { TemperaturePick } from './temperature-pick'

/** The close-out of a booked meeting (the held button), in one panel: summary, who
 *  attended, the outcome (the comm's own evaluation answers), the next step
 *  and files. One write (`close-meeting`); the record turns `done` and the
 *  meeting `held`.
 *
 *  Attendance starts from the booking with everyone ticked: most people who
 *  were invited came, and unticking the one who did not is the honest effort.
 *  A guest nobody booked is added by name. AI proposes on a press and waits for
 *  another (ADR 0132); only the person's press moves a part into the form. */

type Person = { key: string; name: string; note?: string; attended: boolean }
type Host = Person & { actorId: string }
type Guest = Person & { role?: string; contactCode?: string }

const FORM_ID = 'meeting-held'

const HELD = {
  noAttendeeListYet: message(
    'Chưa có danh sách người dự.',
    'No attendee list yet.',
    '참석자 목록이 없습니다.',
  ),
  theMeetingSummaryIs: message(
    'Chưa ghi tóm tắt buổi họp.',
    'The meeting summary is not written yet.',
    '회의 요약이 아직 입력되지 않았습니다.',
  ),
  meetingOutcomeSaved: message(
    'Đã lưu kết quả buổi họp',
    'Meeting outcome saved',
    '회의 결과를 저장했습니다',
  ),
  meetingOutcome: message('Kết quả buổi họp', 'Meeting outcome', '회의 결과'),
  meetingSummary: message('Tóm tắt buổi họp', 'Meeting summary', '회의 요약'),
  whatBothSidesAgreed: message(
    'Hai bên đã thống nhất gì, khách cần gì tiếp theo.',
    'What both sides agreed on and what the customer needs next.',
    '양측이 합의한 내용과 고객이 다음에 필요한 것을 적어 주세요.',
  ),
  outcome: message('Kết quả', 'Outcome', '결과'),
  nextStep: message('Bước tiếp theo', 'Next step', '다음 단계'),
  doesNotAcceptA: message(
    ' không nhận bước tiếp theo từ lượt liên hệ này.',
    ' does not accept a next step from this interaction.',
    '에는 이 연락 기록에서 다음 단계를 설정할 수 없습니다.',
  ),
  attachments: message('Tệp đính kèm', 'Attachments', '첨부 파일'),
}

export function MeetingHeldForm({
  record,
  meeting,
  open,
  onClose,
}: {
  record: DebriefView
  /** The booking with its attendee list; undefined (not read, refused, gone) blocks the save. */
  meeting: MeetingRow | undefined
  open: boolean
  onClose: () => void
}) {
  const { t, lang } = useI18n()
  const vocab = useQuery(commVocabularyQuery)
  const close = useCloseMeeting()
  const step = useCloseStep(record.subject.code, record.stepTarget)
  const people = useAttendance(open, meeting)
  const ai = useCommAiReport(record, MEETING_AI_WORDS)
  const [summary, setSummary] = useState('')
  const [picked, setPicked] = useState<Record<string, string>>({})
  const [draft, setDraft] = useState(EMPTY_STEP_DRAFT)

  const blocker =
    (meeting ? null : t(HELD.noAttendeeListYet)) ??
    (summary.trim() === '' ? t(HELD.theMeetingSummaryIs) : null) ??
    evaluationBlockerOf(vocab, picked, lang) ??
    step.temperatureGap ??
    step.gapOf(draft)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (blocker || close.isPending) return
    const body: MeetingDebriefClose = {
      summary: summary.trim(),
      answers: (vocab.data?.criteria ?? []).map((c) => ({
        criterionId: c.id,
        answerId: picked[c.id] ?? '',
      })),
      ...step.inputOf(draft),
      /* No booked list = no lists at all: an empty array would REPLACE the attendees. */
      ...(meeting && {
        hosts: people.hosts.map(({ actorId, name, attended }) => ({ actorId, name, attended })),
        guests: people.guests.map(({ name, role, contactCode, attended }) => ({
          name,
          attended,
          ...(role ? { role } : {}),
          ...(contactCode ? { contactCode } : {}),
        })),
      }),
    }
    close.mutate(
      { id: record.id, body },
      {
        onSuccess: () => {
          toastDone(t(HELD.meetingOutcomeSaved))
          onClose()
        },
      },
    )
  }

  const footerMessage = close.error ? userMessage(close.error) : blocker

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={t(HELD.meetingOutcome)}
      subtitle={
        meeting
          ? `${meeting.title} · ${meetingRowLabel(meeting.at, meeting.durationMinutes, lang)}`
          : record.subject.label
      }
      width="lg"
      footer={
        <HeldFooter
          text={footerMessage}
          failed={Boolean(close.error)}
          blocked={blocker !== null}
          saving={close.isPending}
          onClose={onClose}
        />
      }
    >
      <form id={FORM_ID} onSubmit={submit} noValidate className="flex min-w-0 flex-col gap-8">
        <div className="flex min-w-0 flex-col gap-3">
          <Field label={t(HELD.meetingSummary)} note={`${summary.length}/${DEBRIEF_SUMMARY_MAX}`}>
            <Textarea
              value={summary}
              rows={5}
              autoGrow
              maxLength={DEBRIEF_SUMMARY_MAX}
              aria-label={t(HELD.meetingSummary)}
              placeholder={t(HELD.whatBothSidesAgreed)}
              onChange={(e) => setSummary(e.target.value)}
            />
          </Field>
          {ai.allowed && <CommAiContent ai={ai} note={summary} onNote={setSummary} />}
        </div>

        <AttendanceGroup people={people} />

        <section className="flex min-w-0 flex-col gap-4" aria-label={t(HELD.outcome)}>
          <SectionTitle size="md">{t(HELD.outcome)}</SectionTitle>
          {ai.allowed && (
            <CommAiEvaluation
              ai={ai}
              criteria={vocab.data?.criteria ?? []}
              picked={picked}
              onPick={setPicked}
            />
          )}
          <CommEvaluation vocab={vocab} picked={picked} onPick={setPicked} />
          {step.customer && (
            <TemperaturePick value={step.temperature} onPick={step.setTemperature} />
          )}
        </section>

        <section className="flex min-w-0 flex-col gap-4" aria-label={t(HELD.nextStep)}>
          <SectionTitle size="md">{t(HELD.nextStep)}</SectionTitle>
          {step.takesStep ? (
            step.stepShown && (
              <>
                {ai.allowed && (
                  <CommAiSteps
                    ai={ai}
                    options={step.options.data}
                    draft={draft}
                    onDraft={setDraft}
                  />
                )}
                <CommNextStepFields
                  kinds={vocab.data?.stepKinds ?? []}
                  options={step.options}
                  draft={draft}
                  onDraft={setDraft}
                />
              </>
            )
          ) : step.target.isPending ? null : (
            <p className="text-muted-foreground m-0 text-[12px] leading-[1.6]">
              {subjectKindLabel(record.subject.code, lang)}{' '}
              <span className="font-mono">{record.subject.code}</span>
              {t(HELD.doesNotAcceptA)}
            </p>
          )}
        </section>

        <section className="flex min-w-0 flex-col gap-4" aria-label={t(HELD.attachments)}>
          <SectionTitle size="md">{t(HELD.attachments)}</SectionTitle>
          <CommFileDrop id={record.id} />
          <CommFileList id={record.id} canDelete />
        </section>
      </form>
    </Drawer>
  )
}

function HeldFooter({
  text,
  failed,
  blocked,
  saving,
  onClose,
}: {
  text: string | null
  failed: boolean
  blocked: boolean
  saving: boolean
  onClose: () => void
}) {
  const { t } = useI18n()
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
      <span
        aria-live="polite"
        className={
          failed
            ? 'text-destructive-foreground min-w-0 flex-1 basis-48 text-[11.5px] leading-[1.5]'
            : 'text-warning min-w-0 flex-1 basis-48 text-[11.5px] leading-[1.5]'
        }
        role={failed ? 'alert' : undefined}
      >
        {text}
      </span>
      <div className="flex shrink-0 gap-2">
        <Button size="lg" variant="ghost" type="button" onClick={onClose}>
          {t(message('Huỷ', 'Cancel', '취소'))}
        </Button>
        <Button size="lg" type="submit" form={FORM_ID} disabled={blocked || saving}>
          <Icon icon={Check} size={16} />
          {saving
            ? t(message('Đang lưu…', 'Saving…', '저장 중…'))
            : t(message('Lưu kết quả buổi họp', 'Save meeting outcome', '회의 결과 저장'))}
        </Button>
      </div>
    </div>
  )
}

type Attendance = ReturnType<typeof useAttendance>

function AttendanceGroup({ people }: { people: Attendance }) {
  const { t } = useI18n()
  const [typed, setTyped] = useState('')
  const full = people.guests.length >= MEETING_MAX_GUESTS
  const add = () => {
    const name = typed.trim()
    if (!name || full) return
    people.addGuest(name)
    setTyped('')
  }

  return (
    <section
      className="flex min-w-0 flex-col gap-4"
      aria-label={t(message('Người dự', 'Attendees', '참석자'))}
    >
      <SectionTitle size="md">{t(message('Người dự', 'Attendees', '참석자'))}</SectionTitle>
      <PersonChecks
        label={t(message('Bên mình', 'Our side', '우리 측'))}
        empty={t(
          message(
            'Lịch họp không ghi người bên mình.',
            'The meeting booking lists no one from our side.',
            '회의 일정에 우리 측 참석자가 기재되어 있지 않습니다.',
          ),
        )}
        rows={people.hosts}
        onToggle={(key, attended) => people.mark('hosts', key, attended)}
      />
      <PersonChecks
        label={t(message('Khách', 'Customer side', '고객 측'))}
        empty={t(
          message(
            'Lịch họp không ghi khách nào.',
            'The meeting booking lists no guests.',
            '회의 일정에 고객 측 참석자가 기재되어 있지 않습니다.',
          ),
        )}
        rows={people.guests}
        onToggle={(key, attended) => people.mark('guests', key, attended)}
      />
      <Field
        label={t(
          message(
            'Thêm khách không có trong lịch',
            'Add a guest not in the booking',
            '일정에 없는 참석자 추가',
          ),
        )}
        problem={
          full
            ? t(
                message(
                  `Một buổi tối đa ${MEETING_MAX_GUESTS} khách.`,
                  `A meeting allows at most ${MEETING_MAX_GUESTS} guests.`,
                  `회의당 최대 ${MEETING_MAX_GUESTS}명까지 추가할 수 있습니다.`,
                ),
              )
            : undefined
        }
      >
        <div className="flex min-w-0 gap-2">
          <Input
            value={typed}
            maxLength={MEETING_GUEST_NAME_MAX}
            placeholder={t(message('Tên khách', 'Guest name', '참석자 이름'))}
            aria-label={t(
              message('Tên khách thêm vào', 'Name of guest to add', '추가할 참석자 이름'),
            )}
            className="pointer-coarse:h-12 min-w-0 flex-1"
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              e.preventDefault()
              add()
            }}
          />
          <Button
            size="md"
            variant="secondary"
            type="button"
            className="pointer-coarse:h-12 shrink-0"
            disabled={typed.trim() === '' || full}
            onClick={add}
          >
            <Icon icon={Plus} size={16} />
            {t(message('Thêm khách', 'Add guest', '참석자 추가'))}
          </Button>
        </div>
      </Field>
    </section>
  )
}

function PersonChecks({
  label,
  empty,
  rows,
  onToggle,
}: {
  label: string
  empty: string
  rows: readonly Person[]
  onToggle: (key: string, attended: boolean) => void
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2" role="group" aria-label={label}>
      <span className="text-muted-foreground text-[11px]">{label}</span>
      {rows.length === 0 ? (
        <p className="text-muted-foreground m-0 text-[12px] leading-[1.6]">{empty}</p>
      ) : (
        rows.map((p) => (
          <Checkbox
            key={p.key}
            checked={p.attended}
            onChange={(attended) => onToggle(p.key, attended)}
            label={p.name}
            hint={p.note}
            wrap
            className="pointer-coarse:min-h-12"
          />
        ))
      )}
    </div>
  )
}

/** Who was booked, ticked, seeded once per opening — a refetch of the meeting
 *  list mid-form must not undo the ticks. A host row with no actor (older data)
 *  cannot be sent back, so it is left out. */
function useAttendance(open: boolean, meeting: MeetingRow | undefined) {
  const [hosts, setHosts] = useState<Host[]>([])
  const [guests, setGuests] = useState<Guest[]>([])
  const seedRef = useRef(meeting)
  seedRef.current = meeting
  const seedId = meeting?.id

  useEffect(() => {
    if (!open) return
    const m = seedRef.current
    setHosts(
      (m?.hosts ?? []).flatMap((h) =>
        h.actorId ? [{ key: h.actorId, actorId: h.actorId, name: h.name, attended: true }] : [],
      ),
    )
    setGuests(
      (m?.guests ?? []).map((g, i) => ({
        key: `${i}:${g.contactCode ?? g.name}`,
        name: g.name,
        attended: true,
        ...(g.role ? { role: g.role, note: g.role } : {}),
        ...(g.contactCode ? { contactCode: g.contactCode } : {}),
      })),
    )
  }, [open, seedId])

  const mark = (side: 'hosts' | 'guests', key: string, attended: boolean) => {
    if (side === 'hosts')
      setHosts((all) => all.map((p) => (p.key === key ? { ...p, attended } : p)))
    else setGuests((all) => all.map((p) => (p.key === key ? { ...p, attended } : p)))
  }
  const addGuest = (name: string) =>
    setGuests((all) => [...all, { key: `added:${all.length}:${name}`, name, attended: true }])

  return { hosts, guests, mark, addGuest }
}
