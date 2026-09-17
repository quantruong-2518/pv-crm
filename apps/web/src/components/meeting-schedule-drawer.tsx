import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, Timer } from '@pv/ui'
import {
  Button,
  Drawer,
  Icon,
  Input,
  SectionTitle,
  SegmentedControl,
  Select,
  Textarea,
} from '@pv/ui'
import {
  MEETING_DURATION_MINUTES,
  MEETING_GOAL_MAX,
  MEETING_MAX_GUESTS,
  MEETING_MAX_HOSTS,
  MEETING_TITLE_MAX,
  TRANSCRIPT_MAX,
  type MeetingCreate,
  type MeetingDurationMinutes,
  type MeetingMode,
} from '@pv/contracts'
import type { Actor } from '@pv/engines'
import { isApiError, userMessage } from '@/app/api'
import { toast } from '@/app/toast'
import { Field } from '@/components/field-bits'
import { PersonTokenField, type TokenPerson } from '@/components/person-token-field'
import { leadContactsQuery } from '@/data/contacts'
import { useDirectory } from '@/data/directory'
import { isHttpUrl } from '@/data/http-url'
import { leadProfileQuery } from '@/data/lead-profile'
import {
  DEFAULT_MEETING_DURATION,
  DEFAULT_MEETING_MODE,
  MEETING_DURATION_LABEL,
  MEETING_MODE_LABEL,
  MEETING_MODE_ORDER,
  meetingSlotLabel,
  meetingSlotMoment,
} from '@/data/meeting-labels'
import { useAddMeeting } from '@/data/meetings'

/** Booking a meeting that has NOT happened yet — three groups, one panel.
 *
 *  The flat form this replaces asked for one `datetime-local` and then a stack
 *  of guest rows, each with its own select and two text boxes. Day, hour and
 *  length are three separate decisions and now read as three; attendees are a
 *  list of people and now look like one.
 *
 *  Two books, and the asymmetry is the server's rather than a shortcut: a host
 *  must name an `actorId` from `platform.actor`, a guest may carry a
 *  `contactCode` or simply be typed in — see the `MeetingAttendee` docblock.
 *
 *  A transcript can still be written here, and only when the chosen slot is
 *  already behind us — see `PastMeetingNote`. */
export function MeetingScheduleDrawer({
  code,
  open,
  onClose,
}: {
  code: string
  open: boolean
  onClose: () => void
}) {
  const people = useDirectory()
  /* Both reads are cache hits on the lead profile, the only screen this drawer
     opens from; `enabled` keeps it honest anywhere else. */
  const { data: profile } = useQuery({ ...leadProfileQuery(code), enabled: open })
  const { data: book } = useQuery({ ...leadContactsQuery(code), enabled: open })
  const add = useAddMeeting()

  const form = useMeetingDraft(open)
  const [failure, setFailure] = useState('')

  const company = profile?.company ?? 'lead này'
  const readback = meetingSlotLabel(form)
  const moment = meetingSlotMoment(form)
  const past = moment !== '' && Date.parse(moment) < Date.now()
  const linkBroken = form.link.trim() !== '' && !isHttpUrl(form.link.trim())
  const blocker = blockerOf(form, linkBroken)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (blocker || add.isPending) return
    setFailure('')

    add.mutate(
      { code, body: toMeetingBody(form, people, moment, past) },
      {
        onSuccess: (row) => {
          /* A slot in the past is a write-up of a meeting already held, which
             is what the server's own timeline line calls it too. */
          toast(doneToast(past, row.isFirst), {
            tone: 'success',
            ...(row.isFirst
              ? { detail: 'Dòng thời gian của lead có thêm một mốc "gặp lần đầu".' }
              : {}),
          })
          onClose()
        },
        onError: (error) =>
          setFailure(
            isApiError(error) ? userMessage(error) : 'Không lưu được buổi họp. Vui lòng thử lại.',
          ),
      },
    )
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Đặt lịch họp"
      subtitle={
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate">{company}</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono">{code}</span>
        </span>
      }
      width="md"
      footer={
        <ScheduleFooter
          message={failure || blocker || readback}
          warning={Boolean(failure || blocker)}
          blocked={Boolean(blocker)}
          pending={add.isPending}
          past={past}
          onClose={onClose}
        />
      }
    >
      <form id={FORM_ID} onSubmit={submit} noValidate className="flex min-w-0 flex-col gap-8">
        <BasicsGroup form={form} readback={readback} linkBroken={linkBroken} />
        <AttendeesGroup form={form} people={people} company={company} contacts={book?.rows ?? []} />
        <PrepareGroup form={form} past={past} />
      </form>
    </Drawer>
  )
}

