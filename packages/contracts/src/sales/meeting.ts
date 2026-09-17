import { z } from 'zod'
import { ObjectCode, Moment, textInput, textInputOptional } from '../primitives'

/** Meetings held with one lead — the record behind "we have met them before".
 *
 *      GET    /sales/leads/:code/meetings       permission `lead.view` · scoped
 *      POST   /sales/leads/:code/meetings       permission `lead.edit` · scoped
 *      PATCH  /sales/leads/:code/meetings/:id   permission `lead.edit` · scoped
 *      DELETE /sales/leads/:code/meetings/:id   permission `lead.edit` · scoped
 *
 *  All four hang off `:code` rather than a flat `/sales/meetings/:id`, because
 *  `@Need` is static metadata: a flat route would have to READ the meeting to
 *  learn whose lead it belongs to before the scope axis could cut anything —
 *  permission decided after the read. With the code on the path the axis is
 *  present first, and the only thing left to check is that the meeting really
 *  hangs off that lead.
 *
 *  ------------------------------------------------------------------
 *  WHY A TABLE OF ITS OWN AND NOT A `contacted` ROW
 *  ------------------------------------------------------------------
 *  `sales.touch` carries one Vietnamese sentence per event, which is exactly
 *  right for a timeline and cannot hold a joining link, a transcript, and two
 *  lists of people. Widening it would put four mostly-NULL columns on every
 *  row of the busiest table in the branch so that one kind of row could use
 *  them.
 *
 *  The two are not rivals: writing a meeting ALSO writes a touch row, so the
 *  activity feed still tells the whole story. That touch is `first-meeting` for
 *  a lead's first meeting and `contacted` for every later one — which is where the
 *  writer for `first-meeting` finally lives. It was in `TouchKind` from the
 *  start with the note "no door writes this yet".
 *
 *  ------------------------------------------------------------------
 *  `isFirst` IS COMPUTED, NEVER STORED, AND THAT WAS A DECISION
 *  ------------------------------------------------------------------
 *  The first meeting is the EARLIEST meeting of that lead, decided by the
 *  server on read. The alternative on the table was a manual toggle somebody
 *  flips after a call. Two sources for one fact drift, and the day they
 *  disagree the scorecard states a number nobody can trace: a lead with a
 *  meeting list and no toggle, or a toggle and no meetings.
 *
 *  A consequence worth stating rather than discovering: recording a meeting
 *  BACKDATED before the current first one moves the star. That is correct —
 *  the earliest meeting is the first meeting, whatever order the rows were
 *  typed in — but it means `isFirst` is a property of the SET, not of the row,
 *  and no client may cache it per row across a write. */

/** How long a pasted transcript may be. Generous, because the input is a whole
 *  call and truncating one silently is worse than refusing it; bounded,
 *  because an unbounded text column arriving over HTTP is a memory budget
 *  nobody set. Roughly an hour of speech. */
export const TRANSCRIPT_MAX = 100_000

export const MEETING_MAX_HOSTS = 20
export const MEETING_MAX_GUESTS = 50

export const MEETING_TITLE_MAX = 160
export const MEETING_LINK_MAX = 500
export const MEETING_GOAL_MAX = 500

/** Fixed picker, not a free minute count. A meeting is booked on a calendar,
 *  and every calendar app on both sides snaps to a slot from roughly this set
 *  — offering anything finer invites a booking that renders as "10:00–10:37"
 *  next to everyone else's clean hour. 30 is the shortest slot worth a
 *  calendar invite at all; 120 is a half-day workshop, past which a second
 *  meeting is the honest way to plan it rather than one that eats a whole
 *  afternoon on the invite. */
export const MEETING_DURATION_MINUTES = [30, 45, 60, 90, 120] as const

/** One of the fixed slots above. `z.literal` over an array unions them,
 *  which is what keeps this a closed picker rather than `z.number().int()`
 *  quietly accepting 37. */
export const MeetingDurationMinutes = z.literal(MEETING_DURATION_MINUTES)

