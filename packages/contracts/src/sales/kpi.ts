import { z } from 'zod'
import { Moment } from '../primitives'
import { RoleId, RoleIds } from '../auth'

/** `/sales/kpi/:period/…` — scorecards per ROLE and the agreed monthly targets.
 *
 *  `GET me | company | people | targets`, `PUT targets/:role`,
 *  `POST targets/:role/agree`, `POST acknowledgements/:role`.
 *
 *  The metric catalog lives here as data, not in the API: the server computes
 *  readings from it and the screen groups and formats them from it, and two
 *  copies of "which metrics does a role carry" would drift. A reading carries
 *  plain numbers rather than `MoneyVnd` because its unit varies by metric —
 *  the catalog's `unit` says how to print it. */

/** A calendar month only (`2026-10`). Targets are agreed per month, so the
 *  quarter keys `SalesPeriodKey` also accepts are refused here. */
export const KpiPeriodKey = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/)

export const KpiPeriodParams = z.object({ period: KpiPeriodKey })
export const KpiRoleParams = z.object({ period: KpiPeriodKey, role: RoleId })

export const KpiMetricKey = z.enum([
  'leads-sourced',
  'lead-to-opportunity-rate',
  'sourced-signed-value',
  'opportunities-opened',
  'first-response-hours',
  'opportunity-accept-rate',
  'demos-joined',
  'signed-value',
  'win-rate',
  'debriefs-closed',
  'overdue-receivables',
  'accept-lag-days',
  'collected-value',
  'approval-turnaround-hours',
])

/** `guardrail` sits beside the other three: it stops a result being gamed. */
export const KpiLayer = z.enum(['activity', 'conversion', 'result', 'guardrail'])
export const KpiUnit = z.enum(['count', 'money', 'ratio', 'hours', 'days'])
export const KpiVerdict = z.enum(['no-data', 'unset', 'met', 'on-track', 'behind', 'missed'])
/** `own` filters on the actor; `room` is the whole Sales book. */
export const KpiScope = z.enum(['own', 'room'])

export const KpiMetricDef = z.object({
  key: KpiMetricKey,
  layer: KpiLayer,
  unit: KpiUnit,
  higherIsBetter: z.boolean(),
  /** Expected-to-date is `target × elapsed`; otherwise the whole target. */
  paced: z.boolean(),
  /** Read as of today, not over the period — the figure keeps no history. */
  snapshot: z.boolean(),
  scope: KpiScope,
  /** The role's hero metric; exactly one per role. */
  primary: z.boolean(),
})

export type KpiPeriodKey = z.infer<typeof KpiPeriodKey>
export type KpiPeriodParams = z.infer<typeof KpiPeriodParams>
export type KpiRoleParams = z.infer<typeof KpiRoleParams>
export type KpiMetricKey = z.infer<typeof KpiMetricKey>
export type KpiLayer = z.infer<typeof KpiLayer>
export type KpiUnit = z.infer<typeof KpiUnit>
export type KpiVerdict = z.infer<typeof KpiVerdict>
export type KpiScope = z.infer<typeof KpiScope>
export type KpiMetricDef = z.infer<typeof KpiMetricDef>

type KpiTraits = Partial<Pick<KpiMetricDef, 'higherIsBetter' | 'paced' | 'snapshot' | 'primary'>>

/** Defaults are the catalog's common case (higher is better, paced, measured
 *  over the period, not primary), so each row below spells only its exceptions. */
const metric = (
  key: KpiMetricKey,
  layer: KpiLayer,
  unit: KpiUnit,
  scope: KpiScope,
  traits: KpiTraits = {},
): KpiMetricDef => ({
  key,
  layer,
  unit,
  scope,
  higherIsBetter: true,
  paced: true,
  snapshot: false,
  primary: false,
  ...traits,
})

const UNPACED: KpiTraits = { paced: false }
const LOWER: KpiTraits = { higherIsBetter: false, paced: false }
const LOWER_SNAPSHOT: KpiTraits = { higherIsBetter: false, paced: false, snapshot: true }
const PRIMARY: KpiTraits = { primary: true }

/** Which metrics a role carries, in display order. Keyed by every `RoleId`, so
 *  a role added to the enum without a catalog is a red build. */