const FORM_ID = 'schedule-meeting'

/** The same write has two names, decided by where the chosen moment sits. The
 *  server already draws that line on the lead timeline, so a screen announcing
 *  a booking over a meeting held last Tuesday contradicts its own history. */
function doneToast(past: boolean, first: boolean): string {
  if (past) return first ? 'Đã ghi lại buổi họp — đây là lần gặp đầu' : 'Đã ghi lại buổi họp'
  return first ? 'Đã đặt lịch — đây là lần gặp đầu' : 'Đã đặt lịch họp'
}

/** One sentence per way this cannot be sent yet, in the order the eye reads the
 *  panel. A bare disabled button leaves the reader hunting for the wrong
 *  field. */
function blockerOf(form: MeetingDraft, linkBroken: boolean): string | null {
  if (!form.title.trim()) return 'Còn thiếu tiêu đề.'
  if (!form.date) return 'Chưa chọn ngày họp.'
  if (!form.time) return 'Chưa chọn giờ bắt đầu.'
  if (form.hostIds.length === 0) return 'Chọn ít nhất một người bên mình.'
  if (form.hostIds.length > MEETING_MAX_HOSTS)
    return `Một buổi tối đa ${MEETING_MAX_HOSTS} người bên mình — đang chọn ${form.hostIds.length}.`
  if (form.guests.length > MEETING_MAX_GUESTS)
    return `Một buổi tối đa ${MEETING_MAX_GUESTS} khách — đang chọn ${form.guests.length}.`
  if (linkBroken) return 'Link họp phải bắt đầu bằng http:// hoặc https://.'
  return null
}

/** The draft as the contract wants it. A function rather than inline JSX state
 *  so the one place that decides what crosses the wire can be read whole. */
function toMeetingBody(
  form: MeetingDraft,
  people: readonly Actor[],
  moment: string,
  past: boolean,
): MeetingCreate {
  return {
    at: moment,
    title: form.title.trim(),
    durationMinutes: form.durationMinutes,
    mode: form.mode,
    ...(form.link.trim() ? { link: form.link.trim() } : {}),
    ...(form.goal.trim() ? { goal: form.goal.trim() } : {}),
    /* A transcript only travels when the slot really is in the past. Anything
       left in the box after the date is moved forward belongs to a meeting that
       has not happened. */
    ...(past && form.transcript.trim() ? { transcript: form.transcript.trim() } : {}),
    hosts: form.hostIds.map((id) => ({
      actorId: id,
      name: people.find((person) => person.id === id)?.name ?? id,
    })),
    guests: form.guests.map((guest) => ({
      name: guest.name,
      ...(guest.role ? { role: guest.role } : {}),
      ...(guest.contactCode ? { contactCode: guest.contactCode } : {}),
    })),
  }
}

