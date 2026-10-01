import { z } from 'zod'
import { ApprovalState } from '../approval'
import { ContractCode, Day, Moment, MoneyVnd, ObjectCode, textInput } from '../primitives'
import { DocState, InstallmentSummaryRow } from './contract'
import {
  ContractKind,
  DueLevel,
  LeadState,
  OPPORTUNITY_STATE_LABEL,
  OpportunityStatus,
  StageKey,
  WorkstreamCloseReason,
} from './enums'
import { NextStep } from './next-step'
import { OPPORTUNITY_STOP_NOTE_MAX } from './opportunity'
import { LEAD_LANE_BACKBONE, WorkstreamHolder } from './workstream'

/** Journey detail — the rebuilt read of `/sales/workstreams/:code` (canvas row E).
 *
 *  The door at `GET /sales/workstreams/:code` sends exactly this shape; the
 *  old lane-based profile response is gone.
 *
 *  One journey = one lead, n deals, n contracts per deal; journeys link as a
 *  tree (one previous, many next). Rung LABELS never travel: every key maps
 *  through a table declared once (`LEAD_STATE_LABEL`, `OPPORTUNITY_STAGE_LABEL`,
 *  `CONTRACT_RUNG_LABEL`), so no two screens spell one state two ways. */

// ---------------------------------------------------------------------------
// SMALL VOCABULARIES
// ---------------------------------------------------------------------------

/** `growth` = every contract reached `done`; `closed` pairs with a
 *  `WorkstreamCloseReason`, and its badge prints `CLOSE_REASON_LABEL`. */
export const JourneyStatus = z.enum(
  ['open', 'growth', 'closed'],
  'Trạng thái hành trình không có trong danh sách',
)

/** Only the two statuses without a close reason carry a label of their own. */
export const JOURNEY_STATUS_LABEL = {
  open: 'Đang chạy',
  growth: 'Tăng trưởng',
} as const satisfies Record<Exclude<JourneyStatus, 'closed'>, string>

/** How a journey was born from the one before it. A journey with no previous
 *  link came from fresh intake, so intake is the absence of a link, not a value. */
export const JourneyBornBy = z.enum(['growth', 'wake'], 'Cách nối không có trong danh sách')

export const JOURNEY_BORN_BY_LABEL: Record<JourneyBornBy, string> = {
  growth: JOURNEY_STATUS_LABEL.growth,
  wake: 'Đánh thức lại',
}

/** The deal's own outcome, same words as `OpportunityStatus`. A stop is final;
 *  the lead goes back to nurturing only when no deal is left alive and none
 *  signed — that is the lead's fact, not this deal's. */
export const JourneyDealOutcome = OpportunityStatus

/** Borrowed words only — no new name for a state the product already names. */
export const JOURNEY_DEAL_OUTCOME_LABEL: Record<JourneyDealOutcome, string> = {
  open: OPPORTUNITY_STATE_LABEL.open,
  won: OPPORTUNITY_STATE_LABEL.won,
  lost: OPPORTUNITY_STATE_LABEL.lost,
}

/** One state set for all three ladders. `skipped` is a rung this object never
 *  used (a deal that jumped past `sample`, a licence with no deployment) —
 *  drawn as skipped, never as a dateless `done`; `stopped` is where it stopped. */
export const JourneyRungState = z.enum(
  ['done', 'current', 'skipped', 'upcoming', 'stopped'],
  'Trạng thái bậc không có trong danh sách',
)

/** One ladder for every contract kind; a rung a kind does not use is skipped. */
export const ContractRungKey = z.enum(
  ['signed', 'deploy', 'accept', 'collect', 'done'],
  'Bậc hợp đồng không có trong danh sách',
)

export const CONTRACT_RUNG_LABEL: Record<ContractRungKey, string> = {
  signed: 'Đã ký',
  deploy: 'Triển khai',
  accept: 'Nghiệm thu',
  collect: 'Thu tiền',
  done: 'Hoàn tất',
}

export const LeadBackboneKey = z.enum(LEAD_LANE_BACKBONE)

/** Any rung of any ladder — what a continuation door says it left from. */
export const JourneyRungKey = z.union([LeadBackboneKey, StageKey, ContractRungKey])

// ---------------------------------------------------------------------------
// PARTS
// ---------------------------------------------------------------------------

/** One chip on the ContextRail. `bornBy` names the edge between this journey
 *  and the linked one, whichever side it sits on. */
export const JourneyLink = z.object({
  code: ObjectCode,
  ordinal: z.number().int().positive(),
  bornBy: JourneyBornBy,
  status: JourneyStatus,
  closeReason: WorkstreamCloseReason.nullable(),
})

/** The server's next step itself, not a copy (`./next-step`). */
export const JourneyNextAction = NextStep

/** A drawer-only step under a rung — as-is, a contract's deployment milestone.
 *  `due` is the promised or planned day. */
