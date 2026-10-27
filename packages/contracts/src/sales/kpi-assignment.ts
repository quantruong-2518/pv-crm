import { z } from 'zod'
import { Day, Moment } from '../primitives'
import { RoleId } from '../auth'
import { Problem } from '../problem'
import { OrgUnitKind } from '../platform/org-unit'
import { KpiMetricKey, KpiMonthClose, KpiPeriodKey, KpiTargetActor, type KpiMetricDef } from './kpi'
import { stepSalesPeriod } from './sales-period'

/** `/sales/kpi/:period/assignments/:role…` — targets handed down the org tree (ADR 0120).
 *
 *  `GET ?unitId=` (the head's page) · `GET me` (a person's lines) · `GET tree` ·
 *  `PUT draft` · `POST send` · `POST confirm`. Params are `KpiRoleParams`.
 *  Draft and send answer `KpiAssignmentPageResponse`; confirm answers `KpiAssignmentMineResponse`.
 *
 *  How a metric travels is read off `KPI_CATALOG` by `kpiMetricShare`, never a
 *  second list: only additive lines are typed by the head; copied lines repeat the
 *  assigner's level read-only; a room metric is a company `total` line and stops there.
 *  A refusal is a `KpiAssignmentRefusal`: 409 for month and order rules, 400 for sums. */

/** First tiered month (ADR 0120 §1): a constant, so no table can drift from it. */
export const TIERED_FROM = '2026-12'

/** `YYYY-MM` compares as text in calendar order. */
export const isTieredPeriod = (period: KpiPeriodKey): boolean => period >= TIERED_FROM

/** Above this share of what was received, a send still goes through but warns (Q2). */
export const KPI_ASSIGNMENT_OVER_RATIO = 1.2

/** A deadline level: the three unit kinds send, `person` confirms. */
export const KpiAssignmentLevel = z.enum([...OrgUnitKind.options, 'person'])

/** Day of month P−1 (Vietnam time, end of day) each level must have sent or confirmed by. */
export const KPI_ASSIGNMENT_DEADLINE_DAY = {
  company: 20,
  department: 23,
  team: 25,
  person: 28,
} as const satisfies Record<z.infer<typeof KpiAssignmentLevel>, number>

/** The last day of month P−1 for a level, as a Vietnam day. */
export const kpiAssignmentDeadline = (
  period: KpiPeriodKey,
  level: z.infer<typeof KpiAssignmentLevel>,
): string =>
  `${stepSalesPeriod(period, -1)}-${String(KPI_ASSIGNMENT_DEADLINE_DAY[level]).padStart(2, '0')}`

export const KpiMetricShare = z.enum(['additive', 'copied', 'total'])

export const kpiMetricShare = (def: KpiMetricDef): z.infer<typeof KpiMetricShare> => {
  if (def.scope === 'room') return 'total'
  const tally = def.unit === 'count' || def.unit === 'money'
  return tally && def.higherIsBetter ? 'additive' : 'copied'
}

/** ADR 0120 §2 and §4: a unit owes a set for a role when someone under it holds
 *  the role, and below the company only when the role has more than room metrics. */
export const kpiAssignmentNeedsSet = (
  defs: readonly KpiMetricDef[],
  company: boolean,
  hasHolders: boolean,
): boolean =>
  defs.length > 0 && hasHolders && (company || defs.some((d) => kpiMetricShare(d) !== 'total'))

const amount = z.number().nonnegative()
const actorId = z.string().min(1).max(64)
const unitId = z.uuid()

/* Values go into Postgres CHECKs, hence English. */
export const KpiAssignmentStatus = z.enum(['draft', 'sent', 'superseded'])
export const KpiAssignmentLineKind = z.enum(['total', 'unit', 'person'])
export const KpiAssignmentUnitState = z.enum(['not-sent', 'sent', 'sent-by-default'])
export const KpiAssignmentPersonState = z.enum(['not-sent', 'pending', 'confirmed', 'defaulted'])
/** `over` = above `KPI_ASSIGNMENT_OVER_RATIO` of what was received. */
export const KpiAssignmentSumFlag = z.enum(['below', 'over'])

export const KpiAssignmentErrorCode = z.enum([
  'kpi-month-tiered',
  'kpi-month-not-tiered',
  'assignment-below-received',
  'parent-not-sent',
  'resend-locked',
  'line-not-editable',
  'unknown-child',
  'nothing-to-send',
  'nothing-to-confirm',
  'confirm-past-deadline',
])

/** `metricKeys` names the metrics behind a sum refusal, so the screen marks those rows. */
export const KpiAssignmentRefusal = Problem.extend({
  code: KpiAssignmentErrorCode,
  metricKeys: z.array(KpiMetricKey).optional(),
})

