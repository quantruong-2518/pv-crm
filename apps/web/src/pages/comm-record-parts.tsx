import { useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Button,
  CalendarClock,
  Check,
  Eye,
  GlassCard,
  Icon,
  Input,
  Link,
  Modal,
  Save,
  SectionTitle,
  Skeleton,
  Textarea,
} from '@pv/ui'
import {
  DEBRIEF_SUMMARY_MAX,
  DEBRIEF_TITLE_MAX,
  type CommVocabularyResponse,
  type DebriefClose,
  type DebriefView,
  type MeetingRow,
} from '@pv/contracts'
import { useCan } from '@/app/auth'
import { isApiError, userMessage } from '@/app/api'
import { toastDone } from '@/app/toast'
import { dmy } from '@/lib/date'
import { RecordShell } from '@/components/record/record-shell'
import { CommEvaluation } from '@/components/comm-evaluation'
import { CommFileDrop, CommFileList } from '@/components/comm-files'
import { CommNextStepFields } from '@/components/comm-next-step-fields'
import { Field } from '@/components/field-bits'
import { MeetingHeldForm } from '@/components/meeting-held-form'
import { MeetingScheduleDrawer } from '@/components/meeting-schedule-drawer'
import { commVocabularyQuery } from '@/data/comm-vocabulary'
import {
  EMPTY_STEP_DRAFT,
  type StepDraft,
  evaluationBlockerOf,
  stepBlockerOf,
  stepInputOf,
  subjectKindLabel,
  useConfirmComm,
} from '@/data/comm-record-detail'
import { MEETING_MODE_LABEL, meetingRowLabel, meetingSlotOf } from '@/data/meeting-labels'
import { meetingSubjectOf, meetingsQuery } from '@/data/meetings'
import { useMinuteClock } from '@/data/minute-clock'
import { useStepOptions } from '@/data/next-step'

/** The confirm form of an open comm, and the booked-meeting view with its
 *  close-out and reschedule doors (ADR 0074 §2, 0075 §2). The read view of a done
 *  comm is `CommRecordRead` in `components/comm-record-bits.tsx`.
 *
 *  Filled by hand this turn — AI pre-fill is deferred (ADR 0075 §6), so there
 *  is no AI block here and nothing is proposed on the reader's behalf.
 *  Answers are the admin's words, one per active question, never a score. */

type Draft = { title: string; summary: string; picked: Record<string, string>; step: StepDraft }

const draftKey = (id: string) => `comm-draft:${id}`

/** Browser storage can throw or come back empty; a draft is a convenience. */
function readDraft(id: string): Draft | null {
  try {
    const raw = localStorage.getItem(draftKey(id))
    return raw ? (JSON.parse(raw) as Draft) : null
  } catch {
    return null
  }
}

function writeDraft(id: string, draft: Draft | null) {
  try {
    if (draft) localStorage.setItem(draftKey(id), JSON.stringify(draft))
    else localStorage.removeItem(draftKey(id))
  } catch {
    /* storage unavailable — the form still works, it just cannot be kept */
  }
}

/** Same float as `ActionBar` (ADR 0078 §1); that one is built for reaching
 *  contacts, this one carries the form's own verbs. */
function FormBar({
  onPreview,
  onSave,
  onConfirm,
  disabled,
}: {
  onPreview: () => void
  onSave: () => void
  onConfirm: () => void
  disabled: boolean
}) {
  return (
    <div
      data-action-bar
      className="pointer-events-none fixed inset-x-4 bottom-[calc(84px+env(safe-area-inset-bottom)+12px)] z-20 flex justify-center lg:bottom-6 lg:right-24"
    >
      <div
        role="group"
        aria-label="Thao tác liên hệ"
        className="glass-overlay pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-2 rounded-lg p-2"
      >
        <Button size="md" variant="ghost" className="pointer-coarse:h-12" onClick={() => onPreview}>
          <Icon icon={Eye} size={16} />
          Xem trước
        </Button>
        <Button size="md" variant="secondary" className="pointer-coarse:h-12" onClick={onSave}>
          <Icon icon={Save} size={16} />
          Lưu nháp
        </Button>
        <Button size="md" className="pointer-coarse:h-12" disabled={disabled} onClick={onConfirm}>
          Xác nhận
        </Button>
      </div>
    </div>
  )
}

