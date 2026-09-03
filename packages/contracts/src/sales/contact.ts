import { z } from 'zod'
import { PageQuery, SortDir, paged } from '../pagination'
import { MaObject, Moc, email, phoneOptional, textNhap, textNhapTuyChon } from '../primitives'
import { ContactChannel } from './enums'

/** People on the CUSTOMER'S side — the book that did not exist until now.
 *
 *      GET    /sales/leads/:code/contacts   permission `lead.xem` · scoped
 *      POST   /sales/leads/:code/contacts   permission `lead.sửa` · scoped
 *      PATCH  /sales/contacts/:code         permission `lead.sửa` · scoped
 *      DELETE /sales/contacts/:code         permission `lead.sửa` · scoped
 *      POST   /sales/contacts/:code/primary permission `lead.sửa` · scoped
 *
 *  No new permission: a contact is a part of the lead's profile, so seeing one
 *  is `lead.xem` and touching one is `lead.sửa`. Decision #6 of
 *  `docs/ban-giao-db.md` keeps the E2 matrix as it stands, and "a book of
 *  people" is not a new axis of trust — it is the same lead, described more
 *  precisely.
 *
 *  The two shapes of route are deliberate and are not an inconsistency. The
 *  list and the create hang off `:code` of the LEAD for the reason spelled out
 *  in `meeting.ts`: `@Need` is static metadata, so the scope axis has to be on
 *  the path before anything is read. The three that address ONE contact carry
 *  a `CT-…` code instead, because a contact — unlike a meeting — is a first
 *  class object with a mirror row in `platform.object` and a code a person
 *  reads out loud. The service still has to check the contact really hangs off
 *  a lead this actor may touch; the axis is resolved one hop further, and that
 *  hop is the price of the row having a name of its own.
 *
 *  ------------------------------------------------------------------
 *  WHY A TABLE AT ALL, WHEN DECISION #1 SAID NOT TO SPLIT ONE
 *  ------------------------------------------------------------------
 *  `docs/ban-giao-db.md` decision #1 is explicit: "email sits directly on
 *  `lead`, no `contact` split — one lead = one person = one mailbox". That was
 *  the right call for the shape of the data at the time, and it came with its
 *  own expiry date written into the same line: "the day one company needs
 *  several people to receive mail will be a migration". Today is that day, and
 *  two things fixed the date rather than one opinion replacing another.
 *
 *  FIRST — `sales.meeting_attendee` had to describe the customer's side with a
 *  typed-in name, because, in its own docblock, the customer side "has no book
 *  of its own to point at yet". A meeting is the place people from both sides
 *  are named together, so it is the first table that wanted a foreign key here
 *  and could not have one. Every guest row is a person we have met, sitting in
 *  a string column where nobody can ask "have we met this person before".
 *
 *  SECOND — `platform.email_suppression` is keyed on the ADDRESS, primary key
 *  `recipient`, not on a lead. The mail layer has therefore been operating at
 *  contact granularity from the day it was built: a bounce blocks a mailbox,
 *  and the lead it belonged to is not part of that fact. The schema is what is
 *  arriving late here, not the requirement.
 *
 *  The alternative considered and rejected: keep widening `sales.lead` with a
 *  `contact_2_*` group of columns. That reaches its limit at the third person,
 *  makes "which mailbox bounced" unanswerable without knowing which column set
 *  it came from, and turns every future per-person fact into five more mostly
 *  NULL columns on the busiest table in the branch.
 *
 *  ------------------------------------------------------------------
 *  `email` IS OPTIONAL HERE, AND THAT IS NOT A LOOSENING OF `lead.email`
 *  ------------------------------------------------------------------
 *  `lead.email` is `NOT NULL` (decision #4) to enforce exactly one rule: a lead
 *  with no mailbox cannot take part in the MAS mail flow, which is the main
 *  flow of the whole branch. That rule is about the LEAD, and the lead still
 *  holds it — nothing in this file relaxes that column.
 *
 *  A SECOND person at the same company is a different question. Plenty of them
 *  are known only by a phone number: the factory manager whose extension is on
 *  a business card, the buyer who only answers Zalo. Requiring a mailbox to be
 *  written down would mean inventing an address so a real person could be
 *  recorded, and an invented address in a table the mail layer reads is worse
 *  than an absent one — it is a send that goes nowhere and reports success.
 *
 *  So: the lead guarantees a mailbox exists for the mail flow; a contact row
 *  records the person as they actually are.
 *
 *  ------------------------------------------------------------------
 *  `isPrimary` IS A PROPERTY OF THE SET, NOT OF THE ROW
 *  ------------------------------------------------------------------
 *  A lead has AT MOST ONE primary contact, and that is enforced in the database
 *  by a partial unique index — `UNIQUE(lead_code) WHERE is_primary` — not by
 *  the service remembering to demote the old row first. A rule that lives in
 *  service code holds until the second writer appears; a rule that lives in an
 *  index holds against a psql session at midnight too.
 *
 *  "At least one" is the half an index CANNOT state: a lead with zero contacts
 *  is legitimate (slot 4 of the init-data gate not dug out yet), so the
 *  constraint is really "zero or one", and "the first contact written becomes
 *  primary" is a service rule by necessity.
 *
 *  Changing the primary is `POST …/primary` and NOT `PATCH { isPrimary: true }`.
 *  The operation touches TWO rows — demote the incumbent, promote this one —
 *  inside one transaction, and it fails against the partial index if attempted
 *  in the wrong order. A PATCH looks like a write to one row, which is exactly
 *  what a caller would assume and exactly what would deadlock or 409 against
 *  that index. One endpoint that means what it does, rather than a field that
 *  quietly means something else than every other field in the same object.
 *
 *  Note what follows: `ContactPatch` accepts `isPrimary` because it is
 *  `ContactCreate.partial()`, and the SERVICE must refuse it there. Stated here
 *  so the refusal reads as a decision rather than as a missing branch.
 *
 *  ------------------------------------------------------------------
 *  THE PRIMARY CONTACT IS STILL COPIED ONTO `sales.lead` — DEBT WITH A DATE
 *  ------------------------------------------------------------------
 *  For this sweep, writing a primary contact ALSO writes the five contact
 *  columns of `sales.lead` (`contact_name` · `contact_title` · `email` ·
 *  `phone` · `contact_channel`). That is two sources for one truth — the exact
 *  drift `meeting.ts` warns about with `isFirst` — and it is deliberate for two
 *  reasons that both bite at the SQL layer, not the TypeScript one.
 *
 *  `lead.required_filled` and `lead.optional_filled` are
 *  `GENERATED ALWAYS AS … STORED`, and they read `contact_title` · `phone` ·
 *  `contact_channel` directly. A generated column cannot read another table.
 *  Drop the five columns and slots 4 and 5 of the init-data gate stop being
 *  computable in the schema itself — the gate the whole intake flow is measured
 *  by would go dark, in SQL, before any code noticed. On top of that the
 *  operating rule stands: a migration may not contain `DROP`.
 *
 *  What makes the duplication survivable is that there is exactly ONE writer:
 *  the contact service writes both the contact row and the lead's five columns
 *  in a single transaction. Nothing else may write those five columns — the
 *  moment a second writer exists, the two disagree and the profile screen shows
 *  a person the contact list does not contain.
 *
 *  The day this is paid: a migration that turns `required_filled` /
 *  `optional_filled` into values maintained from the contact table, then drops
 *  the five columns. Its own migration, not this one.
 *
 *  ------------------------------------------------------------------
 *  NOTE FOR `apps/web`
 *  ------------------------------------------------------------------
 *  `LeadContact` — imported today from `@pv/engines/fixtures/das-vina` by
 *  `lead-parts.tsx`, `assign-menu.tsx`, `leads.ts`, `lead-profile.ts` — should
 *  move here and become `ContactRow`. Production screens are currently borrowing
 *  a type from a FROZEN fixture, which means the shape of real customer data is
 *  defined by demo data. Not changed in this file, because that import sweep
 *  touches four screens and belongs in its own pass. */

