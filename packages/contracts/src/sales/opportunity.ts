import { z } from 'zod'
import { PageQuery, SortDir, paged } from '../pagination'
import { Dong, MaHopDong, MaObject, Moc, Ngay, textNhap, textNhapTuyChon } from '../primitives'
import { CurrencyCode, StageKey } from './enums'

/** Module 3 · Cơ hội — the wire shape of the Ops book.
 *
 *  ------------------------------------------------------------------
 *  THE CREATE DOOR ACCEPTS FOUR STATES, THE BOOK CARRIES FIVE
 *  ------------------------------------------------------------------
 *  `close-won` is missing from `OpportunityCreate` on purpose, and the reason
 *  is a table that is not this one: "won" is not a state of an opportunity at
 *  all, it is the EXISTENCE of a row in `sales.contract` (see the docblock on
 *  `opportunity.schema.ts`). A contract row needs a contract number and a
 *  signing date, and the promote form has an input for neither — so a create
 *  door accepting `close-won` could only invent both.
 *
 *  Two enums rather than one `.refine()` because the difference is structural,
 *  not a validation rule: the four are what a caller may SAY, the five are what
 *  the book may CONTAIN. A screen reading `OpportunityState` gets all five and
 *  renders them; a body claiming the fifth dies at the gate naming the field.
 *  Closing a deal as won stays where the missing facts can be asked for — the
 *  opportunity profile, not the promote form.
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

/** What a seller is DOING with the deal. Five values, two of them terminal. */
export const OpportunityState = z.enum([
  'gui-quotation',
  'nego',
  'close-won',
  'close-lost',
  'pending',
])

/** The four a create body may claim. See the docblock above for why
 *  `close-won` is not one of them. */
export const OpportunityCreateState = z.enum(['gui-quotation', 'nego', 'close-lost', 'pending'])

/** Which of the five pipeline columns a state drops the deal into.
 *
 *  `null` is an answer, not a gap: both terminal states leave the five-column
 *  board entirely, and a sixth column invented to hold them would be a column
 *  nobody works. The map lives in the contract rather than in a screen because
 *  the server writes `stage` from `state` on the way in — one table, so the
 *  column a row lands in cannot disagree with the badge printed on it. */
export const STAGE_OF_STATE = {
  'gui-quotation': 'da-bao-gia',
  nego: 'cho-ky',
  'close-won': null,
  'close-lost': null,
  pending: 'tim-hieu',
} as const satisfies Record<z.infer<typeof OpportunityState>, z.infer<typeof StageKey> | null>

export function stageOfState(state: OpportunityState): StageKey | null {
  return STAGE_OF_STATE[state]
}

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
  name: textNhap(255),
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

/** The four length caps of `dealFields`, named and EXPORTED rather than left as
 *  literals in the shapes below.
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
export const OPPORTUNITY_LOSS_REASON_MAX = 120
export const OPPORTUNITY_LOSS_NOTE_MAX = 1_000

/** Actor ids on one side of a deal. Deduped, so the join table is never handed
 *  the same pair twice and never dies on its own primary key. */
const ownerIds = z
  .array(textNhap(64))
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
  name: textNhap(OPPORTUNITY_NAME_MAX),

  expectedClose: Ngay,
  state: OpportunityCreateState,

  /** Money always travels with its unit — both required together, unlike the
   *  lead's budget where the customer may simply not have named one. A deal
   *  being opened without a value is a deal nobody can forecast. */
  amount: Dong,
  currency: CurrencyCode,

  saleOwners: ownerIds,
  bdOwners: ownerIds.optional().default([]),

  description: textNhapTuyChon(OPPORTUNITY_DESCRIPTION_MAX),
  attachments: z.array(OpportunityFile).max(OPPORTUNITY_FILES_MAX).optional().default([]),

  /** Only meaningful when `state === 'close-lost'`; refused otherwise. */
  lossReason: textNhapTuyChon(OPPORTUNITY_LOSS_REASON_MAX),
  lossNote: textNhapTuyChon(OPPORTUNITY_LOSS_NOTE_MAX),
}