function ScheduleFooter({
  message,
  warning,
  blocked,
  pending,
  past,
  onClose,
}: {
  message: string
  warning: boolean
  blocked: boolean
  pending: boolean
  /** The chosen moment is already behind us, so this write is a note of a
   *  meeting held rather than a booking — see `doneToast`. */
  past: boolean
  onClose: () => void
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <span
        aria-live="polite"
        className={
          warning
            ? 'text-warning min-w-0 text-[11.5px] leading-[1.5]'
            : 'text-muted-foreground min-w-0 text-[11.5px] leading-[1.5]'
        }
      >
        {message}
      </span>
      <div className="flex shrink-0 gap-2">
        <Button size="lg" variant="ghost" type="button" onClick={onClose}>
          Huỷ
        </Button>
        <Button size="lg" type="submit" form={FORM_ID} disabled={blocked || pending}>
          <Icon icon={Check} size={16} />
          {/* The button is read BEFORE the press, so of the three places that
              name this write it is the one that must not say "booking" over a
              meeting held last week. */}
          {pending ? 'Đang lưu…' : past ? 'Ghi lại buổi họp' : 'Đặt lịch'}
        </Button>
      </div>
    </div>
  )
}

function BasicsGroup({
  form,
  readback,
  linkBroken,
}: {
  form: MeetingDraft
  readback: string
  linkBroken: boolean
}) {
  return (
    <section className="flex min-w-0 flex-col gap-4">
      <SectionTitle size="md">Buổi họp</SectionTitle>
      <TitleField value={form.title} onChange={form.setTitle} />
      <WhenRow form={form} readback={readback} />
      <Field label="Hình thức">
        <SegmentedControl
          label="Hình thức"
          hideLabel
          value={form.mode}
          onChange={(value) => form.setMode(value as MeetingMode)}
          options={MEETING_MODE_ORDER.map((value) => ({
            value,
            label: MEETING_MODE_LABEL[value],
          }))}
        />
      </Field>
      <Field
        label="Link họp"
        hint="Để trống cũng được — dán link vào sau khi đã có."
        problem={linkBroken ? 'Link họp phải bắt đầu bằng http:// hoặc https://.' : undefined}
      >
        <Input
          value={form.link}
          invalid={linkBroken}
          placeholder="https://meet.google.com/…"
          onChange={(event) => form.setLink(event.target.value)}
        />
      </Field>
    </section>
  )
}

/** Titles people actually book. Four, because a fifth stops being a shortcut
 *  and starts being a list to read; each one lands in the box as ordinary text
 *  that can still be edited by hand. */
const TITLE_SUGGESTIONS = [
  'Lần gặp đầu',
  'Demo sản phẩm',
  'Khảo sát nhà máy',
  'Chốt phương án',
] as const

