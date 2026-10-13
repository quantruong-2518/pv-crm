import { z } from 'zod'
import { ObjectChainLink, PipelinePositionView } from '../position'
import { Day, Moment, MoneyVnd, textInput } from '../primitives'
import {
  ContractRow,
  ContractSignShape,
  InstallmentStatus,
  InstallmentSummaryRow,
} from './contract'
import { ContractKind, CurrencyCode, StageKey } from './enums'
import { OpportunityContact, OpportunityRow } from './opportunity'
import { QuotationRow } from './quotation'
import { WorkstreamHolder } from './workstream'

/** `GET /sales/opportunities/:code` — the opportunity profile.
 *
 *  Its own file because it reads from both `./opportunity` and `./contract`,
 *  and `./contract` already imports `./opportunity`: keeping the profile there
 *  would close an import cycle that breaks at module load, not at `tsc`.
 *
 *  The verdicts (`acts`) and spans (`stages`) are the server's answer, so no
 *  screen re-derives a rule the door applies (ADR 0076 §4). */

/** The `contract-sign` request waiting on this deal. Required-nullable: `null`
 *  means none, never "not checked", so the screen can disable signing on one read.
 *  `kind`/`amount`/`currency` are the proposal payload's, picked so they cannot drift. */
export const PendingSign = ContractSignShape.pick({
  kind: true,
  amount: true,
  currency: true,
}).extend({
  approvalId: z.string().min(1),
  raisedBy: textInput(120),
  raisedAt: Moment,
})

/** The server's verdict on one door for THIS reader on THIS deal. `reason` is a
 *  Vietnamese sentence the screen prints as-is beside the disabled control. */
export const OpportunityAct = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), reason: z.string().min(1) }),
])

/** One verdict per door the profile offers. `activity`/`quotation` are the
 *  milestone door by kind (ADR 0072 §3). Edit is two verdicts because the rules
 *  differ: `editTerms` (amount, expected close, products) is refused while a sign
 *  request is pending and on won or lost deals — the terms are what is being
 *  signed; `editDetails` (contacts, description, attachments) holds until lost,
 *  and also gates the contacts door. */
export const OpportunityActs = z.object({
  activity: OpportunityAct,
  quotation: OpportunityAct,
  sign: OpportunityAct,
  stop: OpportunityAct,
  accept: OpportunityAct,
  assign: OpportunityAct,
  editTerms: OpportunityAct,
  editDetails: OpportunityAct,
})

/** Time the deal spent in one column. `leftAt: null` with `enteredAt` set is the
 *  current column (`days` counted to now); both null = never entered. */
export const OpportunityStageSpan = z.object({
  key: StageKey,
  enteredAt: Moment.nullable(),
  leftAt: Moment.nullable(),
  days: z.number().int().nonnegative().nullable(),
  limitDays: z.number().int().positive().nullable(),
})

/** One signed paper. Nullable fields are `ContractRow`'s: contracts signed before
 *  a sign request had to name them; `owner: null` = no commission owner set. */
export const OpportunityProfileContract = ContractRow.pick({
  code: true,
  kind: true,
  amount: true,
  currency: true,
  signedAt: true,
  participants: true,
}).extend({ owner: WorkstreamHolder.nullable() })

// ---------------------------------------------------------------------------
// MONEY — quotations, contracts and collection, counted and ordered by the server
// ---------------------------------------------------------------------------

const tally = z.number().int().nonnegative()

/** One currency only (`currency`); money in another is listed below and left
 *  out of these sums. `outstanding` = signed − collected,
 *  so it exceeds overdue + notYetDue while a contract has no schedule. */
export const OpportunityMoneyTotals = z.object({
  currency: CurrencyCode,
  signed: MoneyVnd,
  /** Contracts summed into `signed`: those in `currency`. */
  contracts: tally,
  collected: MoneyVnd,
  /** `collected` over `signed`, whole percent; null when nothing is signed. */
  collectedShare: z.number().int().min(0).max(100).nullable(),
  /** Scheduled installments of those contracts, paid over all. */
  installments: z.object({ paid: tally, total: tally }),
  outstanding: MoneyVnd,
  /** `maxDaysLate`: the oldest overdue installment; null when `count` is 0. */
  overdue: z.object({ amount: MoneyVnd, count: tally, maxDaysLate: tally.nullable() }),
  /** `nearestDays`: days to the next due day; null when `count` is 0. */
  notYetDue: z.object({ amount: MoneyVnd, count: tally, nearestDays: tally.nullable() }),
  /** Sum of the pending rounds that carry an amount. */
  quoting: MoneyVnd,
})

