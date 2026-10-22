import { z } from 'zod'
import { searchText } from '../search-text'
import { Day, MoneyVnd, ContractCode, ObjectCode, Moment, textInput } from '../primitives'
import { PageQuery, SortDir, paged } from '../pagination'
import { ContractKind, CurrencyCode } from './enums'
import {
  OpportunityOwner,
  OpportunityRow,
  OpportunityStopReasons,
  StopReasonBody,
} from './opportunity'
import { WorkstreamHolder } from './workstream'

/** Signing a deal — the door that RAISES the request that makes a deal read `won`.
 *
 *      POST /sales/opportunities/:code/contract     permission `opportunity.close`
 *      -> 202 `ConfigProposalReceipt` (`./config`) — one inbox, one receipt shape,
 *         every propose door on this branch answers the same way.
 *      POST /sales/contracts/:code/terminate         permission `contract.terminate` · scoped
 *      -> `ContractTerminateResponse`; 409 when already terminated or refund > collected.
 *      PUT  /sales/contracts/:code/collector         permission `contract.edit` · scoped
 *      -> `ContractDetailResponse`; the server also limits it to head of sales / director.
 *      GET  /sales/contracts/termination-reasons     permission `contract.terminate`
 *      GET  /sales/contracts/collector-candidates    permission `contract.view` floor;
 *         the service asks `opportunity.close` OR `contract.edit`
 *      -> `ContractCollectorCandidates`: active actors holding `contract.record-payment`.
 *         Either opens it: the signer picks a PIC, head or director swaps one.
 *
 *  This door no longer writes `sales.contract` itself — signing leaves the
 *  sales floor, and E3's chain gets to look before the number is final.
 *  `ContractSignProposal` below is the payload the request carries; approving
 *  it is what actually inserts the row and produces `ContractSignResponse`,
 *  which is why that shape now travels through the approval decision rather
 *  than through this door's own response.
 *
 *  ------------------------------------------------------------------
 *  WHY THIS IS A CONTRACT DOOR AND NOT A STATE ON THE DEAL
 *  ------------------------------------------------------------------
 *  `sales.opportunity.state` stores `open` and `lost` and nothing else, because
 *  "won" was never a state of the opportunity — it is the EXISTENCE of a row in
 *  `sales.contract`. Every read path in the server already agrees:
 *  `OpportunityRepository.signed()` answers the question with an `EXISTS`, and
 *  `opportunity.mapper.ts` is the one place that folds that boolean back into
 *  the `won` the screen renders.
 *
 *  So there is exactly one honest way to win a deal, and it is to write the
 *  contract. A `PATCH` accepting `state: 'won'` would need somewhere to
 *  put the number and the date, and the only somewhere is this table — which
 *  makes the patch a contract door wearing a disguise, and leaves the door open
 *  to a deal marked won with no contract behind it.
 *
 *  ------------------------------------------------------------------
 *  THE PERMISSION IS `opportunity.close`, AND THIS IS THE ONLY ROUTE THAT USES IT
 *  ------------------------------------------------------------------
 *  Until now that permission existed in E2, was tested in `actors.test.ts`, and
 *  guarded nothing — the three write doors on the Ops book all ask for
 *  `opportunity.edit`. `OpportunityController`'s docblock already drew the line and
 *  explained it: editing is reversible, signing is not, and signing is the act
 *  that leaves the sales floor. This is the route that line was drawn for.
 *
 *  `presales` deliberately does not hold it. A presales engineer builds the
 *  numbers and runs the demo; the signature belongs to whoever stands on the
 *  deal.
 *
 *  ------------------------------------------------------------------
 *  VALUE AND KIND ARE ALWAYS TYPED; THE REST DEFAULTS FROM THE DEAL
 *  ------------------------------------------------------------------
 *  A won deal may sign again (licence beside deployment), so the deal's own
 *  value cannot stand in for the paper's: every request names `amount`,
 *  `currency` and `kind`, and the deal's value stays as it was (29/09).
 *  The two optional overrides exist for cases that really happen:
 *
 *   · `signedAt` — paperwork gets entered days after the pen moved.
 *   · `ownerId` — commission can land on somebody other than the first Sale in
 *     the list.
 *
 *  `code` is NOT here, for the reason `OpportunityCreate` has no `code`: the
 *  server mints it from `sales.contract_code_seq`, and a body carrying its own
 *  number is two tabs racing for one primary key. */

