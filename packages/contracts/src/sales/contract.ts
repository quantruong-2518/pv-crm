import { z } from 'zod'
import { PageQuery, SortDir, paged } from '../pagination'
import { Dong, MaHopDong, MaObject, Moc, Ngay, textNhap } from '../primitives'
import { CurrencyCode } from './enums'
import { OpportunityRow } from './opportunity'

/** Signing a deal — the door that makes `close-won` true.
 *
 *      POST /sales/opportunities/:code/contract     permission `cơ-hội.chốt`
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
 *  THE PERMISSION IS `cơ-hội.chốt`, AND THIS IS THE ONLY ROUTE THAT USES IT
 *  ------------------------------------------------------------------
 *  Until now that permission existed in E2, was tested in `actors.test.ts`, and
 *  guarded nothing — the three write doors on the Ops book all ask for
 *  `cơ-hội.sửa`. `OpportunityController`'s docblock already drew the line and
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
 *  It gets its own primitive instead of reusing `MaObject`, and the reason is
 *  one character: `MaObject` is `^[A-Z]{1,3}-\d{3,6}$`, and `Đ` is not in
 *  `A-Z`. The frozen book has carried `HĐ-27NN` since long before this door
 *  existed — `seed.ts` derives the six won deals' opportunity codes from those
 *  very strings — so the prefix is data that already exists, not a naming
 *  choice open today.
 *
 *  The consequence worth knowing: a contract code does NOT satisfy `MaObject`,
 *  so it cannot be passed to any route that validates a path param with it.
 *  Nothing does today, and this comment is here so the day something wants to
 *  it gets a widened `MaObject` rather than a quietly renamed prefix.
 *
 *  The declaration itself lives in `primitives.ts`, one directory up. It moved
 *  the day `OpportunityRow` grew a `contractCode`: this module already imports
 *  `./opportunity` to build `ContractSignResponse`, so importing back would
 *  close a module cycle that dies on load. The reasoning is written out where
 *  the declaration now stands. */

// ---------------------------------------------------------------------------
// THE REQUEST
// ---------------------------------------------------------------------------

/** STILL CARRIES `amount`/`currency`, and that is a deliberate hold.
 *
 *  §2.2 of `docs/tam-nhin-bao-gia-hop-dong.md` removes both: signing becomes
 *  picking an accepted quote, and the money is read from it, so that "what is
 *  this contract worth" has exactly one source. That cut cannot happen on this
 *  branch — it needs a quote to point at, and `sales.quote` is being built in
 *  parallel. Cutting the fields now would leave the sign door with no way to
 *  record a number at all.
 *
 *  So it happens in the merge pass, and it is BREAKING by design: `pnpm check`
 *  must go red at every import of this shape. Green with nothing edited means a
 *  cast is hiding it — grep again. */
export const ContractSign = z
  .object({
    /** Final signed value. Absent = whatever the opportunity carried. */
    amount: Dong.optional(),
    currency: CurrencyCode.optional(),

    /** When the pen actually moved. Absent = now.
     *
     *  A moment rather than a date, because the column is `timestamptz` and
     *  narrowing to `YYYY-MM-DD` here would force the server to invent a time
     *  of day — which lands on the wrong calendar day for anybody signing after
     *  17:00 in Hanoi once the string is read back as UTC. */
    signedAt: Moc.optional(),

    /** Whose commission. Absent = the first `SALE` owner on the deal. */
    ownerId: z.string().trim().min(1).max(64).optional(),
  })
  .refine((v) => (v.amount === undefined) === (v.currency === undefined), {
    error: 'Số tiền và đồng tiền phải đi cùng nhau',
    path: ['currency'],
  })

// ---------------------------------------------------------------------------
// THE READ SHAPE
// ---------------------------------------------------------------------------

/** One signed contract, as a screen prints it. */
export const ContractRow = z.object({
  code: MaHopDong,
  opportunityCode: MaObject,
  leadCode: MaObject,
  /** The accepted quote this contract's money was copied from.
   *
   *  `null` on the six contracts that predate module 4 and, TODAY, on every
   *  row: the column behind it lands with `drizzle/sau-merge/contract_quote_link.sql`,
   *  which cannot be applied until `sales.quote` exists — that table is being
   *  built in parallel on `feat/module-4-bao-gia`. The field is declared now so
   *  the wire shape does not change under the screens a second time; the mapper
   *  answers `null` until the column is there, and `contract.mapper.ts` says so
   *  at the line that does it.
   *
   *  Nullable rather than optional, unlike `ownerId`: "this contract has no
   *  quote behind it" is a fact about the row that a reader has to be able to
   *  see, not a field that happens to be missing. */
  quoteCode: MaObject.nullable(),
  amount: Dong.nullable(),
  currency: CurrencyCode.nullable(),
  signedAt: Moc,
  /** Present together or not at all — an unassigned contract has neither. */
  ownerId: z.string().min(1).max(64).optional(),
  ownerName: textNhap(120).optional(),
})

/** What the sign door answers with.
 *
 *  BOTH halves, because the caller needs both and neither implies the other.
 *  The opportunity comes back because signing changes how it reads — `state`
 *  flips to `close-won`, `stage` and `daysInStage` go null, `closedAt` is set —
 *  and every one of those is computed, so a screen that patched its own cached
 *  row would get a different answer than the next `GET`. The contract comes
 *  back because the number the server just minted exists nowhere else yet, and
 *  making the caller re-read to learn it is the same round trip twice. */
