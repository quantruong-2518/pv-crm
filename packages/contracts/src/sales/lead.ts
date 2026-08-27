import { z } from 'zod'
import {
  Dong,
  MaObject,
  Moc,
  Ngay,
  email,
  phoneOptional,
  textNhap,
  textNhapTuyChon,
} from '../primitives'
import { PageQuery, SortDir, paged } from '../pagination'
import {
  ContactChannel,
  CurrencyCode,
  ExitReason,
  IntakeChannel,
  LeadCategory,
  LeadMotion,
  LeadTier,
  StageKey,
} from './enums'
import { MOTION_BY_CHANNEL } from './lead-intake'

/** Lead book — module 2 of the Sales branch. `GET /sales/leads`.
 *
 *  This is the contract for ONE ROW OF THE BOOK, not for a whole lead profile.
 *  The twenty profile fields (`pain`, `budget`, `decision_maker`…), `history`
 *  and the conversation record belong to `GET /sales/leads/:code`: making a
 *  100-row book carry every row's full profile means shipping a few hundred KB
 *  for a table that shows eight columns.
 *
 *  ------------------------------------------------------------------
 *  THREE REQUIRED FIELDS, EVERYTHING ELSE OPTIONAL
 *  ------------------------------------------------------------------
 *  `company` · `contactName` · `email` — mirroring exactly the three `NOT NULL`
 *  columns of the table. The reason is the main flow: leads are picked from the
 *  book to be mailed through MAS, and a lead without a mailbox cannot take part
 *  in that flow.
 *
 *  Fields that used to be required and no longer are (`province`, `category`,
 *  `tier`, `source`) changed for one reason: a lead arriving through a landing
 *  page has only the three above, and the rest is what gets DUG OUT later.
 *  Requiring them in the contract forces the door to invent data to get in. */

export const LeadRow = z.object({
  code: MaObject,
  company: z.string().min(1),
  /** The contact person — the real target of every touch. */
  contactName: z.string().min(1),
  email: z.string().email(),

  /** Job title of the contact person — the "Chức danh" column of the book.
   *
   *  Present because the column is on screen today and has nowhere else to come
   *  from: it is currently drawn from `leadContact(l).title`, a deterministic
   *  generator inside the DAS Vina fixture. That works while the data is frozen
   *  and produces nothing at all against a real table, where the value lives in
   *  `lead.contact_title`. Absent means slot 4 of the init-data gate has not
   *  been dug out yet — the screen draws "—" and says so in `title`. */
  contactTitle: z.string().min(1).optional(),

  province: z.string().min(1).optional(),
  category: LeadCategory.optional(),
  tier: LeadTier.optional(),
  phone: z.string().min(1).optional(),
  contactChannel: ContactChannel.optional(),

  /** Number of REQUIRED slots dug out so far, 0…6. This is what the init-data
   *  gate looks at. Computed by the server as a generated column; nobody
   *  writes it by hand. */
  requiredFilled: z.number().int().min(0).max(6),
  /** Number of optional slots dug out, 0…4. */
  optionalFilled: z.number().int().min(0).max(4),

  // ── who holds it · three fields, three different jobs ──────────────────────
  //
  // These are NOT one value copied three times, and it is worth saying exactly
  // what each one is for, because "just send the name" is the shortcut that
  // created debt #2 in the first place:
  //
  //   ownerId    IDENTITY. The only one anything is allowed to compare, filter
  //              or store. Two people named "Nguyễn Văn Nam" are two ids.
  //   ownerName  LABEL. Human text, shown in the cell's `title` tooltip. Never
  //              a key: it changes when someone marries, and it collides.
  //   ownerEmail What the Lead PIC cell actually PRINTS, and the value people
  //              reconcile against other systems (mail, calendar, commission
  //              sheets) — all of which key on the mailbox.
  //
  // All three come out of the join the repository already performs
  // (`leftJoin(actor, eq(actor.id, lead.ownerId))`), so carrying them costs no
  // extra query — only two more columns in the SELECT list.

  /** Who is holding it. Absent = still in the common pool, nobody has taken it. */
  ownerId: z.string().min(1).optional(),
  /** Display name of the holder. LABEL — never compare against it. */
  ownerName: z.string().min(1).optional(),
  /** Company mailbox of the holder. This is what the Lead PIC column prints.
   *
   *  Needed as its own field because the screen derives it today with
   *  `staffEmail(name)`, a naming convention baked into the fixture. Against a
   *  real `platform.actor` table that derivation is a guess, and a wrong guess
   *  here is a mail sent to an address that does not exist. */
  ownerEmail: z.string().min(1).optional(),

  stage: StageKey.optional(),

  /** Days spent at the current place. NOT a column — the server computes it
   *  from `stage_since` at read time, because this number changes with the
   *  clock even when nobody touches the row. */
  daysHere: z.number().int().nonnegative(),

  /** Source code — the wire between module 1 (waves) and module 2 (leads).
   *  Absent = the lead came in directly, through no campaign; the screen must
   *  have a "no source" group. */
  source: z.string().min(1).optional(),

  /** Has this lead signed?
   *
   *  A field rather than something the screen works out, because the screen
   *  CANNOT work it out: "signed" is now `EXISTS(contract WHERE lead_code = …)`
   *  — the old `lead.contract_code` column is gone since lead → opportunity
   *  became 1-n. The book never receives the contract table, so without this
   *  field the "Trạng thái" column loses one of its four branches and every
   *  signed lead silently renders as "still running".
   *
   *  Deliberately a BOOLEAN and not the contract code: one lead can now hold
   *  several contracts, so no single code fits. See the handover note — the
   *  badge currently prints "Đã ký · HĐ-2711", and that code has no field to
   *  arrive in yet. */
  signed: z.boolean(),

  /** Warmth score, accumulated across touches. */
  score: z.number().int().nonnegative(),
  lastTouchAt: Moc.optional(),

  createdAt: Moc,
  exitReason: ExitReason.optional(),
  exitedAt: Moc.optional(),
})

