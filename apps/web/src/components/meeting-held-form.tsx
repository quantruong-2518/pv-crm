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
import { CommEvaluation } from '@/components/comm-evaluation'
import { CommFileDrop, CommFileList } from '@/components/comm-files'
import { CommNextStepFields } from '@/components/comm-next-step-fields'
import { Field } from '@/components/field-bits'
import { commVocabularyQuery } from '@/data/comm-vocabulary'
import {
  EMPTY_STEP_DRAFT,
  evaluationBlockerOf,
  stepBlockerOf,
  stepInputOf,
  subjectKindLabel,
} from '@/data/comm-record-detail'
import { meetingRowLabel } from '@/data/meeting-labels'
import { useCloseMeeting } from '@/data/meeting-today'

/** The close-out of a booked meeting (the held button), in one panel: summary, who
 *  attended, the outcome (the comm's own evaluation answers), the next step
 *  and files. One write (`close-meeting`); the record turns `done` and the
 *  meeting `held`.
 *
 *  Attendance starts from the booking with everyone ticked: most people who
 *  were invited came, and unticking the one who did not is the honest effort.
 *  A guest nobody booked is added by name. Filled by hand — no AI pre-fill
 *  (ADR 0075 §6), so nothing here is proposed on the reader's behalf. */

type Person = { key: string; name: string; note?: string; attended: boolean }
type Host = Person & { actorId: string }
type Guest = Person & { role?: string; contactCode?: string }

const FORM_ID = 'meeting-held'

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
  const vocab = useQuery(commVocabularyQuery)
  const close = useCloseMeeting()
  const target = record.stepTarget
  const people = useAttendance(open, meeting)
  const [summary, setSummary] = useState('')
  const [picked, setPicked] = useState<Record<string, string>>({})
  const [draft, setDraft] = useState(EMPTY_STEP_DRAFT)

  const blocker =
    (meeting ? null : 'Chưa có danh sách người dự của buổi họp nên chưa lưu được kết quả.') ??
    (summary.trim() === '' ? 'Chưa ghi tóm tắt buổi họp.' : null) ??
    evaluationBlockerOf(vocab, picked) ??
    (target ? stepBlockerOf(draft) : null)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (blocker || close.isPending) return
    const body: MeetingDebriefClose = {
      summary: summary.trim(),
      answers: (vocab.data?.criteria ?? []).map((c) => ({
        criterionId: c.id,
        answerId: picked[c.id] ?? '',
      })),
      ...(target && { step: stepInputOf(draft, target.currentStep) }),
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
          toastDone('Đã lưu kết quả buổi họp')
          onClose()
        },
      },
    )
  }

  const message = close.error ? userMessage(close.error) : blocker

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Kết quả buổi họp"
      subtitle={
        meeting
          ? `${meeting.title} · ${meetingRowLabel(meeting.at, meeting.durationMinutes)}`
          : record.subject.label
      }
      width="lg"
      footer={
        <div className="flex min-w-0 items-center justify-between gap-3">
          <span
            aria-live="polite"
            className="text-warning min-w-0 text-[11.5px] leading-[1.5]"
            role={close.error ? 'alert' : undefined}
          >
            {message}
          </span>
          <div className="flex shrink-0 gap-2">
            <Button size="lg" variant="ghost" type="button" onClick={onClose}>
              Huỷ
            </Button>
            <Button
              size="lg"
              type="submit"
              form={FORM_ID}
              disabled={blocker !== null || close.isPending}
            >
              <Icon icon={Check} size={16} />
              {close.isPending ? 'Đang lưu…' : 'Lưu kết quả buổi họp'}
            </Button>
          </div>
        </div>
      }
    >
      <form id={FORM_ID} onSubmit={submit} noValidate className="flex min-w-0 flex-col gap-8">
        <Field label="Tóm tắt buổi họp" note={`${summary.length}/${DEBRIEF_SUMMARY_MAX}`}>
          <Textarea
            value={summary}
            rows={5}
            autoGrow
            maxLength={DEBRIEF_SUMMARY_MAX}
            aria-label="Tóm tắt buổi họp"
            placeholder="Hai bên đã thống nhất gì, khách cần gì tiếp theo."
            onChange={(e) => setSummary(e.target.value)}
          />
        </Field>

        <AttendanceGroup people={people} />

        <section className="flex min-w-0 flex-col gap-4" aria-label="Kết quả">
          <SectionTitle size="md">Kết quả</SectionTitle>
          <CommEvaluation vocab={vocab} picked={picked} onPick={setPicked} />
        </section>

        <section className="flex min-w-0 flex-col gap-4" aria-label="Bước tiếp theo">
          <SectionTitle size="md">Bước tiếp theo</SectionTitle>
          {target ? (
            <CommNextStepFields
              current={target.currentStep}
              kinds={vocab.data?.stepKinds ?? []}
              draft={draft}
              onDraft={setDraft}
            />
          ) : (
            <p className="text-muted-foreground m-0 text-[12px] leading-[1.6]">
              {subjectKindLabel(record.subject.code)}{' '}
              <span className="font-mono">{record.subject.code}</span> không nhận bước tiếp theo từ
              lượt liên hệ này.
            </p>
          )}
        </section>

        <section className="flex min-w-0 flex-col gap-4" aria-label="Tệp đính kèm">
          <SectionTitle size="md">Tệp đính kèm</SectionTitle>
          <CommFileDrop id={record.id} />
          <CommFileList id={record.id} canDelete />
        </section>
      </form>
    </Drawer>
  )
}

type Attendance = ReturnType<typeof useAttendance>

function AttendanceGroup({ people }: { people: Attendance }) {
  const [typed, setTyped] = useState('')
  const full = people.guests.length >= MEETING_MAX_GUESTS
  const add = () => {
    const name = typed.trim()
    if (!name || full) return
    people.addGuest(name)
    setTyped('')
  }

  return (
    <section className="flex min-w-0 flex-col gap-4" aria-label="Người dự">
      <SectionTitle size="md">Người dự</SectionTitle>
      <PersonChecks
        label="Bên mình"
        empty="Lịch họp không ghi người bên mình."
        rows={people.hosts}
        onToggle={(key, attended) => people.mark('hosts', key, attended)}
      />
      <PersonChecks
        label="Khách"
        empty="Lịch họp không ghi khách nào."
        rows={people.guests}
        onToggle={(key, attended) => people.mark('guests', key, attended)}
      />
      <Field
        label="Thêm khách không có trong lịch"
        problem={full ? `Một buổi tối đa ${MEETING_MAX_GUESTS} khách.` : undefined}
      >
        <div className="flex min-w-0 gap-2">
          <Input
            value={typed}
            maxLength={MEETING_GUEST_NAME_MAX}
            placeholder="Tên khách"
            aria-label="Tên khách thêm vào"
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
            Thêm khách
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
