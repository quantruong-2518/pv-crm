import { z } from 'zod'
import { ObjectChainLink, PipelinePositionView } from '../position'
import { PageQuery, SortDir, paged } from '../pagination'
import {
  MoneyVnd,
  ContractCode,
  ObjectCode,
  Moment,
  Day,
  textInput,
  textInputOptional,
} from '../primitives'
import { ConfigCode } from './config'
import { CurrencyCode, OpportunityStatus, StageKey } from './enums'

/** Module 3 · Cơ hội — the wire shape of the Ops book.
 *
 *      POST   /sales/opportunities              · PATCH /sales/opportunities/:code
 *      GET    /sales/opportunities[/:code]      · GET   …/scorecard · …/histogram
 *      POST   …/:code/milestones · …/:code/care · …/:code/reactivate
 *
 *  ------------------------------------------------------------------
 *  NO WRITE BODY CARRIES `state` OR `stage` (ADR 0064)
 *  ------------------------------------------------------------------
 *  One axis, one writer. `stage` follows facts the server can see — the PIC set
 *  for `assigned`, a recorded milestone for the last three — and `state` follows
 *  the care door. `won` is not stored anywhere: it is the existence of a row in
 *  `sales.contract`, folded in on read. So a seller picks neither, which is why
 *  the milestone/care/reactivate doors below exist and `PATCH /:code/stage` no
 *  longer does: a drag gesture cannot be what advances a deal.
 *
 *  ------------------------------------------------------------------
 *  OWNERS ARE A LIST, AND THE LIST HAS TWO ROLES
 *  ------------------------------------------------------------------
 *  `saleOwners` closes the deal, `bdOwners` opened the door, and commission
 *  splits along that seam — which is why they are two fields rather than one
 *  array with a flag. Both carry actor IDS, never display names: a name gets
 *  renamed, an id does not.
 *
 *  ------------------------------------------------------------------
 *  ATTACHMENTS TRAVEL AS METADATA, NOT AS BYTES
 *  ------------------------------------------------------------------
 *  `{ name, size }` and nothing else. There is no upload endpoint yet and this
 *  contract does not pretend there is one; the day bytes arrive, this grows an
 *  id pointing at wherever they landed and the two fields below stay put. */

// ---------------------------------------------------------------------------
// STATES
// ---------------------------------------------------------------------------

/** Whether the deal is still on the board. The two values a COLUMN may hold —
 *  `won` is absent because no column spells it. Derived from `OpportunityStatus`
 *  (`./enums`) rather than retyped, so the stored half and the read half cannot
 *  drift apart by a letter. */
export const OpportunityState = OpportunityStatus.exclude(['won'])

/** Which half of the deal a person is on. UPPER_SNAKE — the naming law for
 *  enum VALUES here, same as `LeadSourceKind`. */
export const OpportunityOwnerRole = z.enum(['SALE', 'BD'])

// ---------------------------------------------------------------------------
// PARTS
// ---------------------------------------------------------------------------

/** One attached file, as far as the server is concerned today.
 *
 *  `size` is capped so a hand-written body cannot park an absurd number in a
 *  column that something will eventually sum. */
export const OpportunityFile = z.object({
  name: textInput(255),
  size: z
    .number('Cỡ tệp là bắt buộc')
    .int()
    .nonnegative()
    .max(256 * 1024 * 1024, 'Tệp quá lớn'),
})

/** At most this many files on one deal. A bound rather than a hope: the column
 *  is `jsonb`, and an unbounded array inside a row is a row that grows past
 *  what every read of the book expects to carry. */
export const OPPORTUNITY_FILES_MAX = 20

/** The length caps of the deal form and the care door, named and EXPORTED
 *  rather than left as literals in the shapes below.
 *
 *  The form that fills this contract in has to stop the typist at the same
 *  number, and a `maxLength={200}` copied by hand into a screen is a number
 *  with no way of hearing that the contract moved. `MEETING_TITLE_MAX` next
 *  door already works this way; these follow it.
 *
 *  What they are NOT is validation moving to the browser. The refusal still
 *  lives here, on the server side of the wire; these only let the box refuse
 *  the 201st character before the request rather than after it. */