// ---------------------------------------------------------------------------
// Filters — every one of them has to survive the URL
// ---------------------------------------------------------------------------

/** The four branches of the book's "Trạng thái" filter.
 *
 *  This REPLACES the old `running: Bool`, and the replacement is not cosmetic.
 *  A boolean carries two branches while the screen has four, and the two extra
 *  ones are not the negation of anything:
 *
 *      running   not exited AND not signed
 *      signed    EXISTS(contract)              <- not "NOT running"
 *      exited    exit_reason IS NOT NULL
 *      all       everything in the period
 *
 *  What the boolean actually did is worth writing down, because it is live
 *  today in `lead.repository.ts`: `running=true` returned "not exited and no
 *  contract", `running=false` returned "exited". A SIGNED lead matched NEITHER
 *  value — it was unreachable through the only filter the contract had. That is
 *  the failure mode this enum removes.
 *
 *  Default `running`, matching the screen: an exited lead is still lookup-able,
 *  because that is where the answer to "why did we lose it" lives. */
export const LeadStatus = z.enum(['running', 'signed', 'exited', 'all'])

/** Columns the book can be sorted by. A closed list on purpose: a sort key with
 *  no column behind it must die at the zod gate, not inside the query builder.
 *
 *  `company` is the only header with a sort arrow on screen today. `createdAt`
 *  is the book's natural order — the repository already sorts by it — and
 *  `daysHere` is here because it is the number the SLA warning reads. Note for
 *  whoever implements it: `daysHere` is not a column, so ordering by it means
 *  ordering by the same expression the SELECT computes, which is `stage_since`
 *  in reverse. */
export const LeadSortKey = z.enum(['company', 'createdAt', 'daysHere'])