export const JourneySubStep = z.object({
  label: textInput(200),
  state: JourneyRungState,
  at: Moment.nullable(),
  due: Moment.nullable(),
  note: textInput(500).nullable(),
  dueLevel: DueLevel.nullable(),
})

/** A deal-rung sub-step — exactly two kinds this turn, both under `quotation`:
 *  one per `quotation-sent` touch (`round` = n, the n-th send) and one per
 *  `contract-sign` approval (`decision` is E3's state; a won deal signing again
 *  adds another). Discount approval waits for a quote
 *  object; POC steps ride on next steps. */
export const JourneyDealSubStep = z.discriminatedUnion('kind', [
  JourneySubStep.extend({
    kind: z.literal('quote-sent'),
    round: z.number().int().positive(),
  }),
  JourneySubStep.extend({
    kind: z.literal('sign-approval'),
    approvalId: z.string().min(1),
    decision: ApprovalState,
  }),
])

/** `days` is recorded for a finished rung and counted to now for `current`. */
const JourneyRungBase = z.object({
  state: JourneyRungState,
  at: Moment.nullable(),
  by: WorkstreamHolder.nullable(),
  days: z.number().int().nonnegative().nullable(),
})

export const JourneyLeadRung = JourneyRungBase.extend({ key: LeadBackboneKey })

/** `dueLevel` is time-in-rung against `limitDays`, graded on the one due ladder
 *  (flow G3) by the sender — no screen re-derives "late" from `days`. Null
 *  unless the rung is `current` and its stage has a limit. */
export const JourneyDealRung = JourneyRungBase.extend({
  key: StageKey,
  limitDays: z.number().int().positive().nullable(),
  dueLevel: DueLevel.nullable(),
  subSteps: z.array(JourneyDealSubStep),
})

export const JourneyContractRung = JourneyRungBase.extend({ key: ContractRungKey })

/** Holder is null while the lead sits in the pool. How it was born lives on
 *  the response's `previous` link — one journey, one lead, one origin. */
export const JourneyLead = z.object({
  code: ObjectCode,
  /** Stored state, so a stopped rung can say which stop it is: parked in
   *  `nurturing` or ended in `disqualified`. */
  state: LeadState,
  holder: WorkstreamHolder.nullable(),
  rungs: z.array(JourneyLeadRung).length(LEAD_LANE_BACKBONE.length),
})

/** The fail log of a lost deal (ADR 0069 §1). A lost deal draws no waiting
 *  door — only the lead parks, and only when its last live deal is lost. */
export const JourneyDealStop = z.object({
  reason: textInput(200),
  note: textInput(OPPORTUNITY_STOP_NOTE_MAX).nullable(),
  doNotContact: z.boolean().nullable(),
  concludedBy: WorkstreamHolder.nullable(),
})

export const JourneyDeal = z.object({
  code: ObjectCode,
  name: textInput(200),
  holder: WorkstreamHolder.nullable(),
  /** The head who took the deal off the queue (ADR 0071), drawn on the
   *  `assigned` rung — the rung's own `by` is whoever moved it, which differs
   *  on migrated deals. */
  acceptedBy: WorkstreamHolder.nullable(),
  acceptedAt: Moment.nullable(),
  amount: MoneyVnd.nullable(),
  expectedClose: Day.nullable(),
  outcome: JourneyDealOutcome,
  outcomeAt: Moment.nullable(),
  rungs: z.array(JourneyDealRung).length(StageKey.options.length),
  nextAction: JourneyNextAction.nullable(),
  /** A list, not one code: a won deal may sign again (licence beside deployment). */
  contractCodes: z.array(ContractCode),
  /** Set exactly when `outcome` is `lost`; the rung is the `stopped` one. */
  stop: JourneyDealStop.nullable(),
})

/** Invoice fields are RECORDED only — this system does not issue invoices. */
export const JourneyInstallment = InstallmentSummaryRow.extend({
  invoiceNo: textInput(40).nullable(),
  invoicedAt: Moment.nullable(),
  paidAt: Moment.nullable(),
  paidAmount: MoneyVnd.nullable(),
  dueLevel: DueLevel,
})

export const JourneyAcceptance = z.object({
  label: textInput(200),
  state: DocState,
  at: Moment.nullable(),
})

/** Rung detail sits flat on the contract, one field per rung that has any:
 *  `milestones` → deploy, `acceptance` → accept, `installments` → collect,
 *  `licence` → done. `implementer` is null for kinds that never deploy. */
export const JourneyContract = z.object({
  code: ContractCode,
  dealCode: ObjectCode,
  // Null only on contracts signed before a sign request had to name its kind.
  kind: ContractKind.nullable(),
  amount: MoneyVnd.nullable(),
  signedAt: Moment,
  holder: WorkstreamHolder.nullable(),
  implementer: WorkstreamHolder.nullable(),
  rungs: z.array(JourneyContractRung).length(ContractRungKey.options.length),
  milestones: z.array(JourneySubStep),
  acceptance: z.array(JourneyAcceptance),
  installments: z.array(JourneyInstallment),
  licence: z.object({ from: Day, to: Day }).nullable(),
})