/** A negotiation with no contract yet. `pendingId` is the round the record,
 *  patch and close doors act on (null once closed without signing);
 *  `amount`/`currency` are that round's. `rounds` is newest first. */
export const OpportunityMoneyNegotiation = z.object({
  kind: ContractKind.nullable(),
  negotiationNo: z.number().int().positive(),
  pendingId: z.uuid().nullable(),
  amount: MoneyVnd.nullable(),
  currency: CurrencyCode.nullable(),
  rounds: z.array(QuotationRow),
})

/** `days`: days late when `overdue`, days left when `upcoming`, null when `paid`. */
export const OpportunityMoneyInstallment = InstallmentSummaryRow.extend({
  status: InstallmentStatus,
  days: tally.nullable(),
})

/** One signed paper with its schedule. `installments` empty = no schedule yet;
 *  ordered overdue, then upcoming, then paid. `collectedShare` is whole percent
 *  of `amount`, null when the paper has no amount. `rounds` is newest first. */
export const OpportunityMoneyContract = ContractRow.pick({
  code: true,
  kind: true,
  amount: true,
  currency: true,
  signedAt: true,
}).extend({
  collected: MoneyVnd,
  collectedShare: z.number().int().min(0).max(100).nullable(),
  /** False = this reader is outside the contract's own scope (or lacks
   *  `contract.view`): `installments` is empty and `collected` is zero. */
  paymentsVisible: z.boolean(),
  /** The server's verdict on this contract's schedule and payment doors. */
  can: z.object({ editSchedule: z.boolean(), recordPayment: z.boolean() }),
  installments: z.array(OpportunityMoneyInstallment),
  rounds: z.array(QuotationRow),
  /** Workstream documents per step tag. */
  files: z.object({ quotation: tally, contract: tally, installment: tally }),
})

/** `paymentsVisible` = at least one contract shows its payments to this reader;
 *  false hides the collection tiles. Totals sum only the contracts whose
 *  payments the reader may see; contract headers and rounds ride on
 *  `opportunity.view`. Order is the server's: `open` (pending first), then
 *  `contracts` with an overdue installment, then the rest by newest signing. */
export const OpportunityMoney = z.object({
  paymentsVisible: z.boolean(),
  totals: OpportunityMoneyTotals,
  open: z.array(OpportunityMoneyNegotiation),
  contracts: z.array(OpportunityMoneyContract),
})

export const OpportunityProfileResponse = OpportunityRow.extend({
  position: PipelinePositionView.nullable(),
  pendingSign: PendingSign.nullable(),
  /** Primary first; the same list `PUT …/:code/contacts` replaces. */
  contacts: z.array(OpportunityContact),
  acts: OpportunityActs,
  /** The earliest VN calendar day the milestone door's `at` accepts, per door —
   *  the floor `effectiveAt` applies. `null` = that door is not open. */
  floors: z.object({ activityFrom: Day.nullable(), quotationFrom: Day.nullable() }),
  /** One per `StageKey`, in ladder order. */
  stages: z.array(OpportunityStageSpan).length(StageKey.options.length),
  /** Oldest first; a won deal may sign many. */
  contracts: z.array(OpportunityProfileContract),
  money: OpportunityMoney,
  /** The graph's chain, permission-cut — rule 10: no screen assembles its own. */
  chain: z.array(ObjectChainLink),
})

export type PendingSign = z.infer<typeof PendingSign>
export type OpportunityAct = z.infer<typeof OpportunityAct>
export type OpportunityActs = z.infer<typeof OpportunityActs>
export type OpportunityStageSpan = z.infer<typeof OpportunityStageSpan>
export type OpportunityProfileContract = z.infer<typeof OpportunityProfileContract>
export type OpportunityMoneyTotals = z.infer<typeof OpportunityMoneyTotals>
export type OpportunityMoneyNegotiation = z.infer<typeof OpportunityMoneyNegotiation>
export type OpportunityMoneyInstallment = z.infer<typeof OpportunityMoneyInstallment>
export type OpportunityMoneyContract = z.infer<typeof OpportunityMoneyContract>
export type OpportunityMoney = z.infer<typeof OpportunityMoney>
export type OpportunityProfileResponse = z.infer<typeof OpportunityProfileResponse>