/** The `owner` filter value meaning "nobody has taken it".
 *
 *  The screen has its own sentinel for this — `NO_OWNER` in `leads.tsx`, which
 *  is this same word behind a literal NUL character — and that one must NOT
 *  travel. A native `<select>` can only carry strings, so the NUL prefix was
 *  how it avoided colliding with a real person's name. On the wire the
 *  collision cannot happen anyway, because `owner` carries an actor `id` and no
 *  id is spelled like this; meanwhile a NUL byte in a URL is rejected by half
 *  the proxies in the world and by a Postgres `text` column outright.
 *
 *  So the screen maps its sentinel to this constant on the way out. ASCII,
 *  lowercase, unaccented, like every other identifier that leaves the process. */
export const OWNER_NONE = 'chua-ai-nhan'

/** Filters of the book. Matches exactly the query contract carried on the URL
 *  by `apps/web/src/app/url.ts` — one filter, one name, both ends.
 *
 *  (That file does not exist yet. The names below are the ones it has to adopt
 *  when it is written; this docblock is the promise, not a description of
 *  something already there.)
 *
 *  ------------------------------------------------------------------
 *  WHY EVERY CONTROL ON THE FILTER ROW IS IN HERE
 *  ------------------------------------------------------------------
 *  Today the screen filters and pages in the browser: `book.filter(...)` and
 *  then a `PAGE_SIZE` slice. Once paging moves to the server, a filter that
 *  stayed behind on the client no longer filters the book — it filters the 50
 *  rows the server happened to send for page 1. There is no partial version of
 *  this move, which is why `source`, `owner` and `account` are here even though
 *  only `stage`/`tier`/`category` were before. */
export const LeadBookQuery = PageQuery.extend({
  stage: StageKey.optional(),
  tier: LeadTier.optional(),
  category: LeadCategory.optional(),

  status: LeadStatus.default('running'),

  /** Source code, exact match. Absent = every source, including none. */
  source: z.string().min(1).max(64).optional(),

  /** Actor id of the holder, or `OWNER_NONE` for the unclaimed pile. One field
   *  for both because they are one control on screen, and because "unclaimed"
   *  is a value of the owner axis rather than a separate axis. */
  owner: z.string().min(1).max(64).optional(),

  /** Account filter — exact company name, from the "Account" select.
   *
   *  Distinct from `q`: `q` is a substring search the user types, this is a
   *  pick from a closed list. Matching on the NAME is a known weakness that
   *  travels with the current data model — the day accounts become rows with
   *  codes of their own, this becomes `accountCode` and stops being sensitive
   *  to how somebody spelled the company. */
  account: z.string().min(1).max(200).optional(),

  q: z.string().trim().min(1).max(120).optional(),

  /** Default order is the book's own: newest first. That is both what the
   *  screen shows when no header is active and what the repository already
   *  does, so turning sorting on changes nothing until the user asks.
   *
   *  Implementation note that belongs in the contract because it is a
   *  correctness issue and not a detail: sorting by `company` produces ties,
   *  and ties make paging unstable — the same row can appear on page 1 and
   *  page 2, or on neither. The server has to append `code` as a final
   *  tiebreaker on every sort. */
  sort: LeadSortKey.default('createdAt'),
  dir: SortDir.default('desc'),
})

export const LeadBookResponse = paged(LeadRow)

// ---------------------------------------------------------------------------
// One whole lead — `GET /sales/leads/:code`
// ---------------------------------------------------------------------------

