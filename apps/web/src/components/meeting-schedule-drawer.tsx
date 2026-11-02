import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Building, CalendarClock, Check, Trash2 } from '@pv/ui'
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
import { toast } from '@/app/toast'
import { message, translate, useI18n, type Lang, type Message } from '@/app/i18n'
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
  meetingModeLabel,
  MEETING_MODE_ORDER,
  meetingSlotLabel,
  meetingSlotMoment,
  meetingSlotOf,
} from '@/data/meeting-labels'
import { useAddMeeting, useDropMeeting, useEditMeeting, type MeetingSubject } from '@/data/meetings'

const SCHEDULE = {
  couldNotSaveThe: message(
    'Không lưu được buổi họp. Thử lại.',
    'Could not save the meeting. Try again.',
    '회의를 저장하지 못했습니다. 다시 시도해 주세요.',
  ),
  meetingRescheduled: message('Đã dời lịch họp', 'Meeting rescheduled', '회의 일정을 변경했습니다'),
  addedAFirstMeeting: message(
    'Đã thêm mốc "gặp lần đầu" vào dòng thời gian của lead.',
    'Added a "first meeting" milestone to the lead timeline.',
    '리드 타임라인에 "첫 미팅" 이정표를 추가했습니다.',
  ),
  meetingDeleted: message('Đã xoá buổi họp', 'Meeting deleted', '회의를 삭제했습니다'),
  couldNotDeleteThe: message(
    'Không xoá được buổi họp. Thử lại.',
    'Could not delete the meeting. Try again.',
    '회의를 삭제하지 못했습니다. 다시 시도해 주세요.',
  ),
  rescheduleMeeting: message('Dời lịch họp', 'Reschedule meeting', '회의 일정 변경'),
  scheduleAMeeting: message('Đặt lịch họp', 'Schedule a meeting', '회의 일정 잡기'),
  saveNewSchedule: message('Lưu lịch mới', 'Save new schedule', '새 일정 저장'),
  logTheMeeting: message('Ghi lại buổi họp', 'Log the meeting', '회의 기록'),
  schedule: message('Đặt lịch', 'Schedule', '일정 잡기'),
}

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
  onDropped,
}: {
  subject: MeetingSubject
  open: boolean
  onClose: () => void
  editing?: MeetingRow
  /** The bar the sheet rises out of; without one it rises from the screen's foot. */
  anchor?: HTMLElement | null
  /** The drop deletes the booking's comm record too, so a screen standing on
   *  that record needs to leave it. */
  onDropped?: () => void
}) {
  const { t, lang } = useI18n()
  const people = useDirectory()
  const { company, contacts } = useSubjectBook(subject, open)
  const add = useAddMeeting()
  const edit = useEditMeeting()
  const drop = useDropMeeting()
  const pending = add.isPending || edit.isPending || drop.isPending

  const form = useMeetingDraft(open, editing)
  const [failure, setFailure] = useState('')

  const readback = meetingSlotLabel(form, lang)
  const moment = meetingSlotMoment(form)
  const past = !editing && moment !== '' && Date.parse(moment) < Date.now()
  const linkBroken = form.link.trim() !== '' && !isHttpUrl(form.link.trim())
  const blocker = blockerOf(form, linkBroken, lang)
  const onError = (error: unknown) =>
    setFailure(isApiError(error) ? userMessage(error) : t(SCHEDULE.couldNotSaveThe))

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
            toastSaved(t(SCHEDULE.meetingRescheduled), row)
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
            doneToast(past, row.isFirst, lang),
            row,
            row.isFirst ? t(SCHEDULE.addedAFirstMeeting) : undefined,
          )
          onClose()
        },
        onError,
      },
    )
  }

  /* The server refuses a meeting already under way (409), so the door is not offered. */
  const droppable = editing !== undefined && Date.parse(editing.at) > Date.now()

  /* No `confirm()` (it freezes automation); the button says what it does. */
  const dropEditing = () => {
    if (!editing || pending) return
    setFailure('')
    drop.mutate(
      { subject, id: editing.id },
      {
        onSuccess: () => {
          toast(t(SCHEDULE.meetingDeleted), {
            tone: 'success',
          })
          onClose()
          onDropped?.()
        },
        onError: (error) =>
          setFailure(isApiError(error) ? userMessage(error) : t(SCHEDULE.couldNotDeleteThe)),
      },
    )
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={editing ? t(SCHEDULE.rescheduleMeeting) : t(SCHEDULE.scheduleAMeeting)}
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
          verb={
            editing
              ? t(SCHEDULE.saveNewSchedule)
              : past
                ? t(SCHEDULE.logTheMeeting)
                : t(SCHEDULE.schedule)
          }
          onClose={onClose}
          onDrop={droppable ? dropEditing : undefined}
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
  const { t } = useI18n()
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
  const fallback = lead
    ? t(message('lead này', 'this lead', '이 리드'))
    : t(message('cơ hội này', 'this opportunity', '이 기회'))
  const company = (lead ? profile?.company : deal?.account) ?? fallback
  return { company, contacts }
}