/* Ba luật LIÊN Ô dưới đây lặp lại ở cả hai cửa, và lặp có chủ ý. Zod 4 không
   cho gắn `.refine` vào một object literal rồi trải nó ra — `.refine` trả về
   `ZodEffects`, không còn `.shape` để trải — nên gói chúng thành một hàm sẽ đòi
   một chữ ký generic mà chỉ có ba dòng thân hàm. Chia sẻ phần TRƯỜNG (nơi một
   sai lệch làm hai form hỏi hai bộ câu khác nhau) và chép phần LUẬT (ba dòng,
   đọc tại chỗ) là đánh đổi đúng chiều. */

/** `POST /sales/opportunities` — promote a lead into an opportunity.
 *
 *  `code` is absent: the only legal source is the server's sequence. A body
 *  that could name its own code could land on somebody else's deal, and two
 *  people with the promote form open would mint the same number.
 *
 *  `stage` is absent for the same class of reason — it is DERIVED from `state`
 *  through `STAGE_OF_STATE`, and a body carrying both invites the two to
 *  disagree. */
export const OpportunityCreate = z
  .object({
    /** The lead this deal came out of. One lead may produce many. */
    leadCode: MaObject,
    /** The account object in E1's graph, when the lead already has one. */
    accountCode: MaObject.optional(),
    ...dealFields,
  })
  .refine((v) => v.saleOwners.length > 0, {
    error: 'Phải có ít nhất một Sale đứng đơn',
    path: ['saleOwners'],
  })
  .refine(
    (v) => v.state !== 'close-lost' || v.lossReason !== undefined || v.lossNote !== undefined,
    { error: 'Đơn thua phải ghi lý do', path: ['lossReason'] },
  )
  .refine(
    (v) => v.state === 'close-lost' || (v.lossReason === undefined && v.lossNote === undefined),
    { error: 'Chỉ đơn thua mới ghi được lý do thua', path: ['lossReason'] },
  )

/** `PATCH /sales/opportunities/:code` — the opportunity profile's save button.
 *
 *  ------------------------------------------------------------------
 *  THE WHOLE EDITABLE SET, NOT THE CHANGED FIELDS
 *  ------------------------------------------------------------------
 *  The screen knows which cells are dirty and says so on the button ("Lưu 3 ô
 *  đã sửa"), but it sends all eleven. That is deliberate: the three rules above
 *  are CROSS-FIELD, and a sparse body cannot be checked against them without
 *  first re-reading the row and merging — which means the rule is enforced
 *  against a state that existed one query ago. Sending the whole form makes the
 *  body self-describing, so "is this a legal deal" is answered by looking at
 *  the body alone.
 *
 *  What is NOT here is as load-bearing as what is: `leadCode` and `accountCode`
 *  cannot be edited — a deal does not move to another customer, and a request
 *  that could move it is a request that can rewrite somebody's pipeline by
 *  typo. `code` is not editable for the same reason it is not creatable. */
export const OpportunityUpdate = z
  .object(dealFields)
  .refine((v) => v.saleOwners.length > 0, {
    error: 'Phải có ít nhất một Sale đứng đơn',
    path: ['saleOwners'],
  })
  .refine(
    (v) => v.state !== 'close-lost' || v.lossReason !== undefined || v.lossNote !== undefined,
    { error: 'Đơn thua phải ghi lý do', path: ['lossReason'] },
  )
  .refine(
    (v) => v.state === 'close-lost' || (v.lossReason === undefined && v.lossNote === undefined),
    { error: 'Chỉ đơn thua mới ghi được lý do thua', path: ['lossReason'] },
  )

// ---------------------------------------------------------------------------
// THE READ SHAPE
// ---------------------------------------------------------------------------