/** The profile of ONE lead. `GET /sales/leads/:code`.
 *
 *  ------------------------------------------------------------------
 *  AN EXTENSION OF `LeadRow`, NOT A SECOND SHAPE OF THE SAME TABLE
 *  ------------------------------------------------------------------
 *  `.extend()` rather than a fresh `z.object`, and that IS the design of this
 *  schema. The book row and the profile describe one table, so everything they
 *  share — `code`, `company`, `email`, `signed`, `daysHere`, the three owner
 *  fields, the two slot counters — is declared exactly once, above, and cannot
 *  drift here. A hand-written twin agrees on the day it is written and stops
 *  agreeing the first time somebody adds a column to only one of them; the
 *  screen then prints one value in the book and another on the profile of the
 *  same lead, and neither is wrong enough for anyone to notice.
 *
 *  The server holds the same line: `toProfile` in `lead.mapper.ts` CALLS
 *  `toContract` and adds to it, rather than mapping the row a second time.
 *
 *  ------------------------------------------------------------------
 *  WHAT THIS ADDS — THE COLUMNS THE BOOK DELIBERATELY LEAVES BEHIND
 *  ------------------------------------------------------------------
 *  Four groups, and they are the table's own groups (`lead.schema.ts`): who
 *  the company is, what it wants solved, who else is credited on it, and which
 *  door it came through. A 100-row book carrying all of them ships a few
 *  hundred KB for a table that shows eight columns — the reason stated at the
 *  top of `LeadRow`, and the reason these live here.
 *
 *  ------------------------------------------------------------------
 *  WHAT IS NOT HERE, AND WHY EACH ABSENCE IS AN ANSWER
 *  ------------------------------------------------------------------
 *   · `dealCode` / `contractCode` — the frozen fixture profile carries both;
 *     the table carries neither. Lead -> opportunity became 1-n, so no single
 *     column can name "the" deal or "the" contract. `signed`, inherited from
 *     `LeadRow`, is the boolean that survived that change. The codes come back
 *     the day the profile carries a LIST of opportunities, which is another
 *     query and another contract, not a field added here.
 *   · touches, the conversation record, `history` — `sales.touch` does not
 *     exist yet, which is also why `score` is `0` and `lastTouchAt` is absent
 *     on every row in the book today.
 *   · `stageSince` — the timestamp `daysHere` is computed from, and `daysHere`
 *     is already inherited. Two spellings of one fact is how the two start to
 *     disagree.
 *
 *  NAME COLLISION, on purpose: `@pv/engines/fixtures/das-vina` exports a type
 *  also called `LeadProfile` — the frozen shape the detail screen reads today,
 *  built by a deterministic generator. This one describes the real table. A
 *  file importing both gets a compile error instead of a silent pick, and that
 *  error is the right moment to delete the other one. */
export const LeadProfile = LeadRow.extend({
  // ── info · who the customer is ────────────────────── slots 1 · 2 · 3 ────
  //
  // `province` and `category` are NOT repeated here: the book already carries
  // them, because both are known the moment a lead enters the book rather than
  // dug out of a conversation later.

  /** The name on the paperwork, which is not the name the book calls them. */
  legalName: z.string().min(1).optional(),
  /** Free text, matching the column: 10 digits, or 13 with a branch suffix. */
  taxCode: z.string().min(1).optional(),
  address: z.string().min(1).optional(),
  mainProduct: z.string().min(1).optional(),

  /** Headcount and plants — `nonnegative`, not `positive`, and the difference
   *  is deliberate. `LeadCreate` narrows both to `positive()` because a person
   *  typing "0 employees" is typing a mistake. This is the READ side: it has
   *  to describe every value the `integer` column can legally hold, including
   *  the `0` that an imported file can carry, or a row already in the table
   *  fails its own response contract and the profile answers 500 for a lead
   *  the book lists happily. */
  headcount: z.number().int().nonnegative().optional(),
  plants: z.number().int().nonnegative().optional(),

  // ── need · what the customer wants solved ─────────── slots 6…10 ─────────

  /** Slot 6 — the most valuable sentence in the whole profile. */
  pain: z.string().min(1).optional(),
  currentStack: z.string().min(1).optional(),
  decisionMaker: z.string().min(1).optional(),
  approver: z.string().min(1).optional(),
  /** The budget the CUSTOMER named, not the price we quoted. Travels with its
   *  unit or not at all — `CHECK lead_money_pair` guarantees the pair, so a
   *  profile can never show a number whose currency nobody knows. */
  budget: Dong.optional(),
  currency: CurrencyCode.optional(),
  deadline: Ngay.optional(),

  // ── credit · the two holders that are NOT the scope axis ─────────────────
  //
  // Three id/name/email triples now, all built the same way and for the same
  // three reasons `ownerId` · `ownerName` · `ownerEmail` are spelled out above:
  // the id is the only thing anything may compare, the name is a label that
  // changes and collides, the mailbox is what a person reconciles against mail
  // and commission sheets. All six extra values come out of two more
  // `leftJoin(actor, …)` in the query the profile already runs — two more
  // joins, no extra round trip.
  //
  // Only `ownerId` is the scope axis. These two record CREDIT — BD is named
  // when BD put a hand on the lead, marketing when the campaign brought it —
  // and `CREDIT_RULES` reads them for commission. A Sale who owns nothing here
  // but appears as `bdOwnerId` still does not see the lead, and that is the
  // intended answer: credit is not custody.

  bdOwnerId: z.string().min(1).optional(),
  bdOwnerName: z.string().min(1).optional(),
  bdOwnerEmail: z.string().min(1).optional(),

  marketingOwnerId: z.string().min(1).optional(),
  marketingOwnerName: z.string().min(1).optional(),
  marketingOwnerEmail: z.string().min(1).optional(),

  // ── intake · which door, and who moved first ─────────────────────────────
  //
  // Two axes, never one (`./lead-intake` has the long argument). Both are
  // nullable in the table and stay optional here: the 100 frozen fixture rows
  // predate the idea of an intake door entirely, so inventing a value for them
  // would put made-up data on the Performance screen.

  /** Which door the row came through. The system writes it, nobody types it —
   *  which is what makes `CHANNEL_TRUST` worth reading: trust is DERIVED from
   *  this, and a trust level the client asserted about itself is worth nothing. */
  intakeChannel: IntakeChannel.optional(),
  /** Who made the first move. Stored `UPPER_SNAKE`, same spelling on the wire;
   *  `@pv/engines` still spells the same six values in lower case, and
   *  `lead.mapper.ts` is the ONE place the two forms are allowed to meet. */
  motion: LeadMotion.optional(),
})

