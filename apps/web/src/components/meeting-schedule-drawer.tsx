import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Building, CalendarClock, Check } from '@pv/ui'
import { Button, Drawer, Icon, Input, MetaPill, SegmentedControl, Select, Textarea } from '@pv/ui'
import {
  MEETING_DURATION_MINUTES,
  MEETING_GOAL_MAX,
  MEETING_MAX_GUESTS,
  MEETING_MAX_HOSTS,
  MEETING_TITLE_MAX,
  type MeetingCreate,
  type MeetingDurationMinutes,
  type MeetingMode,
  type MeetingRow,
} from '@pv/contracts'
import type { Actor } from '@pv/engines'
import { isApiError, userMessage } from '@/app/api'
import { Field } from '@/components/field-bits'
import { GoogleCalendarChip } from '@/components/google-calendar-chip'
import { toastSaved } from '@/components/meeting-saved-toast'
import { PersonTokenField, type TokenPerson } from '@/components/person-token-field'
import { leadContactsQuery } from '@/data/contacts'
import { useDirectory } from '@/data/directory'
import { googleLinkQuery } from '@/data/google'
import { isHttpUrl } from '@/data/http-url'
import { leadProfileQuery } from '@/data/lead-profile'
import { opportunityProfileQuery } from '@/data/opportunities'
import {
  DEFAULT_MEETING_DURATION,
  DEFAULT_MEETING_MODE,
  MEETING_DURATION_LABEL,
  MEETING_MODE_LABEL,
  MEETING_MODE_ORDER,
  meetingSlotLabel,
  meetingSlotMoment,
  meetingSlotOf,
} from '@/data/meeting-labels'
import { useAddMeeting, useEditMeeting, type MeetingSubject } from '@/data/meetings'

/** Booking a meeting that has NOT happened yet — one sheet, no section headings.
 *
 *  Day, hour and length are three separate decisions and read as three (not one
 *  `datetime-local`); attendees are a list of people and look like one. The
 *  slot is read back once, in the footer beside the button that books it.
 *
 *  Two books, and the asymmetry is the server's rather than a shortcut: a host
 *  must name an `actorId` from `platform.actor`, a guest may carry a
 *  `contactCode` or simply be typed in — see the `MeetingAttendee` docblock.
 *
 *  No minutes box: booking opens the meeting's comm record at once
 *  (`scheduled`); minutes, attendance and files go there at close-out — no
 *  transcript is stored, so a box here would drop what was typed.
 *  `editing` turns the panel into the reschedule door: seeded from the row,
 *  saved by PATCH, whose arrays replace the old attendee lists whole. */
export function MeetingScheduleDrawer({
  subject,
  open,
  onClose,
  editing,
  anchor,
}: {
  subject: MeetingSubject
  open: boolean
  onClose: () => void
  editing?: MeetingRow
  /** The bar the sheet rises out of; without one it rises from the screen's foot. */
  anchor?: HTMLElement | null
}) {
  const people = useDirectory()
  const { company, contacts } = useSubjectBook(subject, open)
  const add = useAddMeeting()
  const edit = useEditMeeting()
  const pending = add.isPending || edit.isPending

  const form = useMeetingDraft(open, editing)
  const [failure, setFailure] = useState('')

  const readback = meetingSlotLabel(form)
  const moment = meetingSlotMoment(form)
  const past = !editing && moment !== '' && Date.parse(moment) < Date.now()
  const linkBroken = form.link.trim() !== '' && !isHttpUrl(form.link.trim())
  const blocker = blockerOf(form, linkBroken)
  const onError = (error: unknown) =>
    setFailure(isApiError(error) ? userMessage(error) : 'Không lưu được buổi họp. Thử lại.')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (blocker || pending) return
    setFailure('')
    const body = toMeetingBody(form, people, moment)

    if (editing) {
      edit.mutate(
        { subject, id: editing.id, body },
        {
          onSuccess: (row) => {
            toastSaved('Đã dời lịch họp', row)
            onClose()
          },
          onError,
        },
      )
      return
    }
    add.mutate(
      { subject, body },
      {
        onSuccess: (row) => {
          /* A slot in the past is a write-up of a meeting already held, which
             is what the server's own timeline line calls it too. */
          toastSaved(
            doneToast(past, row.isFirst),
            row,
            row.isFirst ? 'Đã thêm mốc "gặp lần đầu" vào dòng thời gian của lead.' : undefined,
          )
          onClose()
        },
        onError,
      },
    )
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={editing ? 'Dời lịch họp' : 'Đặt lịch họp'}
      subtitle={
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <MetaPill icon={Building} className="max-w-full">
            {company}
          </MetaPill>
          <MetaPill mono>{subject.code}</MetaPill>
        </span>
      }
      side="bottom"
      anchor={anchor}
      meta={<GoogleCalendarChip />}
      footer={
        <ScheduleFooter
          failure={failure}
          blocker={blocker}
          readback={readback}
          blocked={Boolean(blocker)}
          pending={pending}
          verb={editing ? 'Lưu lịch mới' : past ? 'Ghi lại buổi họp' : 'Đặt lịch'}
          onClose={onClose}
        />
      }
    >
      <form id={FORM_ID} onSubmit={submit} noValidate className="flex min-w-0 flex-col gap-6">
        <BasicsGroup form={form} linkBroken={linkBroken} />
        <AttendeesGroup form={form} people={people} contacts={contacts} />
        <GoalField form={form} />
      </form>
    </Drawer>
  )
}