// ---------------------------------------------------------------------------
// THE CODE
// ---------------------------------------------------------------------------

/** A contract number — `HĐ-2711`, `HĐ-5001`.
 *
 *  It gets its own primitive instead of reusing `ObjectCode`, and the reason is
 *  one character: `ObjectCode` is `^[A-Z]{1,3}-\d{3,6}$`, and `Đ` is not in
 *  `A-Z`. The frozen book has carried `HĐ-27NN` since long before this door
 *  existed — `seed.ts` derives the six won deals' opportunity codes from those
 *  very strings — so the prefix is data that already exists, not a naming
 *  choice open today.
 *
 *  The consequence worth knowing: a contract code does NOT satisfy `ObjectCode`,
 *  so it cannot be passed to any route that validates a path param with it.
 *  Nothing does today, and this comment is here so the day something wants to
 *  it gets a widened `ObjectCode` rather than a quietly renamed prefix.
 *
 *  The declaration itself lives in `primitives.ts`, one directory up. It moved
 *  the day `OpportunityRow` grew a `contractCode`: this module already imports
 *  `./opportunity` to build `ContractSignResponse`, so importing back would
 *  close a module cycle that dies on load. The reasoning is written out where
 *  the declaration now stands. */

// ---------------------------------------------------------------------------
// THE REQUEST
// ---------------------------------------------------------------------------

export const CONTRACT_INSTALLMENTS_MAX = 24

/** One installment as typed: a schedule line before the server numbers it.
 *  `no` is the position in the list; `amount` is in the contract's currency. */
export const InstallmentDraft = z.object({
  label: textInput(200),
  share: z
    .number('Tỉ lệ là bắt buộc.')
    .int('Tỉ lệ phải là số nguyên.')
    .min(0, 'Tỉ lệ từ 0 đến 100.')
    .max(100, 'Tỉ lệ từ 0 đến 100.'),
  amount: MoneyVnd,
  due: Moment,
})

export const InstallmentDrafts = z
  .array(InstallmentDraft)
  .max(CONTRACT_INSTALLMENTS_MAX, `Tối đa ${CONTRACT_INSTALLMENTS_MAX} đợt.`)

const sumOf = (rows: readonly InstallmentDraft[], key: 'share' | 'amount') =>
  rows.reduce((sum, row) => sum + row[key], 0)

/** The plain object, kept apart because zod refuses `.pick()` on a refined
 *  schema and `PendingSign` picks from this one. */
export const ContractSignShape = z.object({
  /** Final signed value of THIS paper, in `currency`. */
  amount: MoneyVnd,
  currency: CurrencyCode,
  kind: ContractKind,

  /** When the pen actually moved. Absent = now.
   *
   *  A moment rather than a date, because the column is `timestamptz` and
   *  narrowing to `YYYY-MM-DD` here would force the server to invent a time
   *  of day — which lands on the wrong calendar day for anybody signing after
   *  17:00 in Hanoi once the string is read back as UTC. */
  signedAt: Moment.optional(),

  /** Whose commission. Absent = the deal's holder, i.e. its SALE primary. */
  ownerId: z.string().trim().min(1).max(64).optional(),

  /** Who chases the money. Required and separate from `ownerId`: the closer
   *  keeps commission and KPI, the collector owns the payment follow-up. */
  collectorId: z.string().trim().min(1).max(64),

  /** The pending round this signature wins (`sales.quotation.id`). Absent on a
   *  negotiation with no ledger row; the sign gate then only asks that the deal
   *  has at least one quotation. */
  quotationId: z.uuid().optional(),

  /** The payment schedule, approved together with the signature. Absent or
   *  empty = signed with no schedule yet. */
  installments: InstallmentDrafts.optional(),
})