/** The owner's working screen for an open comm: text in the main column, files,
 *  evaluation and the step's due date in the rail, the verbs in the floating
 *  bar. A draft is kept in this browser only; the server stores title and
 *  content when the owner confirms. */
export function ConfirmWorkspace({
  record,
  strip,
  header,
  turns,
}: {
  record: DebriefView
  strip: ReactNode
  header: ReactNode
  turns: ReactNode
}) {
  const vocab = useQuery(commVocabularyQuery)
  const confirm = useConfirmComm()
  const target = record.stepTarget
  const current = target?.currentStep ?? null
  const options = useStepOptions(target?.kind ?? null, record.subject.code)
  const saved = useMemo(() => readDraft(record.id), [record.id])

  const [title, setTitle] = useState(saved?.title ?? '')
  const [summary, setSummary] = useState(saved?.summary ?? '')
  const [picked, setPicked] = useState<Record<string, string>>(saved?.picked ?? {})
  const [draft, setDraft] = useState(saved?.step ?? EMPTY_STEP_DRAFT)
  const [previewing, setPreviewing] = useState(false)

  const blocker =
    (title.trim() === '' ? 'Chưa có tiêu đề.' : null) ??
    (summary.trim() === '' ? 'Chưa có nội dung.' : null) ??
    evaluationBlockerOf(vocab, picked) ??
    (target ? stepBlockerOf(draft, options) : null)

  const blocked = blocker !== null || confirm.isPending

  const save = () => {
    writeDraft(record.id, { title, summary, picked, step: draft })
    toastDone('Đã lưu nháp trên máy này')
  }

  const submit = () => {
    if (blocker || confirm.isPending) return
    const body: DebriefClose = {
      title: title.trim(),
      summary: summary.trim(),
      answers: (vocab.data?.criteria ?? []).map((c) => ({
        criterionId: c.id,
        answerId: picked[c.id] ?? '',
      })),
      ...(target && { step: stepInputOf(draft, current, options.data) }),
    }
    confirm.mutate(
      { id: record.id, body },
      {
        onSuccess: () => {
          writeDraft(record.id, null)
          setPreviewing(false)
          toastDone('Đã xác nhận liên hệ')
        },
      },
    )
  }

  return (
    <RecordShell
      strip={strip}
      header={header}
      main={
        <>
          <GlassCard className="flex flex-col gap-6 p-5 lg:p-6" aria-label="Nội dung liên hệ">
            <Field label="Tiêu đề" note={`${title.length}/${DEBRIEF_TITLE_MAX}`}>
              <Input
                value={title}
                maxLength={DEBRIEF_TITLE_MAX}
                aria-label="Tiêu đề"
                className="pointer-coarse:h-12"
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>
            <Field label="Nội dung" note={`${summary.length}/${DEBRIEF_SUMMARY_MAX}`}>
              <Textarea
                value={summary}
                autoGrow
                maxLength={DEBRIEF_SUMMARY_MAX}
                className="min-h-[calc(100dvh-18rem)]"
                aria-label="Nội dung"
                onChange={(e) => setSummary(e.target.value)}
              />
            </Field>
            {(confirm.error || blocker) && (
              <p role={confirm.error ? 'alert' : undefined} className="text-warning text-[12px]">
                {confirm.error ? userMessage(confirm.error) : blocker}
              </p>
            )}
          </GlassCard>
          {turns}
        </>
      }
      rail={
        <>
          <GlassCard variant="b" className="flex flex-col gap-4 p-5" aria-label="Tệp">
            <SectionTitle size="detail">Tệp đính kèm</SectionTitle>
            <CommFileDrop id={record.id} />
            <CommFileList id={record.id} canDelete />
          </GlassCard>
          <GlassCard className="p-5" aria-label="Đánh giá">
            <CommEvaluation vocab={vocab} picked={picked} onPick={setPicked} />
          </GlassCard>
          <GlassCard className="flex flex-col gap-3 p-5" aria-label="Bước tiếp theo">
            {target ? (
              <>
                <span className="text-muted-foreground text-[11px]">
                  Bước tiếp theo · cho {subjectKindLabel(record.subject.code).toLowerCase()}{' '}
                  <span className="font-mono">{record.subject.code}</span>
                </span>
                <CommNextStepFields
                  current={current}
                  kinds={vocab.data?.stepKinds ?? []}
                  options={options}
                  draft={draft}
                  onDraft={setDraft}
                />
              </>
            ) : (
              <p className="text-muted-foreground text-[12px] leading-[1.6]">
                {subjectKindLabel(record.subject.code)}{' '}
                <span className="font-mono">{record.subject.code}</span> không nhận bước tiếp theo
                từ lượt liên hệ này.
              </p>
            )}
          </GlassCard>
        </>
      }
      railLabel="Tệp, đánh giá và hạn"
      actionBar={
        <FormBar
          onPreview={() => setPreviewing(true)}
          onSave={save}
          onConfirm={submit}
          disabled={blocked}
        />
      }
    >
      <Modal
        open={previewing}
        onClose={() => setPreviewing(false)}
        title="Xem trước"
        subtitle={record.subject.label}
        footer={
          <Button size="md" disabled={blocked} onClick={submit}>
            Xác nhận
          </Button>
        }
      >
        <Preview {...{ title, summary, picked }} vocab={vocab.data} step={target ? draft : null} />
      </Modal>
    </RecordShell>
  )
}