/** The same write has two names, decided by where the chosen moment sits. The
 *  server already draws that line on the lead timeline, so a screen announcing
 *  a booking over a meeting held last Tuesday contradicts its own history. */
function doneToast(past: boolean, first: boolean, lang: Lang): string {
  const m = (vi: string, en: string, ko: string) => translate(message(vi, en, ko), lang)
  if (past) {
    return first
      ? m(
          'Đã ghi lại buổi họp, lần gặp đầu',
          'Meeting logged, first meeting',
          '회의를 기록했습니다, 첫 미팅',
        )
      : m('Đã ghi lại buổi họp', 'Meeting logged', '회의를 기록했습니다')
  }
  return first
    ? m(
        'Đã đặt lịch, lần gặp đầu',
        'Meeting scheduled, first meeting',
        '일정을 잡았습니다, 첫 미팅',
      )
    : m('Đã đặt lịch họp', 'Meeting scheduled', '회의 일정을 잡았습니다')
}

/** One sentence per way this cannot be sent yet, in the order the eye reads the
 *  panel. A bare disabled button leaves the reader hunting for the wrong
 *  field. */
function blockerOf(form: MeetingDraft, linkBroken: boolean, lang: Lang): string | null {
  const m = (vi: string, en: string, ko: string) => translate(message(vi, en, ko), lang)
  const hosts = form.hostIds.length
  const guests = form.guests.length
  if (!form.title.trim())
    return m('Còn thiếu tiêu đề.', 'The title is missing.', '제목이 없습니다.')
  if (!form.date) {
    return m(
      'Chưa chọn ngày họp.',
      'The meeting date is not chosen.',
      '회의 날짜가 선택되지 않았습니다.',
    )
  }
  if (!form.time) {
    return m(
      'Chưa chọn giờ bắt đầu.',
      'The start time is not chosen.',
      '시작 시간이 선택되지 않았습니다.',
    )
  }
  if (hosts === 0) {
    return m(
      'Chọn ít nhất một người bên mình.',
      'Choose at least one person from our side.',
      '우리 측 참석자를 한 명 이상 선택해 주세요.',
    )
  }
  if (hosts > MEETING_MAX_HOSTS) {
    return m(
      `Tối đa ${MEETING_MAX_HOSTS} người bên mình, đang chọn ${hosts}.`,
      `At most ${MEETING_MAX_HOSTS} people from our side, ${hosts} chosen.`,
      `우리 측은 최대 ${MEETING_MAX_HOSTS}명, 현재 ${hosts}명 선택됨.`,
    )
  }
  if (guests > MEETING_MAX_GUESTS) {
    return m(
      `Tối đa ${MEETING_MAX_GUESTS} khách, đang chọn ${guests}.`,
      `At most ${MEETING_MAX_GUESTS} guests, ${guests} chosen.`,
      `고객 측은 최대 ${MEETING_MAX_GUESTS}명, 현재 ${guests}명 선택됨.`,
    )
  }
  if (linkBroken) return linkRule(m)
  return null
}

