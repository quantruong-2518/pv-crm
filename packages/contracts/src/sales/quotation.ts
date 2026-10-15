import { z } from 'zod'
import { ContractCode, Day, Moment, MoneyVnd, ObjectCode, textInputOptional } from '../primitives'
import { ConfigCode } from './config'
import { ContractKind, CurrencyCode } from './enums'
import {
  OPPORTUNITY_STAGE_NOTE_MAX,
  OPPORTUNITY_STOP_NOTE_MAX,
  OPPORTUNITY_STOP_REASON_OTHER,
} from './opportunity'

/** Quotation ledger — one `sales.quotation` row per send (ADR 0090).
 *
 *      POST  /sales/opportunities/:code/quotations             `opportunity.edit` · scoped
 *      PATCH /sales/opportunities/:code/quotations/:id         same · a pending round only
 *      POST  /sales/opportunities/:code/quotations/:id/close   same · a pending round only
 *      GET   /sales/opportunities/quotation-reasons            `opportunity.edit` · unscoped
 *      GET   /sales/opportunities/contract-kinds               same · unscoped
 *
 *  The three writes answer `QuotationRow`. A NEGOTIATION is the rounds sharing
 *  (opportunity, kind, `negotiationNo`) and holds at most ONE `pending` round —
 *  so recording over one must say why the old one did not close. Both numbers
 *  are minted by the server under the deal lock; no body carries them. */

export const QuotationOutcome = z.enum(
  ['pending', 'won', 'not-closed'],
  'Kết quả không có trong danh sách',
)

export const QUOTATION_OUTCOME_LABEL: Record<QuotationOutcome, string> = {
  pending: 'Chờ khách',
  won: 'Thắng',
  'not-closed': 'Không chốt',
}

/** Who wrote the row. Only `manual` is guaranteed a kind and an amount. */
export const QuotationSource = z.enum(['manual', 'mail', 'backfill'])

/** A `QUOTE_REVISION_REASON` id, or the virtual `other` (same key as the stop door). */
export const QuotationReasonId = z.union(
  [ConfigCode, z.literal(OPPORTUNITY_STOP_REASON_OTHER)],
  'Chọn lý do.',
)

/** Why a pending round ends `not-closed`. The server checks the id is an ACTIVE
 *  entry of the list; the contract only guarantees `other` came with a sentence. */
export const QuotationReason = z
  .object({
    reasonId: QuotationReasonId,
    note: textInputOptional(OPPORTUNITY_STOP_NOTE_MAX),
  })
  .refine((v) => v.reasonId !== OPPORTUNITY_STOP_REASON_OTHER || v.note !== undefined, {
    error: 'Chọn "Khác" thì phải ghi lý do.',
    path: ['note'],
  })

// ---------------------------------------------------------------------------
// READ
// ---------------------------------------------------------------------------

/** One round. `kind`/`amount`/`currency` are null only on a `mail` or `backfill`
 *  row nobody completed yet; amount and currency are null together. */
export const QuotationRow = z.object({
  id: z.uuid(),
  opportunityCode: ObjectCode,
  kind: ContractKind.nullable(),
  negotiationNo: z.number().int().positive(),
  roundNo: z.number().int().positive(),
  amount: MoneyVnd.nullable(),
  currency: CurrencyCode.nullable(),
  sentAt: Moment,
  /** Display only: a round past this day stays `pending` until someone closes it. */
  validUntil: Day.nullable(),
  source: QuotationSource,
  outcome: QuotationOutcome,
  /** Null exactly while `pending`. */
  closedAt: Moment.nullable(),
  /** Resolved server-side from the revision reason or, when the deal was stopped,
   *  the stop reason. Null while pending, on `won`, and on a backfilled close. */
  reasonLabel: z.string().min(1).nullable(),
  /** The sentence typed with the reason (`reason_note`). */
  note: z.string().min(1).nullable(),
  /** Set on every round of a signed negotiation, not only the `won` one. */
  contractCode: ContractCode.nullable(),
  /** Workstream documents tagged with this round. */
  files: z.number().int().nonnegative(),
  /** Pending and past `validUntil` on the server's VN today; display only. */
  expired: z.boolean(),
})