// ---------------------------------------------------------------------------
// Creating one lead by hand
// ---------------------------------------------------------------------------

/** `POST /sales/leads` — one lead, typed by a person, one field at a time.
 *
 *  ------------------------------------------------------------------
 *  EVERY FIELD HERE NORMALISES, IT DOES NOT ONLY CHECK
 *  ------------------------------------------------------------------
 *  The text fields go through `textNhap` / `textNhapTuyChon`, the mailbox
 *  through `email`, the phone through `phoneOptional` (see `../primitives`).
 *  What reaches the service is already trimmed, already collapsed, already
 *  lowercased where it has to be, and `''` has already become `undefined`.
 *
 *  That last conversion is the one that matters most here: the table has
 *  exactly one spelling for "empty", which is `NULL`, and `CHECK lead_no_blank`
 *  enforces it across fifteen columns. An HTML form submits `''` for every
 *  field the user left alone. A contract that only validates hands those `''`
 *  straight to the CHECK, which answers with a constraint violation — a 500
 *  that names a constraint instead of a 400 that names a field.
 *
 *  ------------------------------------------------------------------
 *  WHAT THIS DELIBERATELY DOES NOT ACCEPT
 *  ------------------------------------------------------------------
 *   · `code` — the server mints it. Letting the caller choose the primary key
 *     means one typo can overwrite another lead.
 *   · `requiredFilled` / `optionalFilled` — generated columns. They are counted
 *     FROM the fields above; accepting them is offering a way for the count to
 *     disagree with the data it counts.
 *   · `score`, `stageSince`, `createdAt`, `lastTouchAt` — the system's own
 *     bookkeeping.
 *   · `tier` and `stage` — deliberately withheld, same rule the file importer
 *     already applies (`tierOfRow` caps an imported row at MQL). SQL means the
 *     init-data gate has been passed AND somebody opened an opportunity; a lead
 *     that has just been typed has passed neither, and a client that can name
 *     its own tier can claim a gate it never went through.
 *   · `exitReason` / `exitedAt` — a lead cannot be born already lost, and
 *     `CHECK lead_exit_pair` would be the one to say so.
 *   · `intakeChannel` — the system records the door, nobody types it. For this
 *     endpoint the door is `tay`, which is why `motion` is narrowed below. */