// ---------------------------------------------------------------------------
// THE READ SHAPE
// ---------------------------------------------------------------------------

export const ContactRow = z.object({
  /** `CT-0391` — a readable code, with a mirror row in `platform.object`. The
   *  `CT` prefix has been in `ObjectKind` from the beginning ("contact —
   *  người") and the DAS Vina fixture already mints one: `CT-0391` is the seed
   *  row of that whole scenario. So this book was named in the object graph
   *  long before it had a table. */
  code: MaObject,
  leadCode: MaObject,

  name: textNhap(120),
  /** Job title, as written the day the row was filled in. Optional — a name
   *  and a phone number is a usable contact; a title nobody asked for is not
   *  worth refusing the row over. */
  title: textNhapTuyChon(120),

  /** Optional — see the file docblock. `lead.email` keeps the `NOT NULL`
   *  guarantee the mail flow needs. */
  email: email.optional(),
  phone: phoneOptional,
  /** Which channel this person actually answers on — the same vocabulary a
   *  campaign fires through, so "reached them on X" and "sent through X" are
   *  one enum. */
  channel: ContactChannel.optional(),

  /** At most one per lead, enforced by a partial unique index. Not editable
   *  through `PATCH` — see the file docblock. */
  isPrimary: z.boolean(),

  note: textNhapTuyChon(500),

  /** Who wrote the row down, snapshotted at write time under the same rule as
   *  `TouchRow.by` and `MeetingRow.by`: a record is a record of what was true
   *  THEN. Joining `platform.actor` on read would make an old row silently
   *  adopt somebody's new name, and would render nothing at all for a person
   *  who has since left the book. */
  by: textNhap(120),

  createdAt: Moc,
  updatedAt: Moc,
})