export const OPPORTUNITY_NAME_MAX = 200
export const OPPORTUNITY_DESCRIPTION_MAX = 2_000
export const OPPORTUNITY_CARE_REASON_MAX = 120
export const OPPORTUNITY_CARE_NOTE_MAX = 1_000
/** The one care reason key with a rule attached: picking it demands a note.
 *  Declared here so the form and the door test the same string. */
export const OPPORTUNITY_CARE_REASON_OTHER = 'other'
/** A deal asking about more than a dozen product lines is a deal nobody has
 *  qualified yet. The cap is generous rather than tight because refusing a
 *  legitimate form is worse than storing one that is too broad — it exists to
 *  stop a script, not to argue with a seller. */
export const OPPORTUNITY_PRODUCTS_MAX = 12
export const OPPORTUNITY_STAGE_NOTE_MAX = 500

/** Actor ids on one side of a deal. Deduped, so the join table is never handed
 *  the same pair twice and never dies on its own primary key. */
const ownerIds = z
  .array(textInput(64))
  .max(20, 'Tối đa 20 người')
  .transform((ids) => [...new Set(ids)])

// ---------------------------------------------------------------------------
// THE TWO WRITE DOORS
// ---------------------------------------------------------------------------

/** The fields a person fills in, on EITHER door.
 *
 *  One object literal shared by create and update, because the promote form and
 *  the opportunity profile are the same form in two places — that is already
 *  true at the component layer (`components/ops-fields.tsx`), and a contract
 *  that spelled the eleven fields twice would be the place the two forms first
 *  drift apart. */
const dealFields = {
  name: textInput(OPPORTUNITY_NAME_MAX),

  expectedClose: Day,

  /** Money always travels with its unit — both required together, unlike the
   *  lead's budget where the customer may simply not have named one. A deal
   *  being opened without a value is a deal nobody can forecast. */
  amount: MoneyVnd,
  currency: CurrencyCode,

  saleOwners: ownerIds,
  bdOwners: ownerIds.optional().default([]),

  /** How likely the seller thinks this is to close, 0–100.
   *
   *  OPTIONAL, and the absence has to stay tellable from a zero. "Nobody has
   *  judged this yet" and "this is not happening" are opposite facts about a
   *  deal, and the weighted forecast treats them oppositely: the first is
   *  excluded from the estimate, the second drags it down. A `.default(0)` here
   *  would erase that distinction at the door, before any screen could show it.
   *
   *  Not derived from `state` or `stage` — the schema's docblock says why the
   *  per-column percentage was rejected, and why storing both a derived default
   *  and an override would make the forecast depend on which one a screen read. */
  probability: z.number().int().min(0).max(100).optional(),

  /** What the customer is asking about — ids from the `PRODUCT` catalog.
   *
   *  `ConfigCode`, not free text and not `z.string()`: the ids go into
   *  `sales.opportunity_product`, whose composite foreign key refuses anything
   *  that is not a live catalog row. Typing the wire the same way means a bad
   *  id is refused at the door with a field name on it, rather than at the
   *  database with a constraint name on it.
   *
   *  Deduplicated rather than refused on repeat, exactly like `ownerIds` above:
   *  the same chip clicked twice is a slip of the hand, not a request the
   *  server should reject a whole form over. */
  products: z
    .array(ConfigCode)
    .max(OPPORTUNITY_PRODUCTS_MAX, `Tối đa ${OPPORTUNITY_PRODUCTS_MAX} sản phẩm`)
    .optional()
    .default([])
    .transform((ids) => [...new Set(ids)]),

  description: textInputOptional(OPPORTUNITY_DESCRIPTION_MAX),
  attachments: z.array(OpportunityFile).max(OPPORTUNITY_FILES_MAX).optional().default([]),
}

/* The "must have a sale owner" rule repeats on both doors, on purpose: zod 4
   won't let a `.refine` attach to an object literal and still spread it.
   Sharing the FIELDS and copying the one-line RULE is the right trade. */

/** `POST /sales/opportunities` — promote a lead into an opportunity.
 *
 *  `code` is absent: the only legal source is the server's sequence. A body
 *  that could name its own code could land on somebody else's deal, and two
 *  people with the promote form open would mint the same number.
 *
 *  `state` and `stage` are absent for a different one: a new deal opens at
 *  `new`, or at `assigned` when the PIC set already qualifies — the server reads
 *  that off `saleOwners`/`bdOwners`, so a body naming a stage could only
 *  contradict it. */