function Preview({
  title,
  summary,
  vocab,
  picked,
  step,
}: {
  title: string
  summary: string
  vocab: CommVocabularyResponse | undefined
  picked: Record<string, string>
  step: StepDraft | null
}) {
  const none = <span className="text-muted-foreground">Chưa điền</span>
  const kind = vocab?.stepKinds.find((k) => k.id === step?.kindId)?.name
  return (
    <dl className="m-0 flex flex-col gap-4 text-[12.5px] leading-[1.6]">
      <PreviewRow label="Tiêu đề">{title.trim() || none}</PreviewRow>
      <PreviewRow label="Nội dung">{summary.trim() || none}</PreviewRow>
      {(vocab?.criteria ?? []).map((c) => (
        <PreviewRow key={c.id} label={c.name}>
          {c.answers.find((a) => a.id === picked[c.id])?.name ?? none}
        </PreviewRow>
      ))}
      {step && (
        <PreviewRow label="Bước tiếp theo">
          {step.text.trim() ? (
            <>
              {kind && `${kind} · `}
              {step.text} · hạn {step.due ? dmy(step.due) : '—'}
            </>
          ) : (
            none
          )}
        </PreviewRow>
      )}
    </dl>
  )
}

function PreviewRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-muted-foreground text-[11px]">{label}</dt>
      <dd className="m-0 whitespace-pre-wrap break-words">{children}</dd>
    </div>
  )
}

// ---------------------------------------------------------------------------
// A BOOKED MEETING — `scheduled`
// ---------------------------------------------------------------------------

const HELD_REASON_ID = 'meeting-held-reason'

/** A booked meeting's record: the booking, read-only, and for a closer the two
 *  verbs — held (the close-out form) and reschedule (the booking drawer in
 *  edit mode). Anybody else sees whose it is and no button. */
