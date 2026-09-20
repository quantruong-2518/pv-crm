import { z } from 'zod'
import { RoleId } from '../auth'
import { ObjectCode, Moment, textInput } from '../primitives'
import { LeadTier } from './enums'

/** The activity trail — what happened to a lead or a deal, in order.
 *
 *      GET /sales/leads/:code/touches           permission `lead.view`   · scoped
 *      GET /sales/opportunities/:code/touches   permission `opportunity.view` · scoped
 *
 *  ------------------------------------------------------------------
 *  WHY A TABLE AND NOT A DERIVED VIEW
 *  ------------------------------------------------------------------
 *  Two event streams already exist and neither can answer this. `platform.audit`
 *  records who called which route — it is a security trail, keyed on an HTTP
 *  action, and it cannot say "this deal moved from Đã demo to Chờ ký" because
 *  by the time it is written the only thing left is `action: 'edit'`.
 *  `platform.email_delivery` knows every letter sent, which is one kind of
 *  contact and the only kind those tables see.
 *
 *  What a timeline needs is the BUSINESS event, phrased once, at the moment the
 *  code still holds both the before and the after. `fromUpdate` knows the deal
 *  moved columns — it computes `moved` to decide the stage clock — and that
 *  knowledge is gone one line later. So the row is written where the fact is
 *  known, not reconstructed downstream from something that survived.
 *
 *  ------------------------------------------------------------------
 *  THE KINDS ARE THE SCREEN'S KINDS, DELIBERATELY
 *  ------------------------------------------------------------------
 *  `TouchKind` began as the values of `LeadEventKind` in the frozen fixture,
 *  spelled identically, because `ActivityCard` already renders them and already
 *  decides which ones are worth a conversation turn. A server enum invented
 *  fresh here would mean a translation table on the wire's far side, and that
 *  table is where the two vocabularies drift.
 *
 *  Not every kind has a writer yet, and that is honest rather than aspirational:
 *  the branch writes what its doors actually do. `exited`/`reopened` are written
 *  by `POST /sales/leads/:code/exit` and `.../reopen` (`./lead`), the four
 *  ADR 0058 lifecycle kinds by `.../verify`, `.../nurture`, `.../resume` and
 *  the archive sweep.
 *
 *  ------------------------------------------------------------------
 *  MAIL IS NOT IN HERE
 *  ------------------------------------------------------------------
 *  `GET /sales/leads/:code/mail` already answers "how often have we written to
 *  this person", with open and click counts a touch row could not carry. Adding
 *  a `contacted` row per delivery would put the same fact in two tables that then
 *  disagree the first time a send fails after being queued — the ledger would
 *  know, the timeline would not. Two streams, two questions, one screen free to
 *  draw them side by side. */

// ---------------------------------------------------------------------------
// WHAT KIND OF THING HAPPENED
// ---------------------------------------------------------------------------

export const TouchKind = z.enum([
  /** A lead entered the book — typed, imported, or through the landing page. */
  'created',
  /** Somebody made contact — today, a meeting that is not the first one. */
  'contacted',
  /** Fields on the profile were filled in or corrected. */
  'field-filled',
  /** Ownership handed over. Names both ends in `from`/`to`. */
  'handed-over',
  /** The lead moved up a tier, after it was verified. */
  'tier-raised',
  /** The PIC's FIRST action of any kind on the lead (→ `verifying`).
   *
   *  Written by `LeadStateWriter.firstAction` itself, not by the nine doors
   *  that call it: sending mail, attaching an account and logging a comms
   *  message all move the state and none of them writes a trail of its own, so
   *  a lead whose first touch was an email had a rung with no date on it. */
  'first-action',
  /** The PIC confirmed verification and set the first tier (→ `working`). */
  'verified',
  /** The PIC parked the lead as not ready yet (→ `nurturing`). */
  'nurtured',
  /** The PIC brought a nurtured lead back (→ `working`). */
  'resumed',
  /** The system retired a lead left in `nurturing` too long (→ `archived`). */
  'archived',
  /** First meeting happened. */
  'first-meeting',
  /** A lead became an opportunity. */
  'entered-pipeline',
  /** A deal changed column. */
  'stage-changed',
  /** A contract was signed. */
  'signed',
  /** The lead left the funnel. */
  'exited',
  /** The lead came back into the funnel, after `exited`. */
  'reopened',
])

/** Which book the row hangs off. A deal and its lead keep separate trails —
 *  merging them would make "this deal moved to Chờ ký" appear on a sibling deal
 *  belonging to the same customer. */
export const TouchSubject = z.enum(['lead', 'opportunity'])

// ---------------------------------------------------------------------------
// WHO HELD IT
// ---------------------------------------------------------------------------