export const OpportunityCreate = z
  .object({
    /** The lead this deal came out of. One lead may produce many. */
    leadCode: ObjectCode,
    /** The account object in E1's graph, when the lead already has one. */
    accountCode: ObjectCode.optional(),
    ...dealFields,
  })
  .refine((v) => v.saleOwners.length > 0, {
    error: 'Phải có ít nhất một Sale đứng đơn',
    path: ['saleOwners'],
  })

/** `PATCH /sales/opportunities/:code` — the opportunity profile's save button.
 *
 *  ------------------------------------------------------------------
 *  THE WHOLE EDITABLE SET, NOT THE CHANGED FIELDS
 *  ------------------------------------------------------------------
 *  The screen knows which cells are dirty and says so on the button ("Lưu 3 ô
 *  đã sửa"), but it sends the whole editable set. Sending the whole form makes
 *  the body self-describing, so "is this a legal deal" is answered by looking at
 *  the body alone rather than against a row read one query ago.
 *
 *  What is NOT here is as load-bearing as what is: `leadCode` and `accountCode`
 *  cannot be edited — a deal does not move to another customer, and a request
 *  that could move it is a request that can rewrite somebody's pipeline by
 *  typo. `code` is not editable for the same reason it is not creatable, and
 *  `state`/`stage` are not editable at all — see the top of this file. */
export const OpportunityUpdate = z
  .object({ ...dealFields })
  .refine((v) => v.saleOwners.length > 0, {
    error: 'Phải có ít nhất một Sale đứng đơn',
    path: ['saleOwners'],
  })

// ---------------------------------------------------------------------------
// THE READ SHAPE
// ---------------------------------------------------------------------------

/** One person on a deal, as the book prints them.
 *
 *  Carries the display name beside the id for the same reason `LeadRow` carries
 *  the owner's mailbox: a screen renders people, and nothing downstream should
 *  need a second call to turn an id into a human being. */
/** One product line a deal is asking about, as the book prints it.
 *
 *  Two fields and no more: the catalog row also carries `ord` and `active`, and
 *  neither belongs on a deal. A deal that named a product line last quarter
 *  keeps naming it after the line is switched off — that is the whole point of
 *  `active: false` being the only form of deletion — so shipping the flag here
 *  would invite a screen to hide a chip describing a real historical fact. */
export const OpportunityProduct = z.object({
  id: ConfigCode,
  name: textInput(120),
})

export const OpportunityOwner = z.object({
  id: textInput(64),
  name: textInput(120),
  role: OpportunityOwnerRole,
})

/** One row of the Ops book. */
export const OpportunityRow = z.object({
  code: ObjectCode,
  leadCode: ObjectCode,
  /** The customer, carried so the book need not join the lead book to print a
   *  name. `accountCode` is present only when E1 has an account object. */
  account: textInput(200),
  accountCode: ObjectCode.optional(),

  name: textInput(200),
  /** The READ vocabulary — `open` · `care` · `won`. The first two are the
   *  column; `won` is resolved from the existence of a `sales.contract` row, in
   *  the one mapper that folds it in. */
  state: OpportunityStatus,
  /** The number on the paper that made `state` read `won`.
   *
   *  Present ONLY on a signed deal, and absent — not `''` — on every other one.
   *  The two facts are one fact: `won` IS the existence of a row in
   *  `sales.contract`, so a row carrying `won` without a number, or a number
   *  without `won`, would be the server disagreeing with itself.
   *
   *  `ContractCode`, not `ObjectCode`: `Đ` is not in `A-Z`. The primitive lives in
   *  `primitives.ts` and its docblock says why it cannot be reused from
   *  `./contract` — that module imports this one. */
  contractCode: ContractCode.optional(),
  /** Which of the five columns the deal stands in. `null` = it has left the
   *  board — won, or parked in `care`, where `careFromStage` remembers the
   *  column it will come back to. */
  stage: StageKey.nullable(),
  /** Days the deal has stood in its CURRENT column, counted server-side.
   *
   *  A number, not a flag: "is it rotting" needs a per-column limit, and those
   *  limits are a `sales.config_entry` row the screen already holds. The server
   *  sends the fact, the screen applies the rule it can see. `null` when the
   *  deal has left the board — a closed deal stands in no column, so there is
   *  no clock to read. */
  daysInStage: z.number().int().nonnegative().nullable(),

  /** Nullable, and only in the READ shape: the create door requires a date, but
   *  the deals the frozen book already carries were closed before anybody was
   *  asked for one, and backfilling them means inventing a date per row. */
  expectedClose: Day.nullable(),
  amount: MoneyVnd.nullable(),
  currency: CurrencyCode.nullable(),

  /** Nullable in the READ shape while optional in the write shape, and the two
   *  spellings mean the same thing: nobody has judged this deal. `null` on the
   *  wire rather than an absent key because every deal in the book has an
   *  answer to "how likely is this", even when the answer is "unknown" — a
   *  missing key would make the book's rows a different shape from each other. */
  probability: z.number().int().min(0).max(100).nullable(),

  /** What the customer is asking about, carrying the LABEL beside the id for
   *  the same reason `OpportunityOwner` carries a name: a screen renders chips,
   *  and nothing downstream should need a second call to turn 'PD-02' into a
   *  readable product name. */
  products: z.array(OpportunityProduct),

  owners: z.array(OpportunityOwner),

  description: z.string().optional(),
  attachments: z.array(OpportunityFile),

  /** The three care facts, present exactly when `state === 'care'`.
   *  `careFromStage` is the column `POST /:code/reactivate` puts the deal back
   *  into — stored rather than re-derived from the stage history, which a
   *  re-entered deal would answer wrongly. `careReason` is a catalogue KEY
   *  (`sales.config_entry`), never its Vietnamese label. */
  careFromStage: StageKey.optional(),
  careReason: z.string().optional(),
  careNote: z.string().optional(),

  createdAt: Moment,
  closedAt: Moment.nullable(),
})