const FORM_ID = 'schedule-meeting'

const NO_CONTACTS: LeadContact[] = []

/** The customer's name and contact book, from the subject's own profile — a
 *  cache hit on the screen that opened the drawer; `enabled` keeps it honest. */
function useSubjectBook(subject: MeetingSubject, open: boolean) {
  const lead = subject.kind === 'lead'
  const { data: profile } = useQuery({ ...leadProfileQuery(subject.code), enabled: open && lead })
  const { data: book } = useQuery({ ...leadContactsQuery(subject.code), enabled: open && lead })
  const { data: deal } = useQuery({
    ...opportunityProfileQuery(subject.code),
    enabled: open && !lead,
  })
  const contacts = useMemo<LeadContact[]>(
    () =>
      lead
        ? (book?.rows ?? NO_CONTACTS)
        : (deal?.contacts.map((c) => ({
            code: c.code,
            name: c.name,
            ...(c.title ? { title: c.title } : {}),
            ...(c.email ? { email: c.email } : {}),
          })) ?? NO_CONTACTS),
    [lead, book, deal],
  )
  const company = (lead ? profile?.company : deal?.account) ?? (lead ? 'lead này' : 'cơ hội này')
  return { company, contacts }
}

/** The same write has two names, decided by where the chosen moment sits. The
 *  server already draws that line on the lead timeline, so a screen announcing
 *  a booking over a meeting held last Tuesday contradicts its own history. */
function doneToast(past: boolean, first: boolean): string {
  if (past) return first ? 'Đã ghi lại buổi họp, lần gặp đầu' : 'Đã ghi lại buổi họp'
  return first ? 'Đã đặt lịch, lần gặp đầu' : 'Đã đặt lịch họp'
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
    return `Tối đa ${MEETING_MAX_HOSTS} người bên mình, đang chọn ${form.hostIds.length}.`
  if (form.guests.length > MEETING_MAX_GUESTS)
    return `Tối đa ${MEETING_MAX_GUESTS} khách, đang chọn ${form.guests.length}.`
  if (linkBroken) return 'Link họp phải bắt đầu bằng http:// hoặc https://.'
  return null
}

/** The draft as the contract wants it. A function rather than inline JSX state
 *  so the one place that decides what crosses the wire can be read whole. */
