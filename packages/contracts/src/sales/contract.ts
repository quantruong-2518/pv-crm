import { z } from 'zod'
import { Dong, MaObject, Moc, textNhap } from '../primitives'
import { CurrencyCode } from './enums'
import { OpportunityRow } from './opportunity'

/** Signing a deal — the door that makes `close-won` true.
 *
 *      POST /sales/ops/:code/contract     permission `cơ-hội.chốt`
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
 *  it gets a widened `MaObject` rather than a quietly renamed prefix. */
export const MaHopDong = z
  .string()
  .trim()
  .regex(/^HĐ-\d{3,6}$/, 'Mã hợp đồng sai dạng')

export type MaHopDong = z.infer<typeof MaHopDong>

// ---------------------------------------------------------------------------
// THE REQUEST
// ---------------------------------------------------------------------------

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

export type ContractSign = z.infer<typeof ContractSign>
export type ContractRow = z.infer<typeof ContractRow>
export type ContractSignResponse = z.infer<typeof ContractSignResponse>