// ---------------------------------------------------------------------------
// ASKING THE BOOK A NARROWER QUESTION
// ---------------------------------------------------------------------------

/** Columns the book can be sorted by. A closed list for the same reason
 *  `LeadSortKey` is one: a sort key with no column behind it must die at the
 *  zod gate, not inside the query builder.
 *
 *  `amount` is the one that is NOT a column. Ordering by the raw number would
 *  file a 5,000 USD deal below a 10,000,000 VND one, so the server orders by
 *  the amount CONVERTED TO DONG, using the rate table in `./currency` — the
 *  same table the screen converts with. Two sums of one pipeline have to come
 *  from one rate table or the page disagrees with itself.
 *
 *  `stage` is deliberately not a key: the five columns are an ORDER the screen
 *  already knows how to draw, and "sort by stage" is the board, not the book. */
export const OpportunitySortKey = z.enum([
  'name',
  'account',
  'amount',
  'expectedClose',
  'createdAt',
])

/** What `GET /sales/opportunities` accepts. Paging, filtering, sorting — all of
 *  it, and all of it on the server.
 *
 *  ------------------------------------------------------------------
 *  WHY EVERY CONTROL ON THE FILTER ROW IS IN HERE
 *  ------------------------------------------------------------------
 *  Same move `LeadBookQuery` made, and forced by the same arithmetic: the Ops
 *  screen used to pull `size=200` and then filter, sort and page in the browser,
 *  which means it stopped telling the truth at row 201 — silently, with a page
 *  that still looked complete. A filter left behind on the client no longer
 *  filters the book; it filters whatever the server happened to send for page 1.
 *  There is no partial version of this move, which is why the whole filter row
 *  landed here in one go rather than a field at a time.
 *
 *  `leadCode` is the one that predates the move, and it is here for a narrower
 *  reason worth keeping written down: the lead profile has to answer "has this
 *  customer already been promoted?" before it offers the button that promotes
 *  them, and it once answered by looking the lead up in a frozen fixture array.
 *  A lead created after that array was written always came back "no", so the
 *  button stayed lit and a second deal opened for a customer who already had
 *  one. A filter on the book rather than a field on `LeadProfile`, because one
 *  lead may hold several deals — the answer is a LIST.
 *
 *  Absent = no filter, the convention every optional filter on `LeadBookQuery`
 *  follows. */