// ---------------------------------------------------------------------------
// WRITE
// ---------------------------------------------------------------------------

export const QuotationParams = z.object({ code: ObjectCode, id: z.uuid() })

/** `POST …/:code/quotations`. `sentAt` absent = now. Two rules need the row, so
 *  the server judges them: `validUntil` is not before the VN day of `sentAt`, and
 *  `supersede` is REQUIRED (409 without it) when the negotiation has a pending round. */
export const QuotationRecordBody = z.object({
  kind: ContractKind,
  amount: MoneyVnd,
  currency: CurrencyCode,
  sentAt: Moment.optional(),
  validUntil: Day.optional(),
  /** Printed on the timeline row that rides with the send. */
  note: textInputOptional(OPPORTUNITY_STAGE_NOTE_MAX),
  supersede: QuotationReason.optional(),
})

/** `PATCH …/:code/quotations/:id` — fill what a `mail` or `backfill` round is
 *  missing. Absent = untouched; refused once the round is no longer pending. */
export const QuotationPatchBody = z
  .object({
    kind: ContractKind.optional(),
    amount: MoneyVnd.optional(),
    currency: CurrencyCode.optional(),
    validUntil: Day.optional(),
  })
  .refine((p) => Object.values(p).some((v) => v !== undefined), {
    error: 'Không có gì để sửa.',
  })
  .refine((p) => (p.amount === undefined) === (p.currency === undefined), {
    error: 'Nhập cả giá trị và đơn vị tiền.',
    path: ['currency'],
  })

/** `POST …/:code/quotations/:id/close` — the pending round ends `not-closed`
 *  and the deal keeps its state (a won deal has no stop door). */
export const QuotationCloseBody = QuotationReason

export const QuotationRecordResponse = QuotationRow
export const QuotationPatchResponse = QuotationRow
export const QuotationCloseResponse = QuotationRow

/** `GET …/quotation-reasons` — the ACTIVE entries, in catalogue order, for a
 *  writer who holds no `config.view`. `other` is virtual and not listed. */
export const QuotationReasonsResponse = z.object({
  rows: z.array(z.object({ id: ConfigCode, name: z.string().min(1) })),
})

/** `GET …/contract-kinds` — every `CONTRACT_KIND` entry in catalogue order,
 *  retired ones too, so a kind hidden after it was stored still has a name. */
export const ContractKindsResponse = z.object({
  rows: z.array(
    z.object({
      id: ContractKind,
      name: z.string().min(1),
      active: z.boolean(),
      ord: z.number().int().positive(),
    }),
  ),
})

export type QuotationOutcome = z.infer<typeof QuotationOutcome>
export type QuotationSource = z.infer<typeof QuotationSource>
export type QuotationReasonId = z.infer<typeof QuotationReasonId>
export type QuotationReason = z.infer<typeof QuotationReason>
export type QuotationRow = z.infer<typeof QuotationRow>
export type QuotationParams = z.infer<typeof QuotationParams>
export type QuotationRecordBody = z.infer<typeof QuotationRecordBody>
export type QuotationPatchBody = z.infer<typeof QuotationPatchBody>
export type QuotationCloseBody = z.infer<typeof QuotationCloseBody>
export type QuotationRecordResponse = z.infer<typeof QuotationRecordResponse>
export type QuotationPatchResponse = z.infer<typeof QuotationPatchResponse>
export type QuotationCloseResponse = z.infer<typeof QuotationCloseResponse>
export type QuotationReasonsResponse = z.infer<typeof QuotationReasonsResponse>
export type ContractKindsResponse = z.infer<typeof ContractKindsResponse>