/** Id of one meeting on the wire.
 *
 *  Not a `ObjectCode`: `LD-0042`-style codes exist for things a person says out
 *  loud and types into a search box, and nobody refers to a meeting by id —
 *  on screen it is a date and a title. Declared once because three routes carry
 *  it, and three hand-written `z.string()` are three chances for one of them to
 *  start accepting anything and hand it to a `::uuid` cast. */
export const MeetingId = z.uuid('Mã cuộc họp phải là UUID')

/** Which side of the table somebody sat on.
 *
 *  One enum instead of two unrelated lists, because attendance is one fact with
 *  an axis — and because the day a third value is needed (a partner, an
 *  interpreter) it is a value here rather than a third array every reader has
 *  to learn about. */
export const MeetingSide = z.enum(['host', 'guest'])

/** Where the meeting actually happened. Three values, closed on purpose: the
 *  scheduling drawer offers exactly these three as radio options, and a
 *  fourth ("phone call"?) is a product decision for the mockup to make, not a
 *  string a client can slip in on its own.
 *
 *  Lowercase single words, matching the convention `MeetingSide` already set
 *  on this file — `mail.ts` writes its enum values `UPPER_SNAKE` because those
 *  are Postgres CHECK keys in a different table; this one has no such
 *  neighbour to match, so it follows the sibling enum right above it instead.
 *  `onsite` is the customer's own factory or office; `office` is ours. */
export const MeetingMode = z.enum(['online', 'onsite', 'office'])

/** One person in the room.
 *
 *  `actorId` is present for our own people and absent for the customer's — that
 *  asymmetry is real, `platform.actor` is a book of employees and there is no
 *  matching "book of every human on the customer's side" a guest could be
 *  looked up in. `contactCode` narrows that gap where it can: `sales.contact`
 *  IS a real table since migration 0018 (28/08), so a guest who is already in
 *  that book may be linked instead of only typed in. It stays optional because
 *  plenty of meetings still happen with somebody nobody has entered as a
 *  contact yet — typing a name is not a fallback being phased out, it is the
 *  only option for a person the book does not hold.
 *
 *  `name` is stored even for a host who has an `actorId` (or a guest who has a
 *  `contactCode`), on the same rule as `TouchRow.by`: a record of a meeting is
 *  a record of who was there THEN. Joining `actor` or `contact` on read would
 *  make a past meeting silently adopt somebody's new name, and would render
 *  nothing at all for a person who has since left either book. */
export const MeetingAttendee = z.object({
  side: MeetingSide,
  actorId: z.string().min(1).max(64).optional(),
  /** Guest only — see the docblock above. Absent means the person was typed in
   *  rather than picked from `sales.contact`, which is still the common case. */
  contactCode: ObjectCode.optional(),
  name: textInput(120),
  /** Job title, as written on the day. Optional — plenty of meetings happen
   *  with somebody whose title nobody wrote down. */
  role: textInputOptional(120),
})

/** A joining link. Not `z.url()`: the value is pasted from Meet/Zoom/Teams and
 *  the only property that matters to the screen is that it is a web address it
 *  can put behind an anchor. A scheme check says exactly that and refuses
 *  `javascript:` — which a bare string field would happily carry into an
 *  `href`. */
const MeetingLink = z
  .string()
  .trim()
  .max(MEETING_LINK_MAX, `Tối đa ${MEETING_LINK_MAX} ký tự`)
  .regex(/^https?:\/\/\S+$/, 'Link họp phải bắt đầu bằng http:// hoặc https://')