export const OpportunityBookQuery = PageQuery.extend({
  leadCode: ObjectCode.optional(),

  /** The READ vocabulary, so `won` filters too — the server resolves it the way
   *  every read path does, by the existence of a `sales.contract` row, because
   *  no column spells it. */
  state: OpportunityStatus.optional(),

  /** Actor id of a Sale on the deal, or `OWNER_NONE` for "nobody is closing it
   *  yet". Two fields rather than one `owner`, unlike the lead book: the two
   *  roles are two selects on screen because commission splits along that seam,
   *  and a single owner filter could not answer "which deals has this BD opened
   *  that somebody else is now closing" — the question the split exists for. */
  sale: z.string().min(1).max(64).optional(),
  /** Actor id of a BD on the deal, or `OWNER_NONE` for "no BD recorded". */
  bd: z.string().min(1).max(64).optional(),

  /** Account filter — exact company name, from the "Account" select. Distinct
   *  from `q`: `q` is a substring the user types, this is a pick from a closed
   *  list. Matching on the NAME carries the same known weakness `LeadBookQuery`
   *  records, and it is paid off in the same sweep — the day accounts are rows
   *  with codes of their own. */
  account: z.string().min(1).max(200).optional(),

  /** Free text, matched against the deal name, the deal code and the customer.
   *  Three fields rather than one because the box above the book is one box and
   *  people type all three into it — a deal code out of an email, half a
   *  company name, the word "MES". */
  q: z.string().trim().min(1).max(120).optional(),

  /** Default order is the book's own: newest first. That is both what the
   *  screen shows when no header is active and what the repository already did,
   *  so turning sorting on changes nothing until the user asks.
   *
   *  Two implementation notes that belong in the contract because they are
   *  correctness issues, not details:
   *
   *   · `code` is appended as a final tiebreaker on EVERY sort. Ties make paging
   *     unstable — the same row lands on page 1 and page 2, or on neither.
   *   · `amount` and `expectedClose` are nullable, and their blanks sort LAST in
   *     BOTH directions. A deal nobody has priced is not the cheapest one, and a
   *     deal with no close date is not the nearest one; Postgres' default
   *     (`NULLS FIRST` on `DESC`) would say both. */
  sort: OpportunitySortKey.default('createdAt'),
  dir: SortDir.default('desc'),
})

/** The book page — and since 14/09 every row carries its POSITION.
 *
 *  ------------------------------------------------------------------
 *  THE DAY A SCREEN ASKED
 *  ------------------------------------------------------------------
 *  This shape used to end at `OpportunityRow`, and the note on the profile
 *  response said the book would get a position "the day a screen asks". It
 *  asked: the book grid was judging lateness with `isRottingOp`, which read
 *  `STAGE_LIMIT` — a `Map` built from the frozen fixture — while the profile
 *  one click away judged the same deal by the limits somebody can actually edit
 *  on the configuration screen. Two answers to one question, on two screens
 *  showing the same row.
 *
 *  The cost the old note worried about does not appear, because the reads are
 *  PER PAGE and not per row: the ladder is one query the book already made for
 *  its own histogram, and the open approvals are one `IN (…)`
 *  (`ApprovalService.pendingOnMany`). Two queries for a page of up to 200.
 *
 *  `null` on a row means the deal stands in no column — a won deal and a
 *  cared-for one have both left the board — which is rule 1 of §2 answered
 *  honestly rather than defaulted away. */
export const OpportunityBookRow = OpportunityRow.extend({
  position: PipelinePositionView.nullable(),
})

export const OpportunityBookResponse = paged(OpportunityBookRow)

/** The `contract-sign` request waiting on this deal. Required-nullable: `null`
 *  means none, never "not checked", so the screen can disable signing on one read. */
export const PendingSign = z.object({
  approvalId: z.string().min(1),
  raisedBy: textInput(120),
  raisedAt: Moment,
})

/** `GET /sales/opportunities/:code` — the book row, plus where the deal stands.
 *
 *  The same extension the book row now carries, kept as its own name because
 *  the two doors are free to diverge and a shared alias would hide the day they
 *  do. */
export const OpportunityProfileResponse = OpportunityRow.extend({
  position: PipelinePositionView.nullable(),
  pendingSign: PendingSign.nullable(),

  /** The object chain this deal sits in — see `ObjectChainLink`.
   *
   *  The deal already holds `leadCode` and `contractCode`, so a screen COULD
   *  assemble a chain itself — and that is exactly what rule 10 forbids, for
   *  the reason the rail exists: two screens each building their own chain draw
   *  two different pictures of one record the day a link is added. The graph
   *  answers once, permission-cut, for both profiles. */
  chain: z.array(ObjectChainLink),
})

export const OpportunityCreateResponse = OpportunityRow