function TitleField({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  return (
    <Field label="Tiêu đề *">
      <Input
        value={value}
        maxLength={MEETING_TITLE_MAX}
        placeholder="Buổi này bàn gì?"
        onChange={(event) => onChange(event.target.value)}
      />
      <div className="flex min-w-0 flex-wrap gap-2">
        {TITLE_SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onChange(suggestion)}
            className="motion-std bg-surface-ink/9 hover:bg-surface-ink/16 text-glass-foreground hover:text-foreground pointer-coarse:h-12 h-8 rounded-sm px-3 text-[11.5px] font-medium"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </Field>
  )
}

/** Day · start · length, then one line reading the three of them back.
 *
 *  Every column carries `min-w-0`: a three-column grid whose children keep
 *  their intrinsic width pushes a 560px panel wider than it is, and the panel
 *  grows a horizontal scrollbar instead of the columns shrinking. */
function WhenRow({ form, readback }: { form: MeetingDraft; readback: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="grid min-w-0 grid-cols-3 gap-3">
        <Field label="Ngày" className="min-w-0">
          <Input
            type="date"
            value={form.date}
            onChange={(event) => form.setDate(event.target.value)}
          />
        </Field>
        <Field label="Bắt đầu" className="min-w-0">
          <Input
            type="time"
            value={form.time}
            onChange={(event) => form.setTime(event.target.value)}
          />
        </Field>
        <Field label="Thời lượng" className="min-w-0">
          <Select
            label="Thời lượng"
            hideLabel
            className="w-full"
            value={String(form.durationMinutes)}
            onChange={(value) => form.setDuration(Number(value) as MeetingDurationMinutes)}
            options={MEETING_DURATION_MINUTES.map((minutes) => ({
              value: String(minutes),
              label: MEETING_DURATION_LABEL[minutes],
            }))}
          />
        </Field>
      </div>
      {readback && (
        <p className="text-foreground bg-surface-ink/5 m-0 flex min-w-0 items-center gap-2 rounded-sm px-3 py-2 text-[12px] leading-[1.5]">
          <Icon icon={Timer} size={16} className="text-muted-foreground shrink-0" />
          <span className="min-w-0">{readback}</span>
        </p>
      )}
    </div>
  )
}

type LeadContact = { code: string; name: string; title?: string; email?: string }

/** Loose on purpose: it guards a text box, not a mailbox. Anything with an `@`
 *  between two runs of non-space is somebody reaching for the wrong field. */
const LOOKS_LIKE_EMAIL = /^\S+@\S+$/

function AttendeesGroup({
  form,
  people,
  company,
  contacts,
}: {
  form: MeetingDraft
  people: readonly Actor[]
  company: string
  contacts: readonly LeadContact[]
}) {
  const staff = useMemo<TokenPerson[]>(
    () => people.map((person) => ({ id: person.id, name: person.name, note: person.role })),
    [people],
  )
  /* The first token carries the chair. One list with a position rather than two
     lists, because "who runs it" is an order, not a second membership. */
  const hostTokens = form.hostIds.map((id, index) => ({
    id,
    name: staff.find((person) => person.id === id)?.name ?? id,
    ...(index === 0 ? { tag: 'chủ trì' } : {}),
  }))
  const taken = new Set(form.guests.map((guest) => guest.contactCode).filter(Boolean))

  const pickContact = (contactCode: string) => {
    const found = contacts.find((contact) => contact.code === contactCode)
    if (!found) return
    form.addGuest({
      id: found.code,
      contactCode: found.code,
      name: found.name,
      ...(found.title ? { role: found.title } : {}),
    })
  }

  /* The typed path writes a NAME. `MeetingGuestInput` has no address field, so
     an address typed here would be stored in `name` and read back as a person's
     name everywhere the meeting is shown. */
  const addTypedGuest = (text: string): string | null => {
    if (LOOKS_LIKE_EMAIL.test(text))
      return 'Ô này nhận TÊN khách, không nhận email — hồ sơ buổi họp không có chỗ lưu địa chỉ.'
    form.addGuest({ id: `typed:${text}`, name: text })
    return null
  }

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <SectionTitle size="md">Người tham dự</SectionTitle>

      <Field label="Bên mình">
        <PersonTokenField
          label="Thêm người bên mình"
          placeholder="Thêm người…"
          tokens={hostTokens}
          suggestions={staff.filter((person) => !form.hostIds.includes(person.id))}
          onPick={form.addHost}
          onRemove={form.dropHost}
          hint="Người đầu tiên là chủ trì. Backspace để bỏ người cuối."
          emptyNote="Cả sổ nhân sự đã có mặt trong buổi này."
        />
      </Field>

      <Field label="Khách">
        <PersonTokenField
          label="Thêm khách"
          placeholder="Tìm khách hoặc gõ tên khách mới…"
          tokens={form.guests.map((guest) => ({
            id: guest.id,
            name: guest.name,
            ...(guest.role ? { note: guest.role } : {}),
          }))}
          suggestions={contacts
            .filter((contact) => !taken.has(contact.code))
            .map((contact) => ({
              id: contact.code,
              name: contact.name,
              note: [contact.title, contact.email].filter(Boolean).join(' · '),
            }))}
          onPick={pickContact}
          onRemove={form.dropGuest}
          onFreeText={addTypedGuest}
          hint={`Tìm trong người liên hệ của ${company}. Chưa có trong sổ thì gõ tên rồi nhấn Enter.`}
          emptyNote="Sổ liên hệ của lead này chưa có ai — gõ tên khách rồi nhấn Enter."
        />
      </Field>
    </section>
  )
}