/** Not `paged()`. The list is bounded by how many people one company has, which
 *  is a number that fits on a screen; hiding the tail behind "load more" would
 *  make "who do we know here" — the one question this list answers — answerable
 *  only by scrolling. */
export const ContactListResponse = z.object({
  rows: z.array(ContactRow),
})

// ---------------------------------------------------------------------------
// WRITING ONE
// ---------------------------------------------------------------------------

/** `name` is the only required field, and that is the whole rule: a person we
 *  cannot name is not a contact. Everything else is a slot that may not have
 *  been dug out yet, and filling one with an invented value to satisfy a schema
 *  breaks exactly what the init-data gate exists to measure. */
export const ContactCreate = z.object({
  name: textNhap(120),
  title: textNhapTuyChon(120),
  email: email.optional(),
  phone: phoneOptional,
  channel: ContactChannel.optional(),
  note: textNhapTuyChon(500),

  /** Defaulted rather than optional so the service always receives a boolean
   *  and never has to decide what `undefined` meant. `false` is the safe
   *  default: promoting a row is the two-row operation behind
   *  `POST …/primary`, and the create path should not be a second door into
   *  it. The one exception is a service rule, not a schema rule — the FIRST
   *  contact of a lead becomes primary whatever this field says, because a lead
   *  with contacts and no primary has no one to show on the profile. */
  isPrimary: z.boolean().default(false),
})