/** Cả hai cửa ghi trả về NGUYÊN dòng sổ, cùng một hình với lượt đọc.
 *
 *  Không phải `{ok: true}`: màn vừa sửa xong cần biết máy chủ đã chuẩn hoá
 *  thành cái gì — dòng đang đứng ở cột nào, `closed_at` có được đặt không,
 *  tên người đứng đơn đọc ra sao. Trả một cờ rồi bắt màn gọi lần thứ hai là
 *  hai lượt mạng cho một câu, và giữa hai lượt đó màn hiển thị dữ liệu nó tự
 *  đoán. */
export const OpportunityUpdateResponse = OpportunityRow

// ---------------------------------------------------------------------------
// THE SCORECARD — `GET /sales/opportunities/scorecard`
// ---------------------------------------------------------------------------

/** The four cards above the Ops book, counted by SQL over the WHOLE book.
 *
 *  ------------------------------------------------------------------
 *  IT EXISTS BECAUSE THE SCREEN'S OWN COUNT WAS A LIE WITH A CEILING
 *  ------------------------------------------------------------------
 *  The cards used to be counted in the browser over whatever the book had
 *  fetched — `size=200`. That is right until deal 201 and quietly wrong after,
 *  and nothing on the page says which of the two you are looking at. Same
 *  argument, same fix, and the same shape as `LeadScorecard`.
 *
 *  NOT scoped, deliberately, and for the reason `LeadService.scorecard` states
 *  in full: these are the numbers of the KY — of the whole desk. Cutting them
 *  by who holds what means everybody reads a different figure under one label,
 *  and none of those figures is the one being asked for. The door still demands
 *  `opportunity.view`; whoever cannot open the book does not see the cards.
 *
 *  ------------------------------------------------------------------
 *  MONEY IS A SUM IN DONG, AND THE BLANKS ARE COUNTED BESIDE IT
 *  ------------------------------------------------------------------
 *  `openAmountVnd` converts through the rate table in `./currency`, in SQL —
 *  the same table the screen prints with, because two sums of one pipeline from
 *  two rate tables is exactly the drift nobody notices.
 *
 *  A deal with no amount cannot be added, so it is not added — and then it MUST
 *  be reported, which is what `openBlank` is for ("N đơn chưa có tiền, không
 *  cộng vào"). Dropping it silently would make the pipeline read smaller than
 *  it is with nothing on screen to say why; counting it as zero would do the
 *  same thing while looking like a real number. */
export const OpportunityScorecard = z.object({
  /** Every deal in the book, whatever its state — the denominator. */
  total: z.number().int().nonnegative(),
  /** Deals still standing in one of the five columns (`stage IS NOT NULL`).
   *  Won deals and cared-for deals have left the board, so neither counts. */
  open: z.number().int().nonnegative(),
  /** Sum of the open deals that HAVE an amount, converted to dong. */
  openAmountVnd: MoneyVnd,
  /** How many open deals carry no amount — the ones missing from the sum. */
  openBlank: z.number().int().nonnegative(),
  won: z.number().int().nonnegative(),
  /** Deals parked on the care list — the card that used to read "lost". Nobody
   *  is lost any more; a deal is either being worked or waiting to be. */
  care: z.number().int().nonnegative(),
})

// ---------------------------------------------------------------------------
// OPEN DEALS OF ONE LEAD — `GET /sales/opportunities/live-deal`
// ---------------------------------------------------------------------------

/** "Which deals of this lead are still open?" — open means neither parked in
 *  `care` nor signed, the same meaning the import door uses (`liveDealsByLead`).
 *
 *  Unscoped on purpose: the book is `scoped: true`, so a Sale filtering it
 *  would not see a colleague's deal on the same lead. */
export const OpportunityLiveDealQuery = z.object({
  leadCode: ObjectCode,
})

/** Open deals of the lead, oldest first — information, not a duplicate guard.
 *  `codes` holds only deals the reader may open; `hidden` counts the rest, so
 *  a colleague's deal is known to exist without its code being listed. */
export const OpportunityLiveDeal = z.object({
  codes: z.array(ObjectCode),
  hidden: z.number().int().nonnegative(),
})

export type OpportunityLiveDealQuery = z.infer<typeof OpportunityLiveDealQuery>
export type OpportunityLiveDeal = z.infer<typeof OpportunityLiveDeal>