export const KpiAssignmentLine = z
  .object({
    metricKey: KpiMetricKey,
    kind: KpiAssignmentLineKind,
    childUnitId: unitId.nullable(),
    personId: actorId.nullable(),
    value: amount,
    /** A copied or total line below the company: the head cannot type it. */
    readOnly: z.boolean(),
    /** Person lines only; a resend that changes the value clears it (§5). */
    confirmedAt: Moment.nullable(),
    /** Unconfirmed past the 28th: shown as accepted by default (ADR 0114), never as confirmed. */
    acceptedByDefault: z.boolean(),
  })
  .refine((l) => (l.kind === 'unit') === (l.childUnitId !== null), { path: ['childUnitId'] })
  .refine((l) => (l.kind === 'person') === (l.personId !== null), { path: ['personId'] })

export const KpiAssignmentSet = z.object({
  id: z.uuid(),
  period: KpiPeriodKey,
  role: RoleId,
  unitId,
  version: z.number().int().min(1),
  status: KpiAssignmentStatus,
  /** Written by the late sweep from last month's figures (§6). */
  byDefault: z.boolean(),
  sentBy: KpiTargetActor.nullable(),
  sentAt: Moment.nullable(),
  lines: z.array(KpiAssignmentLine),
})

export const KpiAssignmentUnitRef = z.object({
  id: unitId,
  kind: OrgUnitKind,
  name: z.string().min(1),
  head: KpiTargetActor.nullable(),
})

export const KpiAssignmentChild = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('unit'), unit: KpiAssignmentUnitRef, state: KpiAssignmentUnitState }),
  z.object({ kind: z.literal('person'), person: KpiTargetActor, state: KpiAssignmentPersonState }),
])

/** What the unit got from the level above, per metric of the role. */
export const KpiAssignmentReceived = z.object({
  metricKey: KpiMetricKey,
  share: KpiMetricShare,
  value: amount,
})

/** Additive metrics only. `ratio` is `assigned / received`, `null` when nothing was received. */
export const KpiAssignmentSum = z.object({
  metricKey: KpiMetricKey,
  received: amount,
  assigned: amount,
  ratio: z.number().nonnegative().nullable(),
  flag: KpiAssignmentSumFlag.nullable(),
})

/** ADR 0120 §4: short of what was received is refused, above the over ratio warns. */
export function kpiAssignmentSum(
  metricKey: z.infer<typeof KpiMetricKey>,
  received: number,
  assigned: number,
): z.infer<typeof KpiAssignmentSum> {
  const ratio = received > 0 ? assigned / received : null
  const flag =
    assigned < received
      ? 'below'
      : ratio !== null && ratio > KPI_ASSIGNMENT_OVER_RATIO
        ? 'over'
        : null
  return { metricKey, received, assigned, ratio, flag }
}

export const KpiAssignmentQuery = z.object({
  /** Absent = the unit the caller heads; a stand-in names the seat they act for. */
  unitId: unitId.optional(),
})

export const KpiAssignmentPageResponse = z.object({
  period: KpiPeriodKey,
  role: RoleId,
  monthClose: KpiMonthClose,
  unit: KpiAssignmentUnitRef,
  /** The head this caller stands in for (ADR 0116); `null` when acting for themselves. */
  actingFor: KpiTargetActor.nullable(),
  /** The caller sits on this unit's seat today, so draft and send are open to them. */
  canAct: z.boolean(),
  /** Last day for this level, in month P−1. */
  deadline: Day,
  /** `false` blocks a send with `parent-not-sent`; always `true` for the company. */
  parentSent: z.boolean(),
  /** Empty for the company: its own `total` lines are what the tree starts from. */
  received: z.array(KpiAssignmentReceived),
  /** The newest draft or sent version; `null` before anything was saved. */
  set: KpiAssignmentSet.nullable(),
  /** The sent version in force when `set` is a draft over it. */
  inForceVersion: z.number().int().min(1).nullable(),
  /** A child unit has sent, so a resend answers `resend-locked`. */
  resendLocked: z.boolean(),
  children: z.array(KpiAssignmentChild),
  sums: z.array(KpiAssignmentSum),
})

export const KpiAssignmentSendResponse = KpiAssignmentPageResponse.extend({
  /** Sums above `KPI_ASSIGNMENT_OVER_RATIO`: sent anyway, shown once. */
  warnings: z.array(KpiAssignmentSum),
})

export const KpiAssignmentMineResponse = z.object({
  period: KpiPeriodKey,
  role: RoleId,
  monthClose: KpiMonthClose,
  /** `null` while no sent set holds a line for the caller. */
  sentBy: KpiTargetActor.nullable(),
  sentAt: Moment.nullable(),
  version: z.number().int().min(1).nullable(),
  lines: z.array(KpiAssignmentLine),
  confirmedAt: Moment.nullable(),
  acceptedByDefault: z.boolean(),
  deadline: Day,
})