/** Every field optional EXCEPT `isPrimary`, which is not here at all.
 *
 *  Omitted rather than documented as forbidden. A bare `.partial()` keeps the
 *  field, and then "you may not promote through PATCH" is a sentence the
 *  service has to remember to enforce and a caller has to read a docblock to
 *  learn — while the type still says the write is legal. Cutting it makes the
 *  compiler answer instead: a PATCH body carrying `isPrimary` stops at the
 *  schema, and `POST /sales/contacts/:code/primary` is the only spelling left.
 *  That is the repo's rule "enforce at the type layer whatever the type layer
 *  can", applied to the one field on this object that means a two-row write.
 *
 *  So `ContactCreate` and `ContactPatch` stop being a plain `.partial()` pair.
 *  The asymmetry is the point rather than a slip: create MAY seat the first
 *  contact as primary, because there is no incumbent to demote; update never
 *  can, because by then there always is one. */
export const ContactPatch = ContactCreate.omit({ isPrimary: true }).partial()

export type ContactRow = z.infer<typeof ContactRow>
export type ContactListResponse = z.infer<typeof ContactListResponse>
export type ContactCreate = z.infer<typeof ContactCreate>
export type ContactPatch = z.infer<typeof ContactPatch>

// ---------------------------------------------------------------------------
// THE BOOK — every person we know, across every lead
// ---------------------------------------------------------------------------

/** `GET /sales/contacts` — permission `lead.xem`, scoped.
 *
 *  ------------------------------------------------------------------
 *  A SECOND SHAPE OF LIST, AND IT ANSWERS A DIFFERENT QUESTION
 *  ------------------------------------------------------------------
 *  `ContactListResponse` above is "who do we know at THIS lead" — bounded by
 *  one company, unpaged, and read on a profile that already knows the lead. This
 *  one is "have we met this person before", asked without knowing which lead
 *  they belong to. It is the question `meeting_attendee` could not ask while the
 *  customer side was a typed-in string, and it is why the contact table earned
 *  a code of its own.
 *
 *  Paged, therefore, where the other is not: this list grows with the whole
 *  book, not with one customer.
 *
 *  ------------------------------------------------------------------
 *  SCOPED THROUGH THE LEAD, NOT THROUGH THE PERSON
 *  ------------------------------------------------------------------
 *  A contact has no owner — people do not belong to sellers. What a `ownOnly`
 *  actor may see here is exactly the set of contacts hanging off leads they may
 *  see, which is the same rule `guardByContact` applies to the three
 *  single-row doors. The alternative — an unscoped people book — would hand
 *  every seller the mailbox of every customer in the department, through a
 *  screen nobody thought of as a data export.
 *
 *  This is the seam where the contact book differs from the ACCOUNT book, which
 *  is deliberately unscoped: a company is a fact about the market, a named
 *  person with a phone number is a fact about somebody's customer. */
export const ContactBookRow = ContactRow.extend({
  /** The company this person works at, carried so the book prints a name rather
   *  than a lead code. Read through `lead.account_code`; absent for a lead that
   *  has not been attached to a company yet. */
  accountCode: MaObject.optional(),
  accountName: textNhapTuyChon(200),
  /** The lead's company column, which is always present — the fallback the row
   *  prints when `accountName` is not there yet. */
  company: textNhap(200),
})

export const ContactBookResponse = paged(ContactBookRow)

export const ContactSortKey = z.enum(['name', 'company', 'createdAt'])

export const ContactBookQuery = PageQuery.extend({
  sort: ContactSortKey.default('name'),
  dir: SortDir.default('asc'),
  /** Name, mailbox or phone — one box, because somebody looking for a person
   *  types whichever of the three they remember. */
  q: z.string().trim().min(1).max(120).optional(),
  /** Only the primary contact of each lead. The switch a person flips when the
   *  question is "who do I call at each customer" rather than "who do we know". */
  primary: z.enum(['1']).optional(),
  /** Everyone at one company, by account code. */
  account: MaObject.optional(),
})

export type ContactBookRow = z.infer<typeof ContactBookRow>
export type ContactBookResponse = z.infer<typeof ContactBookResponse>
export type ContactBookQuery = z.infer<typeof ContactBookQuery>
export type ContactSortKey = z.infer<typeof ContactSortKey>
