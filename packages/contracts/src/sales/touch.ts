import { z } from 'zod'
import { MaObject, Moc, textNhap } from '../primitives'
import { LeadTier } from './enums'

/** The activity trail — what happened to a lead or a deal, in order.
 *
 *      GET /sales/leads/:code/touches           permission `lead.xem`   · scoped
 *      GET /sales/opportunities/:code/touches   permission `cơ-hội.xem` · scoped
 *
 *  ------------------------------------------------------------------
 *  WHY A TABLE AND NOT A DERIVED VIEW
 *  ------------------------------------------------------------------
 *  Two event streams already exist and neither can answer this. `platform.audit`
 *  records who called which route — it is a security trail, keyed on an HTTP
 *  action, and it cannot say "this deal moved from Đã demo to Chờ ký" because
 *  by the time it is written the only thing left is `action: 'sửa'`.
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
 *  `TouchKind` is the same ten values as `LeadEventKind` in the frozen fixture,
 *  spelled identically, because `ActivityCard` already renders them and already
 *  decides which ones are worth a conversation turn. A server enum invented
 *  fresh here would mean a translation table on the wire's far side, and that
 *  table is where the two vocabularies drift.
 *
 *  Not every kind has a writer yet, and that is honest rather than aspirational:
 *  the branch writes what its doors actually do. `gap-lan-dau` and `giao` have
 *  no endpoint behind them today; they are in the enum because the screen draws
 *  them and because the alternative — widening the enum later — is a migration
 *  on a CHECK constraint for something already known to be coming.
 *
 *  ------------------------------------------------------------------
 *  MAIL IS NOT IN HERE
 *  ------------------------------------------------------------------
 *  `GET /sales/leads/:code/mail` already answers "how often have we written to
 *  this person", with open and click counts a touch row could not carry. Adding
 *  a `cham` row per delivery would put the same fact in two tables that then
 *  disagree the first time a send fails after being queued — the ledger would
 *  know, the timeline would not. Two streams, two questions, one screen free to
 *  draw them side by side. */

// ---------------------------------------------------------------------------
// WHAT KIND OF THING HAPPENED
// ---------------------------------------------------------------------------

export const TouchKind = z.enum([
  /** A lead entered the book — typed, imported, or through the landing page. */
  'vao-so',
  /** Somebody made contact. No door writes this yet. */
  'cham',
  /** Fields on the profile were filled in or corrected. */
  'dien-o',
  /** Ownership handed over. No door writes this yet. */
  'giao',
  /** The lead moved up a tier. */
  'len-bac',
  /** First meeting happened. No door writes this yet. */
  'gap-lan-dau',
  /** A lead became an opportunity. */
  'vao-pipeline',
  /** A deal changed column. */
  'doi-cot',
  /** A contract was signed. */
  'ky',
  /** The lead left the funnel. */
  'ra-khoi-luong',
])

/** Which book the row hangs off. A deal and its lead keep separate trails —
 *  merging them would make "this deal moved to Chờ ký" appear on a sibling deal
 *  belonging to the same customer. */
export const TouchSubject = z.enum(['lead', 'opportunity'])

// ---------------------------------------------------------------------------
// THE READ SHAPE
// ---------------------------------------------------------------------------

export const TouchRow = z.object({
  id: z.string().min(1),
  at: Moc,
  subjectCode: MaObject,
  subjectKind: TouchSubject,
  kind: TouchKind,

  /** The tier the lead stands at AFTER this step. Present on `len-bac` — the
   *  database refuses that kind without it — and optionally on `vao-so`, for a
   *  lead that entered the book already graded.
   *
   *  `kind` alone cannot answer the question the performance screen asks:
   *  `len-bac` says "moved up one", not "moved up to `mql`". Counting by
   *  ordinal position instead (first `len-bac` is `mql`, second is `sql`) holds
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
  by: textNhap(120),
  actorId: z.string().min(1).max(64).optional(),

  /** The sentence the screen shows. Written by the server in Vietnamese,
   *  because it is a fact addressed to the person reading the card. */
  note: textNhap(500),
})

/** Not `paged()`, for the reason `LeadMailTimelineResponse` is not: a timeline
 *  that hides its own tail behind "load more" lies about how much has happened,
 *  which is the one question it exists to answer. The list is bounded by how
 *  much has actually been done to one row. */
export const TouchTimelineResponse = z.object({
  rows: z.array(TouchRow),
})

export type TouchKind = z.infer<typeof TouchKind>
export type TouchSubject = z.infer<typeof TouchSubject>
export type TouchRow = z.infer<typeof TouchRow>
export type TouchTimelineResponse = z.infer<typeof TouchTimelineResponse>