const linkRule = (m: (vi: string, en: string, ko: string) => string) =>
  m(
    'Link họp phải bắt đầu bằng http:// hoặc https://.',
    'The meeting link must start with http:// or https://.',
    '회의 링크는 http:// 또는 https://로 시작해야 합니다.',
  )

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
  onDrop,
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
  /** Only on a reschedule: the booking can be dropped from the same sheet. */
  onDrop?: (() => void) | undefined
}) {
  const { t } = useI18n()
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
        {onDrop && (
          <Button
            variant="ghost"
            type="button"
            className="hover:text-destructive-foreground pointer-coarse:h-12"
            disabled={pending}
            onClick={onDrop}
          >
            <Icon icon={Trash2} size={16} />
            {t(message('Xoá lịch', 'Delete booking', '일정 삭제'))}
          </Button>
        )}
        <Button variant="ghost" type="button" className="pointer-coarse:h-12" onClick={onClose}>
          {t(message('Huỷ', 'Cancel', '취소'))}
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
          {pending ? t(message('Đang lưu…', 'Saving…', '저장 중…')) : verb}
        </Button>
      </div>
    </div>
  )
}

function BasicsGroup({ form, linkBroken }: { form: MeetingDraft; linkBroken: boolean }) {
  const { t, lang } = useI18n()
  const m = (vi: string, en: string, ko: string) => t(message(vi, en, ko))
  const { data: google } = useQuery(googleLinkQuery())
  /* A link only means something online; one already typed stays visible so
     switching mode never hides what will still be sent. */
  const showLink = form.mode === 'online' || form.link !== ''

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <TitleField value={form.title} onChange={form.setTitle} />
      <WhenRow form={form} />
      <div className="grid min-w-0 gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-end">
        <Field label={m('Hình thức', 'Format', '진행 방식')}>
          <SegmentedControl
            label={m('Hình thức', 'Format', '진행 방식')}
            hideLabel
            value={form.mode}
            onChange={(value) => form.setMode(value as MeetingMode)}
            options={MEETING_MODE_ORDER.map((value) => ({
              value,
              label: meetingModeLabel(value, lang),
            }))}
          />
        </Field>
        {showLink && (
          <Field
            label={m('Link họp', 'Meeting link', '회의 링크')}
            className="min-w-0"
            problem={linkBroken ? linkRule(m) : undefined}
          >
            <Input
              value={form.link}
              invalid={linkBroken}
              className="pointer-coarse:h-12"
              /* The server asks Google for a Meet room only for an online
                 meeting with no link of its own (`meeting-calendar.ts`). */
              placeholder={
                google?.connected
                  ? m(
                      'Để trống để tạo link Google Meet',
                      'Leave empty to create a Google Meet link',
                      '비워 두면 Google Meet 링크를 만듭니다',
                    )
                  : 'https://meet.google.com/…'
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
const TITLE_SUGGESTIONS: readonly Message[] = [
  message('Lần gặp đầu', 'First meeting', '첫 미팅'),
  message('Demo sản phẩm', 'Product demo', '제품 데모'),
  message('Khảo sát nhà máy', 'Factory survey', '공장 조사'),
  message('Chốt phương án', 'Finalize the plan', '방안 확정'),
]

function TitleField({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const { t } = useI18n()
  return (
    <Field label={t(message('Tiêu đề', 'Title', '제목'))} required>
      <Input
        aria-required
        value={value}
        maxLength={MEETING_TITLE_MAX}
        className="pointer-coarse:h-12"
        placeholder={t(
          message(
            'Buổi này bàn gì?',
            'What is this meeting about?',
            '이번 회의는 어떤 내용인가요?',
          ),
        )}
        onChange={(event) => onChange(event.target.value)}
      />
      <div className="flex min-w-0 flex-wrap gap-2">
        {TITLE_SUGGESTIONS.map((copy) => {
          const suggestion = t(copy)
          return (
            <button
              key={copy.vi}
              type="button"
              onClick={() => onChange(suggestion)}
              className="motion-std bg-surface-ink/9 hover:bg-surface-ink/16 text-muted-foreground hover:text-foreground pointer-coarse:h-12 h-8 rounded-sm px-3 text-[11.5px] font-medium"
            >
              {suggestion}
            </button>
          )
        })}
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
  const { t } = useI18n()
  return (
    <div className="grid min-w-0 grid-cols-3 gap-3">
      <Field label={t(message('Ngày', 'Date', '날짜'))} className="min-w-0">
        <Input
          type="date"
          className="pointer-coarse:h-12"
          value={form.date}
          onChange={(event) => form.setDate(event.target.value)}
        />
      </Field>
      <Field label={t(message('Bắt đầu', 'Start', '시작'))} className="min-w-0">
        <Input
          type="time"
          className="pointer-coarse:h-12"
          value={form.time}
          onChange={(event) => form.setTime(event.target.value)}
        />
      </Field>
      <Field label={t(message('Thời lượng', 'Duration', '소요 시간'))} className="min-w-0">
        <Select
          label={t(message('Thời lượng', 'Duration', '소요 시간'))}
          hideLabel
          className="pointer-coarse:[&>button]:h-12 w-full"
          value={String(form.durationMinutes)}
          onChange={(value) => form.setDuration(Number(value) as MeetingDurationMinutes)}
          options={MEETING_DURATION_MINUTES.map((minutes) => ({
            value: String(minutes),
            label: t(MEETING_DURATION_LABEL[minutes]),
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
  const { t } = useI18n()
  const m = (vi: string, en: string, ko: string) => t(message(vi, en, ko))
  const staff = useMemo<TokenPerson[]>(
    () => people.map((person) => ({ id: person.id, name: person.name, note: person.role })),
    [people],
  )
  /* The first token carries the chair. One list with a position rather than two
     lists, because "who runs it" is an order, not a second membership. */
  const hostTokens = form.hostIds.map((id, index) => ({
    id,
    name: staff.find((person) => person.id === id)?.name ?? id,
    ...(index === 0 ? { tag: m('chủ trì', 'chair', '주관') } : {}),
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
    if (LOOKS_LIKE_EMAIL.test(text)) {
      return m(
        'Nhập tên khách, không nhập email.',
        'Enter the guest name, not an email.',
        '이메일이 아닌 참석자 이름을 입력해 주세요.',
      )
    }
    form.addGuest({ id: `typed:${text}`, name: text })
    return null
  }

  return (
    <section className="grid min-w-0 gap-4 sm:grid-cols-2">
      <Field label={m('Người bên mình', 'Our side', '우리 측')} className="min-w-0">
        <PersonTokenField
          label={m('Thêm người bên mình', 'Add people from our side', '우리 측 참석자 추가')}
          placeholder={m('Thêm người…', 'Add people…', '참석자 추가…')}
          tokens={hostTokens}
          suggestions={staff.filter((person) => !form.hostIds.includes(person.id))}
          onPick={form.addHost}
          onRemove={form.dropHost}
          hint={m(
            'Người đầu tiên là chủ trì.',
            'The first person chairs the meeting.',
            '첫 번째 사람이 회의를 주관합니다.',
          )}
          emptyNote={m('Không còn ai để thêm.', 'No one left to add.', '추가할 사람이 없습니다.')}
        />
      </Field>

      <Field label={m('Khách mời', 'Guests', '초대 참석자')} className="min-w-0">
        <PersonTokenField
          label={m('Thêm khách', 'Add guests', '참석자 추가')}
          placeholder={m(
            'Tìm hoặc gõ tên khách…',
            'Search or type a guest name…',
            '참석자를 검색하거나 이름을 입력하세요…',
          )}
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
          hint={m(
            'Khách mới: gõ tên rồi nhấn Enter.',
            'New guest: type a name and press Enter.',
            '새 참석자: 이름을 입력하고 Enter 키를 누르세요.',
          )}
          emptyNote={m(
            'Chưa có người liên hệ. Gõ tên khách rồi nhấn Enter.',
            'No contacts yet. Type a guest name and press Enter.',
            '연락처가 아직 없습니다. 참석자 이름을 입력하고 Enter 키를 누르세요.',
          )}
        />
      </Field>
    </section>
  )
}

function GoalField({ form }: { form: MeetingDraft }) {
  const { t } = useI18n()
  return (
    <Field label={t(message('Mục tiêu (không bắt buộc)', 'Goal (optional)', '목표 (선택)'))}>
      <Textarea
        rows={2}
        value={form.goal}
        maxLength={MEETING_GOAL_MAX}
        placeholder={t(
          message(
            'VD: Hiểu quy trình báo cáo sản xuất, hẹn ngày khảo sát.',
            'e.g. Understand the production reporting process, set a survey date.',
            '예: 생산 보고 프로세스를 파악하고 조사 일정을 잡는다.',
          ),
        )}
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