/** A schedule, once given, must account for the whole paper — both sums. */
export const ContractSign = ContractSignShape.superRefine((v, ctx) => {
  const rows = v.installments ?? []
  if (rows.length === 0) return
  const fail = (message: string) =>
    ctx.addIssue({ code: 'custom', message, path: ['installments'] })
  if (sumOf(rows, 'share') !== 100) fail('Tổng tỉ lệ các đợt phải bằng 100%.')
  if (sumOf(rows, 'amount') !== v.amount) fail('Tổng tiền các đợt phải bằng giá trị hợp đồng.')
})

/** The `contract-sign` payload raised into the One inbox (`ApprovalKind` in
 *  `../approval`).
 *
 *  `opportunityCode` — not `code` or `leadCode` — is load-bearing: a partial
 *  unique index on `platform.approval` keys on `payload->>'opportunityCode'`
 *  to refuse a second waiting sign request on the same deal, so the field
 *  cannot be renamed without a migration. */
export const ContractSignProposal = z.object({
  opportunityCode: ObjectCode,
  sign: ContractSign,
})

// ---------------------------------------------------------------------------
// INSTALLMENTS — a signed contract's payment schedule, mirroring
// `packages/engines/src/fixtures/sao-do-contracts.ts` (the source of truth for
// this shape) and using `DueLevel`'s six-step ladder from
// `packages/engines/src/contract-due.ts` to read urgency, never a copy of it.
// ---------------------------------------------------------------------------

/** Which side owes the work. Two values, so "which side is this stuck on"
 *  always has an answer. */
export const ConditionSide = z.enum(['ours', 'customer'])

/** One unlock line inside an installment's checklist. */
export const InstallmentConditionRow = z.object({
  id: z.string().min(1).max(64),
  side: ConditionSide,
  what: textInput(500),
  due: Moment,
  /** Absent = not done. For a customer-side line, "done" means the CUSTOMER
   *  did it, not that we chased them. */
  doneAt: Moment.optional(),
  who: textInput(120),
})

/** "Not there yet" is a real state, not an empty slot — see the docblock on
 *  the fixture's own `DocState`. */
export const DocState = z.enum(['complete', 'awaiting-signature', 'missing'])

/** Declared beside the enum so every screen says the same word; tone stays a
 *  per-screen choice because urgency depends on what the document gates. */
export const DOC_STATE_LABEL: Record<z.infer<typeof DocState>, string> = {
  complete: 'Đủ',
  'awaiting-signature': 'Chờ ký',
  missing: 'Chưa có',
}

export const InstallmentDocRow = z.object({
  id: z.string().min(1).max(64),
  name: textInput(300),
  state: DocState,
  hint: textInput(300),
})

export const RecordState = z.enum(['done', 'awaiting-reply', 'scheduled', 'upcoming'])

/** Channel of one touch on an installment — already sent, or queued to send.
 *  A different closed set from `ContactChannel` in `./enums`: that one lists
 *  where a LEAD can be reached, this one lists how the DESK chases money, and
 *  the two vocabularies do not line up (the phone-call value here has no
 *  analogue on the lead side, and telegram/linkedin/facebook/website have
 *  none here). */
export const RecordChannel = z.enum(['email', 'zalo-oa', 'in-app', 'call'])

export const InstallmentRecordRow = z.object({
  id: z.string().min(1).max(64),
  at: Moment,
  channel: RecordChannel,
  what: textInput(300),
  detail: textInput(300),
  state: RecordState,
})

/** Free-hand note — the place for what no field can hold. */
export const InstallmentNoteRow = z.object({
  id: z.string().min(1).max(64),
  at: Moment,
  who: textInput(120),
  text: textInput(2_000),
})

/** One installment, FULL — every checklist line, document and touch nested
 *  in. Only `ContractDetailResponse` carries this shape; the book carries
 *  `InstallmentSummaryRow` instead (see there for why the two must not
 *  merge). */