function toMeetingBody(
  form: MeetingDraft,
  people: readonly Actor[],
  moment: string,
): MeetingCreate {
  return {
    at: moment,
    title: form.title.trim(),
    durationMinutes: form.durationMinutes,
    mode: form.mode,
    ...(form.link.trim() ? { link: form.link.trim() } : {}),
    ...(form.goal.trim() ? { goal: form.goal.trim() } : {}),
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
  failure,
  blocker,
  readback,
  blocked,
  pending,
  verb,
  onClose,
}: {
  failure: string
  blocker: string | null
  readback: string
  blocked: boolean
  pending: boolean
  /** What the press does. A slot already behind us is a note of a meeting held
   *  rather than a booking (`doneToast`); a reschedule saves a new slot. */
  verb: string
  onClose: () => void
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      {/* A refused save is an error and reads red; a field still empty is only
          what is left to fill; a complete slot is read back as the booking. */}
      <span aria-live="polite" className="min-w-0 text-[11.5px] leading-[1.5]">
        {failure ? (
          <span className="text-destructive-foreground">{failure}</span>
        ) : blocker ? (
          <span className="text-muted-foreground">{blocker}</span>
        ) : (
          readback && (
            <MetaPill icon={CalendarClock} tone="accent" className="text-[11.5px]">
              {readback}
            </MetaPill>
          )
        )}
      </span>
      <div className="flex shrink-0 gap-2">
        <Button variant="ghost" type="button" className="pointer-coarse:h-12" onClick={onClose}>
          Huỷ
        </Button>
        <Button
          type="submit"
          form={FORM_ID}
          className="pointer-coarse:h-12"
          disabled={blocked || pending}
        >
          <Icon icon={Check} size={16} />
          {/* The button is read BEFORE the press, so of the three places that
              name this write it is the one that must not say "booking" over a
              meeting held last week. */}
          {pending ? 'Đang lưu…' : verb}
        </Button>
      </div>
    </div>
  )
}

function BasicsGroup({ form, linkBroken }: { form: MeetingDraft; linkBroken: boolean }) {
  const { data: google } = useQuery(googleLinkQuery())
  /* A link only means something online; one already typed stays visible so
     switching mode never hides what will still be sent. */
  const showLink = form.mode === 'online' || form.link !== ''

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <TitleField value={form.title} onChange={form.setTitle} />
      <WhenRow form={form} />
      <div className="grid min-w-0 gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-end">
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
        {showLink && (
          <Field
            label="Link họp"
            className="min-w-0"
            problem={linkBroken ? 'Link họp phải bắt đầu bằng http:// hoặc https://.' : undefined}
          >
            <Input
              value={form.link}
              invalid={linkBroken}
              className="pointer-coarse:h-12"
              /* The server asks Google for a Meet room only for an online
                 meeting with no link of its own (`meeting-calendar.ts`). */
              placeholder={
                google?.connected ? 'Để trống để tạo link Google Meet' : 'https://meet.google.com/…'
              }
              onChange={(event) => form.setLink(event.target.value)}
            />
          </Field>
        )}
      </div>
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
        className="pointer-coarse:h-12"
        placeholder="Buổi này bàn gì?"
        onChange={(event) => onChange(event.target.value)}
      />
      <div className="flex min-w-0 flex-wrap gap-2">
        {TITLE_SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onChange(suggestion)}
            className="motion-std bg-surface-ink/9 hover:bg-surface-ink/16 text-muted-foreground hover:text-foreground pointer-coarse:h-12 h-8 rounded-sm px-3 text-[11.5px] font-medium"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </Field>
  )
}

/** Day · start · length.
 *
 *  Every column carries `min-w-0`: a three-column grid whose children keep
 *  their intrinsic width pushes the panel wider than it is, and the panel
 *  grows a horizontal scrollbar instead of the columns shrinking. */
function WhenRow({ form }: { form: MeetingDraft }) {
  return (
    <div className="grid min-w-0 grid-cols-3 gap-3">
      <Field label="Ngày" className="min-w-0">
        <Input
          type="date"
          className="pointer-coarse:h-12"
          value={form.date}
          onChange={(event) => form.setDate(event.target.value)}
        />
      </Field>
      <Field label="Bắt đầu" className="min-w-0">
        <Input
          type="time"
          className="pointer-coarse:h-12"
          value={form.time}
          onChange={(event) => form.setTime(event.target.value)}
        />
      </Field>
      <Field label="Thời lượng" className="min-w-0">
        <Select
          label="Thời lượng"
          hideLabel
          className="pointer-coarse:[&>button]:h-12 w-full"
          value={String(form.durationMinutes)}
          onChange={(value) => form.setDuration(Number(value) as MeetingDurationMinutes)}
          options={MEETING_DURATION_MINUTES.map((minutes) => ({
            value: String(minutes),
            label: MEETING_DURATION_LABEL[minutes],
          }))}
        />
      </Field>
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
  contacts,
}: {
  form: MeetingDraft
  people: readonly Actor[]
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
    if (LOOKS_LIKE_EMAIL.test(text)) return 'Nhập tên khách, không nhập email.'
    form.addGuest({ id: `typed:${text}`, name: text })
    return null
  }

  return (
    <section className="grid min-w-0 gap-4 sm:grid-cols-2">
      <Field label="Người bên mình" className="min-w-0">
        <PersonTokenField
          label="Thêm người bên mình"
          placeholder="Thêm người…"
          tokens={hostTokens}
          suggestions={staff.filter((person) => !form.hostIds.includes(person.id))}
          onPick={form.addHost}
          onRemove={form.dropHost}
          hint="Người đầu tiên là chủ trì."
          emptyNote="Không còn ai để thêm."
        />
      </Field>

      <Field label="Khách mời" className="min-w-0">
        <PersonTokenField
          label="Thêm khách"
          placeholder="Tìm hoặc gõ tên khách…"
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
          hint="Khách mới: gõ tên rồi nhấn Enter."
          emptyNote="Chưa có người liên hệ. Gõ tên khách rồi nhấn Enter."
        />
      </Field>
    </section>
  )
}