/** One end of a hand-over — the holder, named as they were named that day.
 *
 *  Both fields or neither, which is the same rule `touch_hand_over_sides`
 *  enforces in the table: an id with no name is a step the vector can only
 *  draw as an id, and the way out of that is a join back to `actor` — the one
 *  thing `by` exists to prevent. The name is a copy taken at write time; the
 *  id is here so the vector can mark "this step is you" without matching on a
 *  string. */
export const TouchHolder = z.object({
  actorId: z.string().min(1).max(64),
  name: textInput(120),
  /** The role they held THAT DAY — a copy, for the name's exact reason.
   *
   *  Only the RECEIVING end ever carries one: the vector draws who holds it
   *  next, and a giver is already on the chain as an earlier step wearing the
   *  role they were handed it under.
   *
   *  Absent on every row written before `0039`, and absent stays absent: the
   *  screen prints no role rather than joining `actor` for the one the person
   *  holds TODAY, which would make a March step say what somebody became in
   *  July. That is the single rule `by`, `from.name` and `to.name` all exist to
   *  keep, and one live field beside three frozen ones would break it alone. */
  role: RoleId.optional(),
})

// ---------------------------------------------------------------------------
// THE READ SHAPE
// ---------------------------------------------------------------------------

export const TouchRow = z.object({
  id: z.string().min(1),
  at: Moment,
  subjectCode: ObjectCode,
  subjectKind: TouchSubject,
  kind: TouchKind,

  /** The tier the lead stands at AFTER this step. Present on `verified` and
   *  `tier-raised` — the database refuses either without it — and optionally on
   *  `created`, for a lead that entered the book already graded.
   *
   *  `kind` alone cannot answer the question the performance screen asks:
   *  `tier-raised` says "moved up one", not "moved up to `mql`". Counting by
   *  ordinal position instead (first `tier-raised` is `mql`, second is `sql`) holds
   *  only while the trail has no gaps, no write skips a rung, and every lead
   *  starts from the same rung. None of those three is enforced anywhere — they
   *  are current habits of the code, and a count resting on habit breaks
   *  silently on the day a habit changes, in a screen nobody re-reads.
   *
   *  A row that states its own rung needs none of those conditions: one field,
   *  no window function, no assumption about the rest of the trail. */
  toTier: LeadTier.optional(),

  /** Who did it, as a name to print.
   *
   *  Stored at write time rather than joined on read, and that is the point:
   *  a timeline is a record of what was true THEN. Joining `actor` would make
   *  every historical line silently adopt the person's current name, and would
   *  make a line written by the machine impossible to render at all. `'Hệ
   *  thống'` is a legitimate value here; an actor id is not required. */
  by: textInput(120),
  actorId: z.string().min(1).max(64).optional(),

  /** The two ends of a hand-over, as DATA — who held it before, who holds it
   *  after.
   *
   *  `to` follows the convention `toTier` already set on this row: what is true
   *  AFTER this step, stated by the row itself. So `to` appears on `handed-over`, and
   *  on `created` for a lead that entered the book already assigned — a trail
   *  that begins at a holder written down rather than at one inferred.
   *
   *  An absent end is the common pool, and that is a fact rather than a hole:
   *  no `from` means it was claimed out of the pool, no `to` means it was
   *  released back into it. A `handed-over` row carries at least one of them.
   *
   *  Why columns and not the sentence in `note`, which already names the
   *  recipient: the flow vector draws one step per holder, and reading the
   *  chain out of `note` means
   *  parsing Vietnamese prose the server wrote for a person. Why on the row and
   *  not walked backwards from the next row: that walk holds only while the
   *  trail has no gaps — the same habit-shaped reasoning `toTier` exists to
   *  refuse.
   *
   *  Neither end is `by`. `by` is whoever pressed the button, and on a manager's
   *  reassignment that is a third person who neither lost nor gained the lead. */
  from: TouchHolder.optional(),
  to: TouchHolder.optional(),

  /** The sentence the screen shows. Written by the server in Vietnamese,
   *  because it is a fact addressed to the person reading the card. */
  note: textInput(500),
})

/** Not `paged()`, for the reason `LeadMailTimelineResponse` is not: a timeline
 *  that hides its own tail behind "load more" lies about how much has happened,
 *  which is the one question it exists to answer. The list is bounded by how
 *  much has actually been done to one row. */
export const TouchTimelineResponse = z.object({
  rows: z.array(TouchRow),
})

export type TouchKind = z.infer<typeof TouchKind>
export type TouchHolder = z.infer<typeof TouchHolder>
export type TouchSubject = z.infer<typeof TouchSubject>
export type TouchRow = z.infer<typeof TouchRow>
export type TouchTimelineResponse = z.infer<typeof TouchTimelineResponse>