export const InstallmentRow = z.object({
  no: z.number().int().positive(),
  label: textInput(200),
  /** Share of the contract value, whole percent. */
  share: z.number().int().min(0).max(100),
  amount: MoneyVnd,
  due: Moment,
  /** Day the money landed. Absent = not collected. */
  paidAt: Moment.optional(),
  /** Who recorded the collection, and when — only that person may undo it.
   *  Absent while unpaid and on rows collected before the door existed. */
  paidBy: WorkstreamHolder.optional(),
  paidRecordedAt: Moment.optional(),
  conditions: z.array(InstallmentConditionRow),
  docs: z.array(InstallmentDocRow),
  records: z.array(InstallmentRecordRow),
  notes: z.array(InstallmentNoteRow),
})

/** One installment, LEAN — just what the book's table paints: the money row
 *  and its own due date. No checklist, no docs, no touch history — a book of
 *  three contracts pulling six installments times (four conditions + four
 *  docs + six records) each is a payload nobody reads. */
export const InstallmentSummaryRow = InstallmentRow.pick({
  no: true,
  label: true,
  share: true,
  amount: true,
  due: true,
  paidAt: true,
})

/** Where one installment stands on the server's today (VN calendar): `overdue`
 *  = unpaid with its due day already past; due today is still `upcoming`. */
export const InstallmentStatus = z.enum(['paid', 'overdue', 'upcoming'])

export const INSTALLMENT_STATUS_LABEL: Record<InstallmentStatus, string> = {
  paid: 'Đã thu',
  overdue: 'Quá hạn',
  upcoming: 'Chưa đến hạn',
}

// ---------------------------------------------------------------------------
// THE READ SHAPE
// ---------------------------------------------------------------------------

/** One person frozen onto a contract. `OpportunityOwner`'s own shape, so the
 *  snapshot cannot drift from the lanes it was copied from. */
export const ContractParticipant = OpportunityOwner

/** The one `sales.contract_termination` row of a contract. The contract and its
 *  installments stay; this row alone moves the deal to `terminated` (final).
 *  Amounts are in the contract's currency, like `ContractRow.amount`;
 *  `collectedAmount` is what had landed when the paper was ended. */
export const ContractTermination = z.object({
  terminatedAt: Moment,
  /** A `CONTRACT_TERMINATION_REASON` id or `other`; label resolved server-side. */
  reasonKey: z.string().min(1),
  reasonLabel: z.string().min(1),
  note: z.string().nullable(),
  collectedAmount: MoneyVnd,
  refundedAmount: MoneyVnd,
  byId: z.string().min(1).max(64),
  byName: textInput(120),
})

/** One signed contract, as the book prints it — LEAN installments only.
 *  `ContractDetailRow` below extends this same row with the full nested
 *  schedule for the one-contract screen. */
export const ContractRow = z.object({
  code: ContractCode,
  opportunityCode: ObjectCode,
  leadCode: ObjectCode,
  /** Customer company name, joined from the lead.
   *
   *  On the ROW rather than only on the detail, because the book's own customer
   *  column has to print something a human recognises. It used to print
   *  `leadCode`, which is the one string on that line nobody at the desk says
   *  out loud. The repository already selects it for the book (the E2 second
   *  net needs it for `toRef`); only the mapper was dropping it. */
  customer: textInput(200),
  /** Null only on contracts signed before a sign request had to name its kind. */
  kind: ContractKind.nullable(),
  amount: MoneyVnd.nullable(),
  currency: CurrencyCode.nullable(),
  signedAt: Moment,
  /** Present together or not at all — an unassigned contract has neither. */
  ownerId: z.string().min(1).max(64).optional(),
  ownerName: textInput(120).optional(),
  /** The payment PIC, present together or not at all like the owner pair. */
  collectorId: z.string().min(1).max(64).optional(),
  collectorName: textInput(120).optional(),
  /** The deal's SALE/BD lanes as they stood at signing — written once by the
   *  server, so no request body carries it and a later lane edit never moves it. */
  participants: z.array(ContractParticipant),
  /** Absent on a just-signed contract with no schedule drafted yet — the
   *  sign door (`ContractSignResponse`) returns a row before any installment
   *  exists. */
  /* Optional with NO default. A default would make the OUTPUT type required and
     force every mapper to invent an empty array — including the sign door, which
     answers before any schedule exists. Absent means "this response did not load
     the schedule"; an empty array would claim "this contract has none". */
  installments: z.array(InstallmentSummaryRow).optional(),
  /** Null while the contract is live. */
  termination: ContractTermination.nullable(),
})