export type OpportunityState = z.infer<typeof OpportunityState>
export type OpportunityOwnerRole = z.infer<typeof OpportunityOwnerRole>
export type OpportunityFile = z.infer<typeof OpportunityFile>
export type OpportunityCreate = z.infer<typeof OpportunityCreate>
export type OpportunityUpdate = z.infer<typeof OpportunityUpdate>
export type OpportunityUpdateResponse = z.infer<typeof OpportunityUpdateResponse>
export type OpportunityOwner = z.infer<typeof OpportunityOwner>
export type OpportunityRow = z.infer<typeof OpportunityRow>
export type OpportunityBookRow = z.infer<typeof OpportunityBookRow>
export type OpportunitySortKey = z.infer<typeof OpportunitySortKey>

export type OpportunityBookQuery = z.infer<typeof OpportunityBookQuery>
export type OpportunityBookResponse = z.infer<typeof OpportunityBookResponse>
export type OpportunityCreateResponse = z.infer<typeof OpportunityCreateResponse>
export type PendingSign = z.infer<typeof PendingSign>
export type OpportunityProfileResponse = z.infer<typeof OpportunityProfileResponse>
export type OpportunityScorecard = z.infer<typeof OpportunityScorecard>

// ---------------------------------------------------------------------------
// THE THREE DOORS THAT MOVE A DEAL — MILESTONE · CARE · REACTIVATE
// ---------------------------------------------------------------------------

/** The three recordable milestones, in the order a deal passes them.
 *
 *  Exported as an ordered tuple as well as an enum because the order IS the
 *  rule: a milestone below the deal's current column is refused, a repeat of
 *  the current one is allowed, and skipping forward is allowed. A second copy
 *  of that order in the server would be the copy that goes stale. */
export const OPPORTUNITY_MILESTONES = ['sample', 'poc', 'quotation'] as const
export const OpportunityMilestoneKind = z.enum(
  OPPORTUNITY_MILESTONES,
  'Mốc không có trong danh sách',
)

/** `POST /sales/opportunities/:code/milestones` — record a real event, and let
 *  the stage follow it. Permission `opportunity.edit`, `scoped: true`.
 *
 *  This is the only way past `assigned`: there is no "move the card" door, so a
 *  deal reads `quotation` because a quotation was sent, not because somebody
 *  dragged it. `at` is optional and defaults to now server-side — backdating is
 *  for paperwork entered late, not the common case. */
export const OpportunityMilestoneBody = z.object({
  kind: OpportunityMilestoneKind,
  at: Moment.optional(),
  note: textInputOptional(OPPORTUNITY_STAGE_NOTE_MAX),
})

/** `POST /sales/opportunities/:code/care` — park the deal on the care list.
 *
 *  `reasonKey` is a STRING, deliberately not an enum: the reasons are a
 *  per-stage catalogue in `sales.config_entry` that the desk edits without a
 *  deploy (spec §5), so a closed list here would refuse a row somebody just
 *  added. The server checks the key against the catalogue; the contract only
 *  guarantees a key was sent — and that `other` came with a sentence, because
 *  "Khác" with no note is a reason nobody can read later. */
export const OpportunityCareBody = z
  .object({
    reasonKey: textInput(OPPORTUNITY_CARE_REASON_MAX),
    note: textInputOptional(OPPORTUNITY_CARE_NOTE_MAX),
  })
  .refine((v) => v.reasonKey !== OPPORTUNITY_CARE_REASON_OTHER || v.note !== undefined, {
    error: 'Chọn "Khác" thì phải ghi lý do',
    path: ['note'],
  })

/** `POST /sales/opportunities/:code/reactivate` — bring a cared-for deal back
 *  to `careFromStage`. No fields: the column to return to is remembered on the
 *  row, and asking the caller for it would let a deal come back one column
 *  further along than it left. */
export const OpportunityReactivateBody = z.object({})

/** All three doors answer with the whole book row, like the write doors above:
 *  stage, state, the care fields and the clock are all recomputed, and a screen
 *  patching its own cached row would disagree with the next `GET`. */
export const OpportunityMilestoneResponse = OpportunityRow
export const OpportunityCareResponse = OpportunityRow
export const OpportunityReactivateResponse = OpportunityRow

// ---------------------------------------------------------------------------
// REMEMBERING THAT IT MOVED
// ---------------------------------------------------------------------------