/** One person on a deal, as the book prints them.
 *
 *  Carries the display name beside the id for the same reason `LeadRow` carries
 *  the owner's mailbox: a screen renders people, and nothing downstream should
 *  need a second call to turn an id into a human being. */
export const OpportunityOwner = z.object({
  id: textNhap(64),
  name: textNhap(120),
  role: OpportunityOwnerRole,
})

/** One row of the Ops book. */
export const OpportunityRow = z.object({
  code: MaObject,
  leadCode: MaObject,
  /** The customer, carried so the book need not join the lead book to print a
   *  name. `accountCode` is present only when E1 has an account object. */
  account: textNhap(200),
  accountCode: MaObject.optional(),

  name: textNhap(200),
  state: OpportunityState,
  /** The number on the paper that made `state` read `close-won`.
   *
   *  Present ONLY on a signed deal, and absent — not `''` — on every other one.
   *  The two facts are one fact: `close-won` IS the existence of a row in
   *  `sales.contract` (see the docblock at the top of this file), so a row
   *  carrying the fifth state without a number, or a number without the fifth
   *  state, would be the server disagreeing with itself. An empty string would
   *  be a third way of saying "no contract" beside `state` and absence, and the
   *  screen would have to test for all three before printing.
   *
   *  `MaHopDong`, not `MaObject`: `Đ` is not in `A-Z`. The primitive lives in
   *  `primitives.ts` and its docblock says why it cannot be reused from
   *  `./contract` — that module imports this one. */
  contractCode: MaHopDong.optional(),
  /** Which of the five columns the deal stands in. `null` = it has left the
   *  board (won or lost). Written from `state` at create time, then free to
   *  move on its own — see the schema's docblock. */
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
  expectedClose: Ngay.nullable(),
  amount: Dong.nullable(),
  currency: CurrencyCode.nullable(),

  owners: z.array(OpportunityOwner),

  description: z.string().optional(),
  attachments: z.array(OpportunityFile),

  lossReason: z.string().optional(),
  lossNote: z.string().optional(),

  createdAt: Moc,
  closedAt: Moc.nullable(),
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
  leadCode: MaObject.optional(),

  /** One of the five the book may CONTAIN, not one of the four a body may
   *  claim — `close-won` filters too, and it has to: it is the state the deal
   *  board's rightmost card is counted in. The server resolves it the same way
   *  every read path does, by the existence of a `sales.contract` row, because
   *  no column spells it (see the docblock at the top of this file). */
  state: OpportunityState.optional(),

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

export const OpportunityBookResponse = paged(OpportunityRow)

export const OpportunityCreateResponse = OpportunityRow

/** Cả hai cửa ghi trả về NGUYÊN dòng sổ, cùng một hình với lượt đọc.
 *
 *  Không phải `{ok: true}`: màn vừa sửa xong cần biết máy chủ đã chuẩn hoá
 *  thành cái gì — cột nào `state` mới rơi vào, `closed_at` có được đặt không,
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
 *  `cơ-hội.xem`; whoever cannot open the book does not see the cards.
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
   *  Won and lost have left the board, so neither is counted here. */
  open: z.number().int().nonnegative(),
  /** Sum of the open deals that HAVE an amount, converted to dong. */
  openAmountVnd: Dong,
  /** How many open deals carry no amount — the ones missing from the sum. */
  openBlank: z.number().int().nonnegative(),
  won: z.number().int().nonnegative(),
  lost: z.number().int().nonnegative(),
})

// ---------------------------------------------------------------------------
// THE DUPLICATE GUARD — `GET /sales/opportunities/live-deal`
// ---------------------------------------------------------------------------