export const KPI_CATALOG: Record<RoleId, readonly KpiMetricDef[]> = {
  director: [
    metric('signed-value', 'result', 'money', 'room', PRIMARY),
    metric('collected-value', 'result', 'money', 'room'),
    metric('approval-turnaround-hours', 'activity', 'hours', 'room', LOWER),
    metric('overdue-receivables', 'guardrail', 'money', 'room', LOWER_SNAPSHOT),
  ],
  'head-of-sales': [
    metric('signed-value', 'result', 'money', 'room', PRIMARY),
    metric('win-rate', 'conversion', 'ratio', 'room', UNPACED),
    metric('accept-lag-days', 'activity', 'days', 'own', LOWER),
    metric('overdue-receivables', 'guardrail', 'money', 'room', LOWER_SNAPSHOT),
  ],
  marketing: [
    metric('leads-sourced', 'activity', 'count', 'own', PRIMARY),
    metric('lead-to-opportunity-rate', 'conversion', 'ratio', 'own', UNPACED),
    metric('sourced-signed-value', 'result', 'money', 'own'),
  ],
  bd: [
    metric('opportunities-opened', 'activity', 'count', 'own', PRIMARY),
    metric('first-response-hours', 'guardrail', 'hours', 'own', LOWER),
    metric('opportunity-accept-rate', 'conversion', 'ratio', 'own', UNPACED),
  ],
  presales: [metric('demos-joined', 'activity', 'count', 'own', PRIMARY)],
  sale: [
    metric('signed-value', 'result', 'money', 'own', PRIMARY),
    metric('win-rate', 'conversion', 'ratio', 'own', UNPACED),
    metric('debriefs-closed', 'activity', 'count', 'own'),
    metric('overdue-receivables', 'guardrail', 'money', 'own', LOWER_SNAPSHOT),
  ],
  'account-executive': [
    metric('opportunities-opened', 'activity', 'count', 'own'),
    metric('debriefs-closed', 'activity', 'count', 'own'),
    metric('win-rate', 'conversion', 'ratio', 'own', UNPACED),
    metric('signed-value', 'result', 'money', 'own', PRIMARY),
    metric('overdue-receivables', 'guardrail', 'money', 'own', LOWER_SNAPSHOT),
  ],
}

/** Vietnamese labels, declared ONCE for the reason `LEAD_STATE_LABEL` is: both
 *  ends print them, and two copies of one word drift. */
export const KPI_METRIC_LABEL: Record<KpiMetricKey, string> = {
  'leads-sourced': 'Lead đưa về',
  'lead-to-opportunity-rate': 'Tỷ lệ lead thành cơ hội',
  'sourced-signed-value': 'Giá trị ký từ lead của mình',
  'opportunities-opened': 'Cơ hội đã mở',
  'first-response-hours': 'Thời gian phản hồi lead đầu tiên',
  'opportunity-accept-rate': 'Tỷ lệ cơ hội được nhận',
  'demos-joined': 'Buổi demo đã tham gia',
  'signed-value': 'Giá trị hợp đồng đã ký',
  'win-rate': 'Tỷ lệ thắng',
  'debriefs-closed': 'Trao đổi đã ghi nhận xong',
  'overdue-receivables': 'Tiền quá hạn chưa thu',
  'accept-lag-days': 'Thời gian nhận cơ hội',
  'collected-value': 'Tiền đã thu',
  'approval-turnaround-hours': 'Thời gian duyệt',
}

export const KPI_LAYER_LABEL: Record<KpiLayer, string> = {
  activity: 'Hành động',
  conversion: 'Chuyển đổi',
  result: 'Kết quả',
  guardrail: 'Giới hạn phải giữ',
}

export const KPI_VERDICT_LABEL: Record<KpiVerdict, string> = {
  'no-data': 'Chưa có dữ liệu',
  unset: 'Chưa đặt chỉ tiêu',
  met: 'Đạt',
  'on-track': 'Đúng nhịp',
  behind: 'Chậm nhịp',
  missed: 'Không đạt',
}

const targetValue = z.number().nonnegative()
const targetVersion = z.number().int().min(1)

export const KpiReading = z.object({
  key: KpiMetricKey,
  /** `null` when the figure cannot be computed, e.g. a ratio over zero. */
  value: z.number().nullable(),
  /** The effective (highest agreed) target; `null` while none is agreed. */
  target: targetValue.nullable(),
  targetVersion: targetVersion.nullable(),
  /** What pace asks for by today; `null` with no target. */
  expected: z.number().nonnegative().nullable(),
  verdict: KpiVerdict,
})