const count = z.number().int().nonnegative()
const confirmedOf = { confirmed: count, total: count }

export const KpiAssignmentStep = z.object({
  level: KpiAssignmentLevel,
  /** Last day of month P−1 for this level. */
  due: Day,
  /** `null` on the `person` step. */
  units: z.object({ sent: count, sentByDefault: count, notSent: count }).nullable(),
  /** People with lines and how many confirmed them all; `null` on a unit step. */
  people: z.object(confirmedOf).nullable(),
})

/** One unit that hands the role down, in tree order (depth-first, by name). */
export const KpiAssignmentTreeUnit = z.object({
  unitId,
  kind: OrgUnitKind,
  name: z.string().min(1),
  /** 0 for the company. */
  depth: z.number().int().nonnegative(),
  head: KpiTargetActor.extend({ away: z.boolean() }).nullable(),
  state: KpiAssignmentUnitState,
  sentAt: Moment.nullable(),
  /** People on this unit's own set in force, not its subtree. */
  ...confirmedOf,
})

/** `GET tree`: the whole month for one role, for `kpi.view-all` or the company seat. */
export const KpiAssignmentTreeResponse = z.object({
  period: KpiPeriodKey,
  role: RoleId,
  monthClose: KpiMonthClose,
  steps: z.array(KpiAssignmentStep),
  units: z.array(KpiAssignmentTreeUnit),
})

const draftLine = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('total'), metricKey: KpiMetricKey, value: amount }),
  z.object({
    kind: z.literal('unit'),
    metricKey: KpiMetricKey,
    childUnitId: unitId,
    value: amount,
  }),
  z.object({
    kind: z.literal('person'),
    metricKey: KpiMetricKey,
    personId: actorId,
    value: amount,
  }),
])

const lineKey = (l: z.infer<typeof draftLine>) =>
  `${l.kind}|${l.metricKey}|${l.kind === 'unit' ? l.childUnitId : l.kind === 'person' ? l.personId : ''}`

/** Replaces the whole draft. Copied lines are filled by the server, so only
 *  additive and (company only) total lines are sent; others answer `line-not-editable`. */
export const KpiAssignmentDraftBody = z.object({
  unitId,
  lines: z
    .array(draftLine)
    .min(1)
    .refine((l) => new Set(l.map(lineKey)).size === l.length, { message: 'Chỉ tiêu bị lặp.' }),
})

export const KpiAssignmentSendBody = z.object({ unitId })

export type KpiMetricShare = z.infer<typeof KpiMetricShare>
export type KpiAssignmentStatus = z.infer<typeof KpiAssignmentStatus>
export type KpiAssignmentLineKind = z.infer<typeof KpiAssignmentLineKind>
export type KpiAssignmentUnitState = z.infer<typeof KpiAssignmentUnitState>
export type KpiAssignmentPersonState = z.infer<typeof KpiAssignmentPersonState>
export type KpiAssignmentSumFlag = z.infer<typeof KpiAssignmentSumFlag>
export type KpiAssignmentErrorCode = z.infer<typeof KpiAssignmentErrorCode>
export type KpiAssignmentRefusal = z.infer<typeof KpiAssignmentRefusal>
export type KpiAssignmentLine = z.infer<typeof KpiAssignmentLine>
export type KpiAssignmentSet = z.infer<typeof KpiAssignmentSet>
export type KpiAssignmentUnitRef = z.infer<typeof KpiAssignmentUnitRef>
export type KpiAssignmentChild = z.infer<typeof KpiAssignmentChild>
export type KpiAssignmentReceived = z.infer<typeof KpiAssignmentReceived>
export type KpiAssignmentSum = z.infer<typeof KpiAssignmentSum>
export type KpiAssignmentQuery = z.infer<typeof KpiAssignmentQuery>
export type KpiAssignmentPageResponse = z.infer<typeof KpiAssignmentPageResponse>
export type KpiAssignmentSendResponse = z.infer<typeof KpiAssignmentSendResponse>
export type KpiAssignmentMineResponse = z.infer<typeof KpiAssignmentMineResponse>
export type KpiAssignmentLevel = z.infer<typeof KpiAssignmentLevel>
export type KpiAssignmentStep = z.infer<typeof KpiAssignmentStep>
export type KpiAssignmentTreeUnit = z.infer<typeof KpiAssignmentTreeUnit>
export type KpiAssignmentTreeResponse = z.infer<typeof KpiAssignmentTreeResponse>
export type KpiAssignmentDraftBody = z.infer<typeof KpiAssignmentDraftBody>
export type KpiAssignmentSendBody = z.infer<typeof KpiAssignmentSendBody>