function PrepareGroup({ form, past }: { form: MeetingDraft; past: boolean }) {
  return (
    <section className="flex min-w-0 flex-col gap-4">
      <SectionTitle size="md">Chuẩn bị</SectionTitle>
      <Field label="Mục tiêu buổi họp (không bắt buộc)">
        <Textarea
          rows={3}
          value={form.goal}
          maxLength={MEETING_GOAL_MAX}
          placeholder="VD: Hiểu quy trình báo cáo sản xuất hiện tại, hẹn ngày khảo sát."
          onChange={(event) => form.setGoal(event.target.value)}
        />
      </Field>
      {past && <PastMeetingNote value={form.transcript} onChange={form.setTranscript} />}
    </section>
  )
}

/** The transcript box, and it shows up only once the chosen slot is behind us.
 *
 *  This door books what is ahead, so a transcript field standing open on it
 *  asks for the minutes of a meeting nobody has held. But backdating the date
 *  IS how this repo records a call somebody wrote up afterwards, and that path
 *  must stay open: creation is the only moment a transcript can be written at
 *  all, `PATCH /meetings/:id` having no screen. So the field follows the date
 *  instead of a door of its own. */
function PastMeetingNote({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  return (
    <Field
      label="Biên bản buổi họp (không bắt buộc)"
      hint="Thời điểm đã chọn nằm trong quá khứ, nên đây là ghi bù. Dán nguyên bản ghi vào đây."
    >
      <Textarea
        rows={6}
        value={value}
        maxLength={TRANSCRIPT_MAX}
        placeholder="Dán transcript hoặc ghi chép của buổi đã diễn ra…"
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  )
}

/** A guest mid-draft. `id` is the contact code when the person came out of the
 *  lead's book and a marked copy of the typed text when they did not, so one
 *  list can hold both and neither kind can be added twice. */
type GuestPick = { id: string; name: string; role?: string; contactCode?: string }

type MeetingDraft = ReturnType<typeof useMeetingDraft>

/** Every field of the draft, cleared on each open.
 *
 *  Reopening is a NEW booking: a panel that comes back holding the previous
 *  meeting's attendees is one click away from booking the wrong room with the
 *  wrong people. Date and time start EMPTY rather than at "now", because this
 *  door is about a day two sides have agreed on, and a pre-filled today is a
 *  default nobody chose that still looks chosen. */
function useMeetingDraft(open: boolean) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [durationMinutes, setDuration] = useState<MeetingDurationMinutes>(DEFAULT_MEETING_DURATION)
  const [mode, setMode] = useState<MeetingMode>(DEFAULT_MEETING_MODE)
  const [link, setLink] = useState('')
  const [hostIds, setHostIds] = useState<string[]>([])
  const [guests, setGuests] = useState<GuestPick[]>([])
  const [goal, setGoal] = useState('')
  const [transcript, setTranscript] = useState('')

  useEffect(() => {
    if (!open) return
    setTitle('')
    setDate('')
    setTime('')
    setDuration(DEFAULT_MEETING_DURATION)
    setMode(DEFAULT_MEETING_MODE)
    setLink('')
    setHostIds([])
    setGuests([])
    setGoal('')
    setTranscript('')
  }, [open])

  return {
    title,
    setTitle,
    date,
    setDate,
    time,
    setTime,
    durationMinutes,
    setDuration,
    mode,
    setMode,
    link,
    setLink,
    goal,
    setGoal,
    transcript,
    setTranscript,
    hostIds,
    guests,
    addHost: (id: string) => setHostIds((current) => [...current, id]),
    dropHost: (id: string) => setHostIds((current) => current.filter((held) => held !== id)),
    addGuest: (guest: GuestPick) => setGuests((current) => [...current, guest]),
    dropGuest: (id: string) => setGuests((current) => current.filter((guest) => guest.id !== id)),
  }
}