/** One contract, FULL — `GET /sales/contracts/:code`. Adds the customer-side
 *  contact (needed to print the header, absent from the book row because the
 *  book's own columns never show it) and swaps in the full installment
 *  schedule. */
export const ContractDetailRow = ContractRow.extend({
  /** The customer-side contact — the person who signs acceptance. */
  contact: textInput(120),
  contactRole: textInput(120),
  installments: z.array(InstallmentRow),
  /** Whether the reader may write this contract: its closer (`ownerId`), the
   *  head of sales or the director (ADR 0110). Optional so a screen reads an
   *  API one deploy behind; absent keeps the screen's old gate. */
  canEdit: z.boolean().optional(),
  /** Whether the reader may record or undo payments on THIS contract (server
   *  `mayCollect`). Optional for an API one deploy behind. */
  canCollect: z.boolean().optional(),
  /** Whether the reader may swap the collector PIC: head of sales or director
   *  on a contract not yet terminated (ADR 0111). Optional like its siblings. */
  canChangeCollector: z.boolean().optional(),
})

/** What a contract book row is judged by. A contract stores no state: all four
 *  are derived in SQL — the first three off its installments, and only for a
 *  contract with no termination row.
 *
 *   · `open` — not fully collected (includes a contract with no schedule yet)
 *   · `overdue` — an unpaid installment is already past its date
 *   · `collected` — a schedule exists and every installment is paid
 *   · `terminated` — carries a `sales.contract_termination` row */
export const ContractStatusFilter = z.enum(['all', 'open', 'overdue', 'collected', 'terminated'])

/** Sortable columns. Blank amounts and a missing next installment sort LAST in
 *  both directions: an unpriced contract is not the cheapest one. */
export const ContractSortKey = z.enum(['nextDue', 'amount', 'signedAt', 'code'])

/** `GET /sales/contracts` — paging, filtering and sorting, all on the server.
 *
 *  Absent = no filter. `owner` is a comma list of actor ids (`OWNER_NONE` =
 *  nobody holds the commission). The default order is the soonest unpaid
 *  installment first, which is the urgency order the screen used to apply to
 *  one page in the browser. `code` breaks every tie so paging stays stable. */
export const ContractBookQuery = PageQuery.extend({
  status: ContractStatusFilter.default('all'),
  owner: z.string().min(1).max(512).optional(),
  signedFrom: Day.optional(),
  signedTo: Day.optional(),
  /** `ContractKind` codes joined by commas; a contract of ANY of them matches. */
  kind: z
    .string()
    .max(200)
    .refine((v) => v.split(',').every((s) => ContractKind.safeParse(s).success))
    .optional(),
  /** Due day of the NEXT unpaid installment (what the `nextDue` sort reads),
   *  both ends inclusive. A contract with none left, or a terminated one
   *  (nobody owes its installments, ADR 0107), never matches. */
  dueFrom: Day.optional(),
  dueTo: Day.optional(),
  /** Contract amount converted to VND by the rate table (what the `amount`
   *  sort orders by), whole dong, both ends inclusive. A blank amount never matches. */
  amountMin: z.coerce.number().int().nonnegative().optional(),
  amountMax: z.coerce.number().int().nonnegative().optional(),
  /** Substring of the contract code or the customer's company name. */
  q: searchText,
  sort: ContractSortKey.default('nextDue'),
  dir: SortDir.default('asc'),
})