export function ScheduledMeeting({
  record,
  strip,
  header,
}: {
  record: DebriefView
  strip: ReactNode
  header: ReactNode
}) {
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
  /* Rescheduling rewrites the booking, so it needs the booking in hand. */
  const movable = record.closableByMe && subject !== null && meeting !== undefined && canMove
  const now = useMinuteClock()
  const startsAt = record.meeting?.at
  const started = !startsAt || now >= Date.parse(startsAt)
  /* The close-out sends who attended; without the booked list it would guess. */
  const listMissing = !canRead
    ? `Cần quyền xem ${subjectKindLabel(record.subject.code).toLowerCase()} để đọc danh sách người dự trước khi ghi kết quả.`
    : list.isLoading
      ? 'Đang đọc danh sách người dự…'
      : list.error
        ? `Không đọc được danh sách người dự. ${isApiError(list.error) ? userMessage(list.error) : 'Vui lòng thử lại.'}`
        : meeting === undefined
          ? 'Không tìm thấy lịch họp này trong danh sách người dự.'
          : null

  return (
    <RecordShell
      strip={strip}
      header={header}
      main={<MeetingFacts record={record} meeting={meeting} pending={list.isLoading} />}
      rail={
        <GlassCard className="flex flex-col gap-3 p-5 lg:p-6" aria-label="Thao tác buổi họp">
          {record.closableByMe ? (
            <>
              {started && (
                <Button
                  size="lg"
                  className="w-full"
                  disabled={listMissing !== null}
                  aria-describedby={listMissing ? HELD_REASON_ID : undefined}
                  onClick={() => setHolding(true)}
                >
                  <Icon icon={Check} size={16} />
                  Họp xong
                </Button>
              )}
              {(!started || listMissing) && (
                <p
                  id={HELD_REASON_ID}
                  className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]"
                >
                  {started
                    ? listMissing
                    : `Nút Họp xong hiện khi buổi họp bắt đầu, lúc ${meetingRowLabel(startsAt ?? '')} (giờ Việt Nam).`}
                </p>
              )}
              {movable && (
                <Button
                  size="lg"
                  variant="secondary"
                  className="w-full"
                  onClick={() => setMoving(true)}
                >
                  <Icon icon={CalendarClock} size={16} />
                  Dời lịch
                </Button>
              )}
            </>
          ) : (
            <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">
              Chỉ {record.owner.name}, người đặt lịch, hoặc cấp trên của người này ghi được kết quả
              buổi họp.
            </p>
          )}
        </GlassCard>
      }
      railLabel="Thao tác buổi họp"
    >
      {record.closableByMe && (
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
        />
      )}
    </RecordShell>
  )
}

/** The booking as written. Without the meeting list (no read right on the
 *  subject) only the record's own slot is known, so only that is printed. */
function MeetingFacts({
  record,
  meeting,
  pending,
}: {
  record: DebriefView
  meeting: MeetingRow | undefined
  pending: boolean
}) {
  const slot = record.meeting
  const when = meeting
    ? meetingRowLabel(meeting.at, meeting.durationMinutes)
    : slot && `${meetingRowLabel(slot.at)}–${meetingSlotOf(slot.endsAt).time}`

  return (
    <GlassCard className="flex flex-col gap-4 p-5 lg:p-6" aria-label="Lịch họp">
      <SectionTitle size="detail">Lịch họp</SectionTitle>
      {pending ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <dl className="m-0 grid gap-x-3 gap-y-3 text-[12.5px] leading-[1.6] sm:grid-cols-[minmax(0,1fr)_minmax(0,3fr)]">
          {when && <Fact label="Thời gian (giờ Việt Nam)">{when}</Fact>}
          {meeting?.mode && <Fact label="Hình thức">{MEETING_MODE_LABEL[meeting.mode]}</Fact>}
          {meeting?.link && (
            <Fact label="Link họp">
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
          {meeting?.goal && <Fact label="Mục tiêu">{meeting.goal}</Fact>}
          {meeting && <Fact label="Bên mình">{namesOf(meeting.hosts)}</Fact>}
          {meeting && meeting.guests.length > 0 && (
            <Fact label="Khách">{namesOf(meeting.guests)}</Fact>
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