export const MeetingRow = z.object({
  id: z.string().min(1),
  leadCode: ObjectCode,

  /** When the meeting HAPPENED, not when the row was typed. The two differ
   *  every time somebody writes up yesterday's call, and the scorecard counts
   *  by this one. */
  at: Moment,
  title: textInput(MEETING_TITLE_MAX),
  link: MeetingLink.optional(),
  transcript: z.string().max(TRANSCRIPT_MAX).optional(),

  /** How long the meeting was booked for, and how it was held. Both optional
   *  HERE ONLY, and that asymmetry with `MeetingCreate` below is not an
   *  oversight — every row typed into `sales.meeting` before this pair of
   *  columns existed has neither, and a read schema that demanded them would
   *  make the reader 500 on its own history. New rows always carry both; old
   *  ones read back as absent, and the screen has to plan for that. */
  durationMinutes: MeetingDurationMinutes.optional(),
  mode: MeetingMode.optional(),
  /** What this meeting was FOR, in the booker's own sentence — the current
   *  reporting routine to understand, the survey date to agree on. Free text
   *  and never required: a meeting booked in a hurry with no stated goal is
   *  still a meeting worth having on the calendar, and forcing a sentence out
   *  of somebody produces filler text, not a real goal. */
  goal: textInputOptional(MEETING_GOAL_MAX),

  hosts: z.array(MeetingAttendee),
  guests: z.array(MeetingAttendee),

  /** Earliest meeting of this lead — see the file docblock. Computed per read
   *  over the whole set; never persisted. */
  isFirst: z.boolean(),

  /** Who wrote the row down, snapshotted like `TouchRow.by`. */
  by: textInput(120),
  createdAt: Moment,
})

export const MeetingListResponse = z.object({
  rows: z.array(MeetingRow),
})

// ---------------------------------------------------------------------------
// WRITING ONE
// ---------------------------------------------------------------------------

/** A host must name an actor: hosts are our own people and the point of the
 *  field is that "who ran this meeting" is answerable later by a person who
 *  was not there. */
export const MeetingHostInput = z.object({
  actorId: z.string().min(1).max(64),
  name: textInput(120),
})

export const MeetingGuestInput = z.object({
  name: textInput(120),
  role: textInputOptional(120),
  /** Optional link into `sales.contact` — see `MeetingAttendee`. Not required:
   *  requiring it would block recording a meeting with somebody not yet in that
   *  book, which is a flow this door must keep open. */
  contactCode: ObjectCode.optional(),
})

export const MeetingCreate = z.object({
  at: Moment,
  title: textInput(MEETING_TITLE_MAX),
  link: MeetingLink.optional(),
  transcript: z.string().max(TRANSCRIPT_MAX).optional(),

  /** Required on every NEW row — unlike `MeetingRow` above, which reads rows
   *  written before this pair existed. The booking drawer always shows both
   *  fields, so a write with neither is the client failing to send what its
   *  own form collected, not a legitimate gap to leave open. */
  durationMinutes: MeetingDurationMinutes,
  mode: MeetingMode,
  goal: textInputOptional(MEETING_GOAL_MAX),

  /** At least one host, because a meeting nobody from here attended is not a
   *  meeting we can answer questions about. Capped so one bad paste cannot
   *  write a thousand rows — and the caps are exported because the booking
   *  drawer stops the typist AT them, and a form that stops at a different
   *  number than the one this gate refuses is a form that fills up and then
   *  loses. */
  hosts: z
    .array(MeetingHostInput)
    .min(1, 'Phải có ít nhất một người chủ trì')
    .max(MEETING_MAX_HOSTS),
  guests: z.array(MeetingGuestInput).max(MEETING_MAX_GUESTS),
})

/** Every field optional, and arrays REPLACE rather than merge.
 *
 *  Merging an attendee list over the wire needs a stable id per person, which
 *  would mean rows for people rather than a list — worth doing the day
 *  attendance is edited person by person, and pure cost today, when the screen
 *  edits the whole meeting in one form. */
export const MeetingPatch = MeetingCreate.partial()

export type MeetingId = z.infer<typeof MeetingId>
export type MeetingSide = z.infer<typeof MeetingSide>
export type MeetingMode = z.infer<typeof MeetingMode>
export type MeetingDurationMinutes = z.infer<typeof MeetingDurationMinutes>
export type MeetingAttendee = z.infer<typeof MeetingAttendee>
export type MeetingRow = z.infer<typeof MeetingRow>
export type MeetingListResponse = z.infer<typeof MeetingListResponse>
export type MeetingCreate = z.infer<typeof MeetingCreate>
export type MeetingPatch = z.infer<typeof MeetingPatch>