/** `GET /sales/contracts` — the book. */
export const ContractBookResponse = paged(ContractRow)

/** `GET /sales/contracts/:code` — one contract, fully nested. */
export const ContractDetailResponse = ContractDetailRow

/** `PUT /sales/contracts/:code/collector` body — same bound as `collectorId`
 *  at signing; the server re-checks the candidate holds `contract.record-payment`. */
export const ContractCollectorBody = z.object({
  collectorId: z.string().trim().min(1).max(64),
})

/** One person who may be picked as `collectorId`; `role` is a display label. */
export const ContractCollectorCandidate = z.object({
  id: z.string().min(1).max(64),
  name: textInput(120),
  role: z.string().min(1),
})

/** `GET /sales/contracts/collector-candidates` — the server applies no limit. */
export const ContractCollectorCandidates = z.array(ContractCollectorCandidate)

/** What the sign door answers when the signer needs no approval (director,
 *  head of sales — ADR 0091): the contract already exists. Everyone else gets
 *  the approval receipt (`ConfigProposalReceipt`) instead. */
export const ContractSignedReceipt = z.object({ contractCode: ContractCode })

/** What signing produces, once E3 approves the `contract-sign` request.
 *
 *  BOTH halves, because the caller needs both and neither implies the other.
 *  The opportunity comes back because signing changes how it reads — `state`
 *  reads `won` (derived, never stored), `stage` and `daysInStage` go null,
 *  `closedAt` is set — every one of those is computed, so a screen that patched its own cached
 *  row would get a different answer than the next `GET`. The contract comes
 *  back because the number the server just minted exists nowhere else yet, and
 *  making the caller re-read to learn it is the same round trip twice.
 *
 *  No door answers this SYNCHRONOUSLY any more — `POST :code/contract` returns
 *  a receipt, not this. It is what the approval decision produces server-side
 *  once `contract-sign` is approved; kept here rather than deleted because the
 *  shape of "a sign happened" has not changed, only when it fires. */
export const ContractSignResponse = z.object({
  opportunity: OpportunityRow,
  contract: ContractRow,
})

/** `POST /sales/contracts/:code/terminate`. `StopReasonBody` via `safeExtend`
 *  so "other needs a note" survives; `reasonKey` is checked against the
 *  `CONTRACT_TERMINATION_REASON` catalogue by the server, like the deal stop.
 *  `refundedAmount` is in the contract's currency; the server refuses one above
 *  what was collected (409), which a body alone cannot know. */
export const ContractTerminateBody = StopReasonBody.safeExtend({
  refundedAmount: MoneyVnd.default(0),
})

/** The whole contract back: `termination` and the book status are recomputed. */
export const ContractTerminateResponse = ContractDetailRow

/** `GET /sales/contracts/termination-reasons` — ACTIVE entries, `other` not
 *  listed. `OpportunityStopReasons`'s shape so one reason picker reads both;
 *  `stage` is always null and `doNotContact` always false here. */
export const ContractTerminationReasons = OpportunityStopReasons

export type ContractTermination = z.infer<typeof ContractTermination>
export type ContractCollectorCandidate = z.infer<typeof ContractCollectorCandidate>
export type ContractCollectorCandidates = z.infer<typeof ContractCollectorCandidates>
export type ContractTerminateBody = z.infer<typeof ContractTerminateBody>
export type ContractTerminateResponse = z.infer<typeof ContractTerminateResponse>
export type ContractTerminationReasons = z.infer<typeof ContractTerminationReasons>
export type ContractSignedReceipt = z.infer<typeof ContractSignedReceipt>
export type InstallmentDraft = z.infer<typeof InstallmentDraft>
export type InstallmentStatus = z.infer<typeof InstallmentStatus>
export type ContractSign = z.infer<typeof ContractSign>
export type ContractSignProposal = z.infer<typeof ContractSignProposal>
export type ContractSignResponse = z.infer<typeof ContractSignResponse>