/** "Does this lead already have a deal that is still alive?" — one lead in, at
 *  most one deal code out.
 *
 *  ------------------------------------------------------------------
 *  IT IS A SEPARATE DOOR BECAUSE THE BOOK CANNOT ANSWER THIS QUESTION
 *  ------------------------------------------------------------------
 *  The lead profile asks it before offering the "convert to opportunity"
 *  button, and it used to ask it by filtering the book —
 *  `GET /sales/opportunities?leadCode=…`, which is `scoped: true`. Scoped is
 *  right for a book and fatally wrong for a guard: Sale A converts LD-0042 into
 *  OP-5001, Sale B (also `ownOnly`) opens LD-0042, the scope axis removes
 *  OP-5001 from the answer, and the screen reads the resulting empty list as
 *  "nobody has converted this lead". The button lights up, `POST
 *  /sales/opportunities` demands only `cơ-hội.sửa` and does not check for
 *  duplicates, and the customer now has two deals. A guard that hides the very
 *  row it exists to find is not a guard.
 *
 *  So this door deliberately steps OFF the scope axis, and pays for that by
 *  returning as little as it possibly can — see `code`.
 *
 *  ------------------------------------------------------------------
 *  "ALIVE", NOT "HAS EVER EXISTED"
 *  ------------------------------------------------------------------
 *  Alive means `state <> 'close-lost'` AND not signed, which is exactly what
 *  the import door already means by a duplicate (`liveDealsByLead`). A customer
 *  who comes back a quarter after a lost deal is a NEW deal, not a second copy
 *  of a finished one — so a lead whose only deal is closed may be converted
 *  again, and this contract has to say so, because the screen it feeds used to
 *  block on any deal that had ever existed and left that lead permanently
 *  un-convertible. Two doors of one book must not answer this differently. */
export const OpportunityLiveDealQuery = z.object({
  leadCode: MaObject,
})

/** The whole answer: a code, or nothing.
 *
 *  ------------------------------------------------------------------
 *  THE SHORT SHAPE IS THE PRICE OF SKIPPING THE SCOPE AXIS
 *  ------------------------------------------------------------------
 *  This door tells a Sale about a deal that is NOT theirs and that the book
 *  would have hidden from them. That is worth doing for exactly one reason —
 *  stopping a second deal on one customer — so it may leak exactly what that
 *  reason needs and not one field more: whether a live deal exists, and the
 *  code to navigate to. No owner name (who is working the account is precisely
 *  what the scope axis is protecting), no amount, no state, no customer.
 *
 *  `null` means "no live deal", never "you may not see it": the door does not
 *  cut by scope, so an empty answer is a fact about the book rather than a fact
 *  about the reader. That is what makes it safe to read as "the button may
 *  light up".
 *
 *  A bare `code` rather than `{ exists, code }`: two fields that can disagree
 *  are two fields that eventually will. `code !== null` IS the existence
 *  answer. */
export const OpportunityLiveDeal = z.object({
  code: MaObject.nullable(),
})

export type OpportunityLiveDealQuery = z.infer<typeof OpportunityLiveDealQuery>
export type OpportunityLiveDeal = z.infer<typeof OpportunityLiveDeal>

export type OpportunityState = z.infer<typeof OpportunityState>
export type OpportunityCreateState = z.infer<typeof OpportunityCreateState>
export type OpportunityOwnerRole = z.infer<typeof OpportunityOwnerRole>
export type OpportunityFile = z.infer<typeof OpportunityFile>
export type OpportunityCreate = z.infer<typeof OpportunityCreate>
export type OpportunityUpdate = z.infer<typeof OpportunityUpdate>
export type OpportunityUpdateResponse = z.infer<typeof OpportunityUpdateResponse>
export type OpportunityOwner = z.infer<typeof OpportunityOwner>
export type OpportunityRow = z.infer<typeof OpportunityRow>
export type OpportunitySortKey = z.infer<typeof OpportunitySortKey>
export type OpportunityBookQuery = z.infer<typeof OpportunityBookQuery>
export type OpportunityBookResponse = z.infer<typeof OpportunityBookResponse>
export type OpportunityCreateResponse = z.infer<typeof OpportunityCreateResponse>
export type OpportunityScorecard = z.infer<typeof OpportunityScorecard>