/** One line of a deal's column history.
 *
 *  Read-only, always: no door writes one of these directly. Every row is a
 *  by-product of a move that happened somewhere else — the create door, a
 *  milestone, the care door, the signature — which is what makes the history
 *  trustworthy as a record rather than a second thing to maintain.
 *
 *  `from` and `to` are both nullable, and each null is a real event rather than
 *  missing data: `from: null` is the deal entering the board when it was
 *  opened, `to: null` is it leaving by being signed or parked. A funnel report
 *  reads the first as "entered" and the second as "exited"; dropping either
 *  would make the first and last step of every deal invisible. */
export const OpportunityStageEvent = z.object({
  id: z.string().min(1),
  at: Moment,
  from: StageKey.nullable(),
  to: StageKey.nullable(),
  /** Days the deal stood in `from`. Null exactly when `from` is. */
  daysInFrom: z.number().int().nonnegative().nullable(),
  /** The mover's name as it read on the day — snapshotted, not joined. Same
   *  rule as `TouchRow.by`: a record is a record of what was true THEN. */
  by: textInput(120),
  note: z.string().optional(),
})

/** `GET /sales/opportunities/:code/stage-history`.
 *
 *  Not `paged()`, for the same reason `ContactListResponse` is not: the list is
 *  bounded by how many times one deal changed column, which is a number that
 *  fits on a screen. A deal with fifty moves is a deal worth reading all fifty
 *  of, not one worth hiding behind "load more". */
export const OpportunityStageHistory = z.object({
  rows: z.array(OpportunityStageEvent),
})

export type OpportunityProduct = z.infer<typeof OpportunityProduct>
export type OpportunityMilestoneKind = z.infer<typeof OpportunityMilestoneKind>
export type OpportunityMilestoneBody = z.infer<typeof OpportunityMilestoneBody>
export type OpportunityMilestoneResponse = z.infer<typeof OpportunityMilestoneResponse>
export type OpportunityCareBody = z.infer<typeof OpportunityCareBody>
export type OpportunityCareResponse = z.infer<typeof OpportunityCareResponse>
export type OpportunityReactivateBody = z.infer<typeof OpportunityReactivateBody>
export type OpportunityReactivateResponse = z.infer<typeof OpportunityReactivateResponse>
export type OpportunityStageEvent = z.infer<typeof OpportunityStageEvent>
export type OpportunityStageHistory = z.infer<typeof OpportunityStageHistory>

// ---------------------------------------------------------------------------
// THE HISTOGRAM — `GET /sales/opportunities/histogram`
// ---------------------------------------------------------------------------

/** One column of the board, weighed. */
export const OpportunityStageBucket = z.object({
  stage: StageKey,
  /** The column's display name, from `config_entry.name`. Carried on the wire
   *  so the overview can draw the board without importing a fixture for its
   *  labels — the five web files that read `PIPELINE_STAGES` for this today are
   *  reading a customer scenario to find out what a column is called. */
  label: z.string().min(1),
  count: z.number().int().nonnegative(),
  amountVnd: MoneyVnd,
  /** Deals in this column with no amount — missing from `amountVnd`, counted
   *  here rather than added as zero. Same rule as `OpportunityScorecard`. */
  blank: z.number().int().nonnegative(),
  /** Past the column's `limitDays` (`config_entry`, list `STAGE`). Zero when
   *  the column has no limit configured — not "nothing is late" but "nothing
   *  can be late here yet", which `limitDays` below lets the screen tell. */
  rotting: z.number().int().nonnegative(),
  rottingAmountVnd: MoneyVnd,
  /** The configured limit, echoed so the screen prints the rule it is judging
   *  by instead of keeping a second copy of it. Null = no limit set. */
  limitDays: z.number().int().positive().nullable(),
})

/** The Ops board as a shape rather than as rows — what the overview draws its
 *  bar chart from. `OpportunityScorecard` already gives the totals; this splits
 *  the same open pipeline across the columns it is standing in.
 *
 *  Unscoped like both scorecards: one board, one set of figures. */
export const OpportunityHistogram = z.object({
  /** One entry per column that HAS a deal — an empty column is absent, so the
   *  screen decides whether to draw a zero bar or leave the gap. */
  buckets: z.array(OpportunityStageBucket),
})

export type OpportunityStageBucket = z.infer<typeof OpportunityStageBucket>
export type OpportunityHistogram = z.infer<typeof OpportunityHistogram>