export type ConditionSide = z.infer<typeof ConditionSide>
export type InstallmentConditionRow = z.infer<typeof InstallmentConditionRow>
export type DocState = z.infer<typeof DocState>
export type InstallmentDocRow = z.infer<typeof InstallmentDocRow>
export type RecordState = z.infer<typeof RecordState>
export type RecordChannel = z.infer<typeof RecordChannel>
export type InstallmentRecordRow = z.infer<typeof InstallmentRecordRow>
export type InstallmentNoteRow = z.infer<typeof InstallmentNoteRow>
export type InstallmentRow = z.infer<typeof InstallmentRow>
export type InstallmentSummaryRow = z.infer<typeof InstallmentSummaryRow>
export type ContractParticipant = z.infer<typeof ContractParticipant>
export type ContractRow = z.infer<typeof ContractRow>
export type ContractDetailRow = z.infer<typeof ContractDetailRow>
export type ContractStatusFilter = z.infer<typeof ContractStatusFilter>
export type ContractBookQuery = z.infer<typeof ContractBookQuery>
export type ContractBookResponse = z.infer<typeof ContractBookResponse>
export type ContractDetailResponse = z.infer<typeof ContractDetailResponse>
export type ContractCollectorBody = z.infer<typeof ContractCollectorBody>

// ---------------------------------------------------------------------------
// THE SUMMARY — `GET /sales/contracts/summary`
// ---------------------------------------------------------------------------

/** One month of signing, for the trend strip. `month` is 'YYYY-MM'. */
export const ContractMonthPoint = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Tháng phải dạng YYYY-MM'),
  signedCount: z.number().int().nonnegative(),
  signedAmountVnd: MoneyVnd,
})

/** The contract book folded to one row of numbers.
 *
 *  Separate from `GET /sales/contracts` because the overview needs sums over
 *  EVERY contract while the book hands back one page — summing a page gives a
 *  figure that shrinks when someone turns to page 2.
 *
 *  Not scoped, same reason as the two scorecards: these are the desk's numbers,
 *  and cutting them by who holds what makes everyone read a different figure
 *  under one label. The contract read permission still guards the door.
 *
 *  `collectedVnd`/`overdueVnd` are summed from `contract_installment`, not from
 *  `contract.amount` — signed money and landed money are different questions,
 *  and the tile exists because they disagree. */
export const ContractSummary = z.object({
  signedCount: z.number().int().nonnegative(),
  signedAmountVnd: MoneyVnd,
  /** Contracts carrying no amount — the ones missing from `signedAmountVnd`,
   *  reported beside it rather than counted as zero. */
  blankAmount: z.number().int().nonnegative(),

  /** Sum of every installment ever scheduled. Differs from `signedAmountVnd`
   *  when a contract has been signed with no schedule drafted yet. */
  scheduledVnd: MoneyVnd,
  collectedVnd: MoneyVnd,
  /** Unpaid and past its date, as of the server's today. */
  overdueVnd: MoneyVnd,
  overdueCount: z.number().int().nonnegative(),
  /** Unpaid, not yet late, inside `DUE_NEAR_DAYS` of `@pv/engines`. */
  dueSoonVnd: MoneyVnd,
  dueSoonCount: z.number().int().nonnegative(),

  /** Unlock conditions past their date and not ticked, split by who owes them.
   *
   *  A different question from `overdueCount`, not a finer cut of it: an
   *  installment is late MONEY, a condition is late PAPERWORK — an acceptance
   *  minute nobody signed, a drawing nobody sent. The contract book has printed
   *  the split since it was built, as a count on each side,
   *  and the two sides stay separate because one is a phone call to the
   *  customer and the other is a phone call down the hall. */
  lateConditionsOurs: z.number().int().nonnegative(),
  lateConditionsTheirs: z.number().int().nonnegative(),

  /** Newest LAST, so the array feeds a sparkline without being reversed. */
  byMonth: z.array(ContractMonthPoint),
})

export type ContractMonthPoint = z.infer<typeof ContractMonthPoint>
export type ContractSummary = z.infer<typeof ContractSummary>