function GoalField({ form }: { form: MeetingDraft }) {
  return (
    <Field label="Mục tiêu (không bắt buộc)">
      <Textarea
        rows={2}
        value={form.goal}
        maxLength={MEETING_GOAL_MAX}
        placeholder="VD: Hiểu quy trình báo cáo sản xuất, hẹn ngày khảo sát."
        onChange={(event) => form.setGoal(event.target.value)}
      />
    </Field>
  )
}

/** A guest mid-draft. `id` is the contact code when the person came out of the
 *  lead's book and a marked copy of the typed text when they did not, so one
 *  list can hold both and neither kind can be added twice. */
type GuestPick = { id: string; name: string; role?: string; contactCode?: string }

type MeetingDraft = ReturnType<typeof useMeetingDraft>

const guestPickOf = (g: MeetingRow['guests'][number]): GuestPick => ({
  id: g.contactCode ?? `typed:${g.name}`,
  name: g.name,
  ...(g.role ? { role: g.role } : {}),
  ...(g.contactCode ? { contactCode: g.contactCode } : {}),
})

/** Every field of the draft, cleared on each open — or seeded from `seed`
 *  when the panel reschedules an existing meeting.
 *
 *  Reopening is a NEW booking: a panel that comes back holding the previous
 *  meeting's attendees is one click away from booking the wrong room with the
 *  wrong people. Date and time start EMPTY rather than at "now", because this
 *  door is about a day two sides have agreed on, and a pre-filled today is a
 *  default nobody chose that still looks chosen. */
function useMeetingDraft(open: boolean, seed?: MeetingRow) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [durationMinutes, setDuration] = useState<MeetingDurationMinutes>(DEFAULT_MEETING_DURATION)
  const [mode, setMode] = useState<MeetingMode>(DEFAULT_MEETING_MODE)
  const [link, setLink] = useState('')
  const [hostIds, setHostIds] = useState<string[]>([])
  const [guests, setGuests] = useState<GuestPick[]>([])
  const [goal, setGoal] = useState('')

  /* Seeded once per opening: a refetch mid-edit hands over a new row object,
     and re-seeding then would wipe what the person is typing. */
  const seedRef = useRef(seed)
  seedRef.current = seed
  const seedId = seed?.id

  useEffect(() => {
    if (!open) return
    const seed = seedRef.current
    const slot = seed ? meetingSlotOf(seed.at) : { date: '', time: '' }
    setTitle(seed?.title ?? '')
    setDate(slot.date)
    setTime(slot.time)
    setDuration(seed?.durationMinutes ?? DEFAULT_MEETING_DURATION)
    setMode(seed?.mode ?? DEFAULT_MEETING_MODE)
    setLink(seed?.link ?? '')
    /* A host row without an actor (pre-contract data) cannot be sent back. */
    setHostIds(seed?.hosts.flatMap((h) => (h.actorId ? [h.actorId] : [])) ?? [])
    setGuests(seed?.guests.map(guestPickOf) ?? [])
    setGoal(seed?.goal ?? '')
  }, [open, seedId])

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
    hostIds,
    guests,
    addHost: (id: string) => setHostIds((current) => [...current, id]),
    dropHost: (id: string) => setHostIds((current) => current.filter((held) => held !== id)),
    addGuest: (guest: GuestPick) => setGuests((current) => [...current, guest]),
    dropGuest: (id: string) => setGuests((current) => current.filter((guest) => guest.id !== id)),
  }
}
