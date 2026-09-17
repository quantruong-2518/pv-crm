import { z } from 'zod'
import { MoneyVnd, ContractCode, ObjectCode, Moment, textInput } from '../primitives'
import { paged } from '../pagination'
import { CurrencyCode } from './enums'
import { OpportunityRow } from './opportunity'

/** Signing a deal — the door that RAISES the request to make `close-won` true.
 *
 *      POST /sales/opportunities/:code/contract     permission `opportunity.close`
 *      -> 202 `ConfigProposalReceipt` (`./config`) — one inbox, one receipt shape,
 *         every propose door on this branch answers the same way.
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
 *  `sales.opportunity.state` has four values and none of them is `close-won`,
 *  because "won" was never a state of the opportunity — it is the EXISTENCE of
 *  a row in `sales.contract`. Every read path in the server already agrees:
 *  `OpportunityRepository.signed()` answers the question with an `EXISTS`, and
 *  `opportunity.mapper.ts` is the one place that folds that boolean back into
 *  the fifth state the screen renders.
 *
 *  So there is exactly one honest way to win a deal, and it is to write the
 *  contract. A `PATCH` accepting `state: 'close-won'` would need somewhere to
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
 *  THREE FIELDS, ALL OPTIONAL, AND THE DEFAULTS COME FROM THE DEAL
 *  ------------------------------------------------------------------
 *  A contract signed for exactly what the opportunity said it was worth, by the
 *  Sale already standing on it, today — that is the common case, and it should
 *  cost zero fields. Each override exists for a case that really happens:
 *
 *   · `amount`/`currency` — the final number is often not the quoted one.
 *     Both or neither, mirroring CHECK `contract_money_pair`; sending one is a
 *     400 naming the field rather than a 500 from the constraint.
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

export const ContractSign = z
  .object({
    /** Final signed value. Absent = whatever the opportunity carried. */
    amount: MoneyVnd.optional(),
    currency: CurrencyCode.optional(),

    /** When the pen actually moved. Absent = now.
     *
     *  A moment rather than a date, because the column is `timestamptz` and
     *  narrowing to `YYYY-MM-DD` here would force the server to invent a time
     *  of day — which lands on the wrong calendar day for anybody signing after
     *  17:00 in Hanoi once the string is read back as UTC. */
    signedAt: Moment.optional(),

    /** Whose commission. Absent = the first `SALE` owner on the deal. */
    ownerId: z.string().trim().min(1).max(64).optional(),
  })
  .refine((v) => (v.amount === undefined) === (v.currency === undefined), {
    error: 'Số tiền và đồng tiền phải đi cùng nhau',
    path: ['currency'],
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

// ---------------------------------------------------------------------------
// THE READ SHAPE
// ---------------------------------------------------------------------------

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
  amount: MoneyVnd.nullable(),
  currency: CurrencyCode.nullable(),
  signedAt: Moment,
  /** Present together or not at all — an unassigned contract has neither. */
  ownerId: z.string().min(1).max(64).optional(),
  ownerName: textInput(120).optional(),
  /** Absent on a just-signed contract with no schedule drafted yet — the
   *  sign door (`ContractSignResponse`) returns a row before any installment
   *  exists. */
  /* Optional with NO default. A default would make the OUTPUT type required and
     force every mapper to invent an empty array — including the sign door, which
     answers before any schedule exists. Absent means "this response did not load
     the schedule"; an empty array would claim "this contract has none". */
  installments: z.array(InstallmentSummaryRow).optional(),
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
})

/** `GET /sales/contracts` — the book. */
export const ContractBookResponse = paged(ContractRow)

/** `GET /sales/contracts/:code` — one contract, fully nested. */
export const ContractDetailResponse = ContractDetailRow

/** What signing produces, once E3 approves the `contract-sign` request.
 *
 *  BOTH halves, because the caller needs both and neither implies the other.
 *  The opportunity comes back because signing changes how it reads — `state`
 *  flips to `close-won`, `stage` and `daysInStage` go null, `closedAt` is set —
 *  and every one of those is computed, so a screen that patched its own cached
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
export type ContractRow = z.infer<typeof ContractRow>
export type ContractDetailRow = z.infer<typeof ContractDetailRow>
export type ContractBookResponse = z.infer<typeof ContractBookResponse>
export type ContractDetailResponse = z.infer<typeof ContractDetailResponse>

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
