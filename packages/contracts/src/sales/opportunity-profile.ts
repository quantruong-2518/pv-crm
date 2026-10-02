import { z } from 'zod'
import { ObjectChainLink, PipelinePositionView } from '../position'
import { Day, Moment, MoneyVnd, textInput } from '../primitives'
import { ContractRow, ContractSign } from './contract'
import { CurrencyCode, StageKey } from './enums'
import { OpportunityContact, OpportunityRow } from './opportunity'
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
export const PendingSign = ContractSign.pick({ kind: true, amount: true, currency: true }).extend({
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
}).extend({ owner: WorkstreamHolder.nullable() })

/** Sum of the signed contracts in the DEAL's currency — display-only; the deal's
 *  `amount` stays the estimate. Other currencies are listed, never converted
 *  into this sum. `null` = no contract in that currency. */
export const OpportunitySignedTotal = z.object({
  amount: MoneyVnd,
  currency: CurrencyCode,
  count: z.number().int().positive(),
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
  signedTotal: OpportunitySignedTotal.nullable(),
  /** The graph's chain, permission-cut — rule 10: no screen assembles its own. */
  chain: z.array(ObjectChainLink),
})

export type PendingSign = z.infer<typeof PendingSign>
export type OpportunityAct = z.infer<typeof OpportunityAct>
export type OpportunityActs = z.infer<typeof OpportunityActs>
export type OpportunityStageSpan = z.infer<typeof OpportunityStageSpan>
export type OpportunityProfileContract = z.infer<typeof OpportunityProfileContract>
export type OpportunitySignedTotal = z.infer<typeof OpportunitySignedTotal>
export type OpportunityProfileResponse = z.infer<typeof OpportunityProfileResponse>
