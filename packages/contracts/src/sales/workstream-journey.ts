import { z } from 'zod'
import { ContractCode, Day, Moment, MoneyVnd, ObjectCode, textInput } from '../primitives'
import { DocState, InstallmentSummaryRow } from './contract'
import { LEAD_STATE_LABEL, OPPORTUNITY_STATE_LABEL, StageKey, WorkstreamCloseReason } from './enums'
import { LEAD_LANE_BACKBONE, WorkstreamHolder } from './workstream'

/** Journey detail — the rebuilt read of `/sales/workstreams/:code` (canvas row E).
 *
 *  A SEPARATE schema from `WorkstreamProfileResponse` on purpose: the API still
 *  produces the old profile, and the new screen reads this shape from the sao-do
 *  scenario mock until a door exists for it.
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

/** `waiting` = the deal stopped and its lead went to the waiting list. No `care`
 *  and no `lost`: under the journey rules every stop becomes a waiting lead. */
export const JourneyDealOutcome = z.enum(
  ['open', 'won', 'waiting'],
  'Kết quả cơ hội không có trong danh sách',
)

/** Borrowed words only — no new name for a state the product already names. */
export const JOURNEY_DEAL_OUTCOME_LABEL: Record<JourneyDealOutcome, string> = {
  open: OPPORTUNITY_STATE_LABEL.open,
  won: OPPORTUNITY_STATE_LABEL.won,
  waiting: LEAD_STATE_LABEL.nurturing,
}

/** One state set for all three ladders. `skipped` is a rung this object's type
 *  never uses (a licence has no deployment) — drawn as skipped, never as a
 *  dateless `done`; `stopped` is the rung where the object went to waiting. */
export const JourneyRungState = z.enum(
  ['done', 'current', 'skipped', 'upcoming', 'stopped'],
  'Trạng thái bậc không có trong danh sách',
)

/** A catalogue of contract types; which rungs a kind skips rides on the rungs. */
export const ContractKind = z.enum(
  ['licence', 'deployment', 'training'],
  'Loại hợp đồng không có trong danh sách',
)

export const CONTRACT_KIND_LABEL: Record<ContractKind, string> = {
  licence: 'Bản quyền',
  deployment: 'Triển khai',
  training: 'Đào tạo',
}

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

/** Mirror of `DueLevel` in `packages/engines/src/contract-due.ts` — contracts may
 *  not import engines, so the two lists must be kept equal by hand (the type-level
 *  equality check belongs on a side that can import both). Sent server-computed
 *  because the server sweeps by its own today, not the browser's clock. */
export const DueLevel = z.enum(
  ['done', 'upcoming', 'due-soon', 'due', 'overdue', 'long-overdue'],
  'Mức hạn không có trong danh sách',
)

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

/** Optional by design (flow G2): absent is not a warning. */
export const JourneyNextAction = z.object({
  text: textInput(200),
  due: Day,
  doer: WorkstreamHolder,
  dueLevel: DueLevel,
})

/** A drawer-only step under a rung: quote sends, approvals, POC steps, and a
 *  contract's deployment milestones. `due` is the promised or planned day. */
export const JourneySubStep = z.object({
  label: textInput(200),
  state: JourneyRungState,
  at: Moment.nullable(),
  due: Moment.nullable(),
  note: textInput(300).nullable(),
  dueLevel: DueLevel.nullable(),
})

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
  subSteps: z.array(JourneySubStep),
})

export const JourneyContractRung = JourneyRungBase.extend({ key: ContractRungKey })

/** Holder is null while the lead sits in the pool. How it was born lives on
 *  the response's `previous` link — one journey, one lead, one origin. */
export const JourneyLead = z.object({
  code: ObjectCode,
  holder: WorkstreamHolder.nullable(),
  rungs: z.array(JourneyLeadRung).length(LEAD_LANE_BACKBONE.length),
})

export const JourneyDeal = z.object({
  code: ObjectCode,
  name: textInput(200),
  holder: WorkstreamHolder.nullable(),
  amount: MoneyVnd.nullable(),
  expectedClose: Day.nullable(),
  outcome: JourneyDealOutcome,
  outcomeAt: Moment.nullable(),
  rungs: z.array(JourneyDealRung).length(StageKey.options.length),
  nextAction: JourneyNextAction.nullable(),
  /** A list, not one code: a won deal may sign again (licence beside deployment). */
  contractCodes: z.array(ContractCode),
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
  kind: ContractKind,
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

/** `reason` is free text until the shared reason catalogue (flow C3) exists.
 *  `concludedBy` is null when the machine parked the lead (flow C5: a campaign
 *  ended with no real exchange). */
export const JourneyWaitingDoor = z.object({
  kind: z.literal('waiting'),
  leadCode: ObjectCode,
  from: JourneyDoorAnchor,
  at: Moment,
  reason: textInput(200),
  concludedBy: WorkstreamHolder.nullable(),
  doNotContact: z.boolean(),
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
export type ContractKind = z.infer<typeof ContractKind>
export type ContractRungKey = z.infer<typeof ContractRungKey>
export type DueLevel = z.infer<typeof DueLevel>
export type LeadBackboneKey = z.infer<typeof LeadBackboneKey>
export type JourneyRungKey = z.infer<typeof JourneyRungKey>
export type JourneyLink = z.infer<typeof JourneyLink>
export type JourneyNextAction = z.infer<typeof JourneyNextAction>
export type JourneySubStep = z.infer<typeof JourneySubStep>
export type JourneyLeadRung = z.infer<typeof JourneyLeadRung>
export type JourneyDealRung = z.infer<typeof JourneyDealRung>
export type JourneyContractRung = z.infer<typeof JourneyContractRung>
export type JourneyLead = z.infer<typeof JourneyLead>
export type JourneyDeal = z.infer<typeof JourneyDeal>
export type JourneyInstallment = z.infer<typeof JourneyInstallment>
export type JourneyAcceptance = z.infer<typeof JourneyAcceptance>
export type JourneyContract = z.infer<typeof JourneyContract>
export type JourneyDoorAnchor = z.infer<typeof JourneyDoorAnchor>
export type JourneyWaitingDoor = z.infer<typeof JourneyWaitingDoor>
export type JourneyGrowthDoor = z.infer<typeof JourneyGrowthDoor>
export type JourneyDoor = z.infer<typeof JourneyDoor>
export type WorkstreamJourneyResponse = z.infer<typeof WorkstreamJourneyResponse>
