import { z } from 'zod'
import { MaObject, Moc, textNhap, textNhapTuyChon } from '../primitives'

/** Meetings held with one lead — the record behind "we have met them before".
 *
 *      GET    /sales/leads/:code/meetings       permission `lead.xem` · scoped
 *      POST   /sales/leads/:code/meetings       permission `lead.sửa` · scoped
 *      PATCH  /sales/leads/:code/meetings/:id   permission `lead.sửa` · scoped
 *      DELETE /sales/leads/:code/meetings/:id   permission `lead.sửa` · scoped
 *
 *  All four hang off `:code` rather than a flat `/sales/meetings/:id`, because
 *  `@Need` is static metadata: a flat route would have to READ the meeting to
 *  learn whose lead it belongs to before the scope axis could cut anything —
 *  permission decided after the read. With the code on the path the axis is
 *  present first, and the only thing left to check is that the meeting really
 *  hangs off that lead.
 *
 *  ------------------------------------------------------------------
 *  WHY A TABLE OF ITS OWN AND NOT A `cham` ROW
 *  ------------------------------------------------------------------
 *  `sales.touch` carries one Vietnamese sentence per event, which is exactly
 *  right for a timeline and cannot hold a joining link, a transcript, and two
 *  lists of people. Widening it would put four mostly-NULL columns on every
 *  row of the busiest table in the branch so that one kind of row could use
 *  them.
 *
 *  The two are not rivals: writing a meeting ALSO writes a touch row, so the
 *  activity feed still tells the whole story. That touch is `gap-lan-dau` for
 *  a lead's first meeting and `cham` for every later one — which is where the
 *  writer for `gap-lan-dau` finally lives. It was in `TouchKind` from the
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

export const MEETING_TITLE_MAX = 160
export const MEETING_LINK_MAX = 500

/** Id of one meeting on the wire.
 *
 *  Not a `MaObject`: `LD-0042`-style codes exist for things a person says out
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

/** One person in the room.
 *
 *  `actorId` is present for our own people and absent for the customer's, and
 *  that asymmetry is the current shape of the data rather than a preference:
 *  `platform.actor` is a real book of real employees, while the customer side
 *  has no table of its own yet — `LeadContact` is still generated from the
 *  frozen fixture. So a guest is a typed name today.
 *
 *  `name` is stored even for a host who has an `actorId`, on the same rule as
 *  `TouchRow.by`: a record of a meeting is a record of who was there THEN.
 *  Joining `actor` on read would make a past meeting silently adopt somebody's
 *  new name, and would render nothing at all for a person who has since left
 *  and been removed from the book. */
export const MeetingAttendee = z.object({
  side: MeetingSide,
  actorId: z.string().min(1).max(64).optional(),
  name: textNhap(120),
  /** Job title, as written on the day. Optional — plenty of meetings happen
   *  with somebody whose title nobody wrote down. */
  role: textNhapTuyChon(120),
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
  leadCode: MaObject,

  /** When the meeting HAPPENED, not when the row was typed. The two differ
   *  every time somebody writes up yesterday's call, and the scorecard counts
   *  by this one. */
  at: Moc,
  title: textNhap(MEETING_TITLE_MAX),
  link: MeetingLink.optional(),
  transcript: z.string().max(TRANSCRIPT_MAX).optional(),

  hosts: z.array(MeetingAttendee),
  guests: z.array(MeetingAttendee),

  /** Earliest meeting of this lead — see the file docblock. Computed per read
   *  over the whole set; never persisted. */
  isFirst: z.boolean(),

  /** Who wrote the row down, snapshotted like `TouchRow.by`. */
  by: textNhap(120),
  createdAt: Moc,
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
  name: textNhap(120),
})

export const MeetingGuestInput = z.object({
  name: textNhap(120),
  role: textNhapTuyChon(120),
})

export const MeetingCreate = z.object({
  at: Moc,
  title: textNhap(MEETING_TITLE_MAX),
  link: MeetingLink.optional(),
  transcript: z.string().max(TRANSCRIPT_MAX).optional(),

  /** At least one host, because a meeting nobody from here attended is not a
   *  meeting we can answer questions about. Capped so one bad paste cannot
   *  write a thousand rows. */
  hosts: z.array(MeetingHostInput).min(1, 'Phải có ít nhất một người chủ trì').max(20),
  guests: z.array(MeetingGuestInput).max(50),
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
export type MeetingAttendee = z.infer<typeof MeetingAttendee>
export type MeetingRow = z.infer<typeof MeetingRow>
export type MeetingListResponse = z.infer<typeof MeetingListResponse>
export type MeetingCreate = z.infer<typeof MeetingCreate>
export type MeetingPatch = z.infer<typeof MeetingPatch>