export const LeadCreate = z
  .object({
    // ── the three required ones · exactly the three NOT NULL columns ─────────
    company: textNhap(200),
    contactName: textNhap(120),
    email,

    // ── info · who the customer is ────────────────────── slots 1 · 2 · 3 ────
    legalName: textNhapTuyChon(200),
    /** Tax code. Left as free text here because the column is `text` and the
     *  shape varies (10 digits, or 13 with a branch suffix). Worth knowing: the
     *  importer's dedupe key strips it down to digits, so two spellings of one
     *  code are one key there and two values in the column. */
    taxCode: textNhapTuyChon(20),
    address: textNhapTuyChon(255),
    province: textNhapTuyChon(64),
    category: LeadCategory.optional(),
    mainProduct: textNhapTuyChon(200),
    headcount: z.number().int().positive().max(1_000_000).optional(),
    plants: z.number().int().positive().max(1_000).optional(),

    // ── contact · who we talk to ──────────────────────── slots 4 · 5 ────────
    contactTitle: textNhapTuyChon(120),
    phone: phoneOptional,
    contactChannel: ContactChannel.optional(),

    // ── need · what the customer wants solved ─────────── slots 6…10 ─────────
    pain: textNhapTuyChon(1_000),
    currentStack: textNhapTuyChon(500),
    decisionMaker: textNhapTuyChon(120),
    approver: textNhapTuyChon(120),
    /** The budget the CUSTOMER named, not the price we quoted. */
    budget: Dong.optional(),
    currency: CurrencyCode.optional(),
    deadline: Ngay.optional(),

    // ── owner · actor ids, never names ───────────────────────────────────────
    ownerId: textNhapTuyChon(64),
    bdOwnerId: textNhapTuyChon(64),
    marketingOwnerId: textNhapTuyChon(64),

    // ── where it came from ───────────────────────────────────────────────────
    /** Narrowed to the motions the `MANUAL` door can carry, so `EVENT` is
     *  refused here: an event arrives as a LIST, and a hand-typed row claiming
     *  to be an event lead is a row nobody can trace back to an event.
     *
     *  See the handover — the brief asked for all six, `MOTION_BY_CHANNEL` says
     *  five, and this follows the table rather than quietly widening it. */
    motion: z.enum(MOTION_BY_CHANNEL.MANUAL),
    /** Optional: a lead typed in directly belongs to no campaign, and inventing
     *  a source code to fill the field creates a source that is in no source
     *  book. */
    source: textNhapTuyChon(64),
  })
  .refine((v) => (v.budget === undefined) === (v.currency === undefined), {
    /* Money always carries its unit. Enforced here rather than left to
       `CHECK lead_money_pair`, because the CHECK can only produce a 500 naming
       a constraint — while this produces a 400 pointing at the currency control
       the user forgot to touch. `250000000` with no unit is a number that
       cannot be added to the row next to it. */
    message: 'Có ngân sách thì phải chọn đơn vị tiền, và ngược lại',
    path: ['currency'],
  })

/** What `POST /sales/leads` answers with: the row as the book would show it.
 *
 *  The full row rather than just the new code, so the screen can insert it
 *  without a second round trip — and so the caller immediately sees the values
 *  as NORMALISED, which is the only way to notice that what was typed and what
 *  was stored are not always the same string. */
export const LeadCreateResponse = LeadRow

export type LeadRow = z.infer<typeof LeadRow>
export type LeadStatus = z.infer<typeof LeadStatus>
export type LeadSortKey = z.infer<typeof LeadSortKey>
export type LeadBookQuery = z.infer<typeof LeadBookQuery>
export type LeadBookResponse = z.infer<typeof LeadBookResponse>
export type LeadProfile = z.infer<typeof LeadProfile>
export type LeadCreate = z.infer<typeof LeadCreate>
export type LeadCreateResponse = z.infer<typeof LeadCreateResponse>