/** Where a continuation hangs: the object and rung that produced it. */
export const JourneyDoorAnchor = z.object({
  code: z.union([ObjectCode, ContractCode]),
  rung: JourneyRungKey,
})

/** The lead's park only — a lost deal carries its own `stop` instead. `reason`
 *  is a catalogue name, never a raw config id. `concludedBy` is null when the
 *  machine parked the lead (flow C5: a campaign ended with no real exchange). */
export const JourneyWaitingDoor = z.object({
  kind: z.literal('waiting'),
  leadCode: ObjectCode,
  from: JourneyDoorAnchor,
  at: Moment,
  reason: textInput(200),
  concludedBy: WorkstreamHolder.nullable(),
  // Null when the reason is not in the catalogue; `false` would claim a
  // permission nobody gave.
  doNotContact: z.boolean().nullable(),
  campaignName: textInput(120).nullable(),
  lastTouch: z.object({ at: Moment, text: textInput(300) }).nullable(),
})

/** `decidedBy` is also the new lead's holder — whoever decides growth keeps it. */
export const JourneyGrowthDoor = z.object({
  kind: z.literal('growth'),
  journeyCode: ObjectCode,
  leadCode: ObjectCode,
  from: JourneyDoorAnchor,
  at: Moment,
  need: textInput(500),
  decidedBy: WorkstreamHolder,
})

export const JourneyDoor = z.discriminatedUnion('kind', [JourneyWaitingDoor, JourneyGrowthDoor])

// ---------------------------------------------------------------------------
// THE READ SHAPE
// ---------------------------------------------------------------------------

/** `closeReason` is set exactly when `status` is `closed` — the same pairing
 *  `sales.workstream`'s CHECK holds for `closedAt`. */
export const WorkstreamJourneyResponse = z
  .object({
    code: ObjectCode,
    ordinal: z.number().int().positive(),
    customer: textInput(200),
    accountCode: ObjectCode.nullable(),
    status: JourneyStatus,
    closeReason: WorkstreamCloseReason.nullable(),
    openedAt: Moment,
    closedAt: Moment.nullable(),
    previous: JourneyLink.nullable(),
    next: z.array(JourneyLink),
    lead: JourneyLead,
    deals: z.array(JourneyDeal),
    // Deals of this run the reader's ownOnly scope cut out; the screen says so.
    hiddenDeals: z.number().int().nonnegative(),
    contracts: z.array(JourneyContract),
    doors: z.array(JourneyDoor),
  })
  .refine((v) => (v.status === 'closed') === (v.closeReason !== null), {
    error: 'Lý do đóng chỉ có khi hành trình đã đóng',
    path: ['closeReason'],
  })

export type JourneyStatus = z.infer<typeof JourneyStatus>
export type JourneyBornBy = z.infer<typeof JourneyBornBy>
export type JourneyDealOutcome = z.infer<typeof JourneyDealOutcome>
export type JourneyRungState = z.infer<typeof JourneyRungState>
export type ContractRungKey = z.infer<typeof ContractRungKey>
export type LeadBackboneKey = z.infer<typeof LeadBackboneKey>
export type JourneyRungKey = z.infer<typeof JourneyRungKey>
export type JourneyLink = z.infer<typeof JourneyLink>
export type JourneyNextAction = z.infer<typeof JourneyNextAction>
export type JourneySubStep = z.infer<typeof JourneySubStep>
export type JourneyDealSubStep = z.infer<typeof JourneyDealSubStep>
export type JourneyLeadRung = z.infer<typeof JourneyLeadRung>
export type JourneyDealRung = z.infer<typeof JourneyDealRung>
export type JourneyContractRung = z.infer<typeof JourneyContractRung>
export type JourneyLead = z.infer<typeof JourneyLead>
export type JourneyDeal = z.infer<typeof JourneyDeal>
export type JourneyDealStop = z.infer<typeof JourneyDealStop>
export type JourneyInstallment = z.infer<typeof JourneyInstallment>
export type JourneyAcceptance = z.infer<typeof JourneyAcceptance>
export type JourneyContract = z.infer<typeof JourneyContract>
export type JourneyDoorAnchor = z.infer<typeof JourneyDoorAnchor>
export type JourneyWaitingDoor = z.infer<typeof JourneyWaitingDoor>
export type JourneyGrowthDoor = z.infer<typeof JourneyGrowthDoor>
export type JourneyDoor = z.infer<typeof JourneyDoor>
export type WorkstreamJourneyResponse = z.infer<typeof WorkstreamJourneyResponse>