export const ContractSignResponse = z.object({
  opportunity: OpportunityRow,
  contract: ContractRow,
})

// ---------------------------------------------------------------------------
// PAYMENT TERMS — `sales.contract_payment_term`
// ---------------------------------------------------------------------------

/** Where one instalment stands. Two values, and there is no third on purpose.
 *
 *  There is no "overdue": overdue is `dueDate` earlier than today, computed
 *  when the screen draws. A value that moves with the clock does not belong in
 *  a stored field — the mistake `docs/ban-giao-db.md` fixed once already. */
export const ContractTermStatus = z.enum(['cho-thu', 'da-thu'])

/** One instalment on the contract paper. */
export const ContractTermRow = z.object({
  /** Which instalment, as printed. Assigned by the server, never sent up: two
   *  tabs both claiming to add "instalment 2" is the primary-key race that
   *  `OpportunityCreate` avoids by not carrying its own code either. */
  termNo: z.number().int().positive(),
  label: textNhap(120),
  amount: Dong,
  dueDate: Ngay.nullable(),
  paidAt: Moc.nullable(),
  status: ContractTermStatus,
})

/** Adding an instalment to the plan.
 *
 *  No `status` and no `paidAt`, and the absence is the design rather than a
 *  short form: the table pins the pair with
 *  `CHECK ("paid_at" IS NULL) = ("status" = 'cho-thu')`, so a body carrying
 *  either one is a body that can disagree with the other. A plan is written
 *  unpaid, and money arriving is the PATCH below. */
export const ContractTermDraft = z.object({
  label: textNhap(120),
  amount: Dong,
  /** Absent = no date yet. "The last instalment, on acceptance" is a real
   *  instalment with no date, and demanding one invites an invented date that
   *  the whole book then chases money by. */
  dueDate: Ngay.optional(),
})

/** Changing one instalment. `termNo` says which; everything else is optional.
 *
 *  In the BODY rather than the path, so the route stays `.../contracts/:code/terms`
 *  for both doors: an instalment is not addressable on its own — it exists only
 *  as a line of one contract, and its key is the pair.
 *
 *  `status` is absent here too, and `paidAt` carries the whole answer:
 *  `null` clears the payment, a moment records it, absent leaves it alone. The
 *  server derives `status` from it, which is the only way the pinned pair
 *  cannot be handed two conflicting halves. */
export const ContractTermPatch = z.object({
  termNo: z.number().int().positive(),
  label: textNhap(120).optional(),
  amount: Dong.optional(),
  dueDate: Ngay.nullable().optional(),
  paidAt: Moc.nullable().optional(),
})

// ---------------------------------------------------------------------------
// THE CONTRACT BOOK — `GET /sales/contracts`
// ---------------------------------------------------------------------------

/** A row of the contract book, and of the contract card on a deal profile.
 *
 *  ONE shape for both, carrying the instalments inline rather than a summary
 *  ("3 instalments, 30% collected") plus a second endpoint for the detail. The
 *  summary is three fields the server would have to aggregate in SQL and the
 *  screen would have to re-derive anyway to draw the list; the list itself is
 *  one extra query per PAGE, read the way `OpportunityRepository.ownersOf`
 *  reads owners, and it answers both of the book's questions — what was signed
 *  this month, and which instalment falls due next — without a second shape
 *  that can disagree with the first.
 *
 *  `account` rides along because the book prints the CUSTOMER, not the lead
 *  code. Same reason `OpportunityRead` carries it. */
export const ContractBookRow = ContractRow.extend({
  account: textNhap(200),
  terms: z.array(ContractTermRow),
})

export const ContractSortKey = z.enum(['signedAt', 'amount', 'code'])

/** What `GET /sales/contracts` accepts.
 *
 *  Deliberately narrower than `OpportunityBookQuery`: this book is READ ONLY
 *  and it is new, so it starts with the controls the screen actually draws — a
 *  search box and a sortable header — rather than a filter row copied over from
 *  a screen that earned each of its filters. Adding one later is one field
 *  here and one branch in the repository; shipping five nobody uses is five
 *  code paths nobody tests.
 *
 *  `amount` is nullable on six old rows, so its blanks sort LAST in BOTH
 *  directions, for the reason `OpportunityBookQuery` writes out: a contract
 *  nobody priced is not the cheapest one. */
export const ContractBookQuery = PageQuery.extend({
  /** Free text over the contract code, the deal code and the customer name —
   *  the three things somebody pastes into one box. */
  q: z.string().trim().min(1).max(120).optional(),
  sort: ContractSortKey.default('signedAt'),
  dir: SortDir.default('desc'),
})

export const ContractBookResponse = paged(ContractBookRow)

export type ContractSign = z.infer<typeof ContractSign>
export type ContractRow = z.infer<typeof ContractRow>
export type ContractSignResponse = z.infer<typeof ContractSignResponse>
export type ContractTermStatus = z.infer<typeof ContractTermStatus>
export type ContractTermRow = z.infer<typeof ContractTermRow>
export type ContractTermDraft = z.infer<typeof ContractTermDraft>
export type ContractTermPatch = z.infer<typeof ContractTermPatch>
export type ContractBookRow = z.infer<typeof ContractBookRow>
export type ContractSortKey = z.infer<typeof ContractSortKey>
export type ContractBookQuery = z.infer<typeof ContractBookQuery>
export type ContractBookResponse = z.infer<typeof ContractBookResponse>