export const KpiScorecard = z.object({
  role: RoleId,
  readings: z.array(KpiReading),
  acknowledgedAt: Moment.nullable(),
  /** The acknowledgement is older than the newest agreed target. */
  acknowledgementStale: z.boolean(),
})

/** Room figures belong to no one person, so there is nothing to acknowledge. */
export const KpiCompanyScorecard = KpiScorecard.omit({
  acknowledgedAt: true,
  acknowledgementStale: true,
})

/** One scorecard per role the caller holds. */
export const KpiMeResponse = z.object({
  period: KpiPeriodKey,
  closed: z.boolean(),
  scorecards: z.array(KpiScorecard),
})

export const KpiCompanyResponse = z.object({
  period: KpiPeriodKey,
  scorecard: KpiCompanyScorecard,
})

export const KpiPerson = z.object({
  actorId: z.string().min(1).max(64),
  name: z.string().min(1),
  roleIds: RoleIds,
  scorecards: z.array(KpiScorecard),
})

export const KpiPeopleResponse = z.object({
  period: KpiPeriodKey,
  people: z.array(KpiPerson),
})

/** Who proposed or agreed a target — id plus the name the table prints. */
export const KpiTargetActor = z.object({
  actorId: z.string().min(1).max(64),
  name: z.string().min(1),
})

export const KpiAgreedTarget = z.object({
  value: targetValue,
  version: targetVersion,
  agreedBy: KpiTargetActor,
  agreedAt: Moment,
})

/** No `version`: a pending proposal is replaced in place until it is agreed. */
export const KpiPendingTarget = z.object({
  value: targetValue,
  proposedBy: KpiTargetActor,
  proposedAt: Moment,
})

export const KpiMetricTarget = z.object({
  key: KpiMetricKey,
  agreed: KpiAgreedTarget.nullable(),
  pending: KpiPendingTarget.nullable(),
})

export const KpiRoleTargets = z.object({
  role: RoleId,
  metrics: z.array(KpiMetricTarget),
})

export const KpiTargetsResponse = z.object({
  period: KpiPeriodKey,
  /** The month is over: its targets and acknowledgements take no more writes. */
  closed: z.boolean(),
  roles: z.array(KpiRoleTargets),
})

/** `PUT /sales/kpi/:period/targets/:role`. Whether a key belongs to the role's
 *  catalog is checked server-side: the role arrives in the params, not here. */
export const KpiProposeBody = z.object({
  targets: z
    .array(z.object({ key: KpiMetricKey, value: targetValue }))
    .min(1)
    .refine((t) => new Set(t.map((x) => x.key)).size === t.length, {
      message: 'Chỉ tiêu bị trùng.',
    }),
})

/** `POST …/targets/:role/agree`. The agreer states what was on their screen:
 *  a pending row can be replaced in place, and agreeing must never lock a
 *  value the agreer did not see. */
export const KpiAgreeBody = z.object({
  seen: z.array(z.object({ key: KpiMetricKey, proposedAt: Moment })).min(1),
})

export type KpiReading = z.infer<typeof KpiReading>
export type KpiScorecard = z.infer<typeof KpiScorecard>
export type KpiCompanyScorecard = z.infer<typeof KpiCompanyScorecard>
export type KpiMeResponse = z.infer<typeof KpiMeResponse>
export type KpiCompanyResponse = z.infer<typeof KpiCompanyResponse>
export type KpiPerson = z.infer<typeof KpiPerson>
export type KpiPeopleResponse = z.infer<typeof KpiPeopleResponse>
export type KpiTargetActor = z.infer<typeof KpiTargetActor>
export type KpiAgreedTarget = z.infer<typeof KpiAgreedTarget>
export type KpiPendingTarget = z.infer<typeof KpiPendingTarget>
export type KpiMetricTarget = z.infer<typeof KpiMetricTarget>
export type KpiRoleTargets = z.infer<typeof KpiRoleTargets>
export type KpiTargetsResponse = z.infer<typeof KpiTargetsResponse>
export type KpiProposeBody = z.infer<typeof KpiProposeBody>
export type KpiAgreeBody = z.infer<typeof KpiAgreeBody>
