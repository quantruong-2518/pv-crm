import { z } from 'zod'
import { Moment } from '../primitives'
import { RoleId } from '../auth'
import { SETTING_REGISTRY } from '../setting'
import {
  KPI_CATALOG,
  KPI_CATALOG_V2,
  KPI_DEFAULT_OFF,
  KPI_V2_DEFAULT_OFF,
  isKpiV2Period,
  KpiAdjustmentCause,
  KpiMetricDef,
  KpiMetricKey,
  KpiPeriodKey,
  KpiPeriodParams,
  KpiTargetActor,
} from './kpi'
import { OPPORTUNITY_STAGE_LABEL, StageKey } from './enums'

/** KPI configuration, target history and per-person contributions.
 *
 *  `GET sales/kpi/catalog` · `GET|PUT sales/config/kpi-metrics` ·
 *  `GET|PATCH sales/config/kpi-alert` (body `KpiAlertPatch`, `../setting`) ·
 *  `GET sales/kpi/:period/history` · `GET …/:period/people/:actorId/contributions`.
 *  Config writes answer `ConfigProposalReceipt` — the approval flow every config
 *  list uses (ADR 0095 §4), no second door.
 *
 *  The metric config is an OVERLAY on the month's catalog (`catalogFor`), not a
 *  list of its own: formulas live in code, so config may only switch a catalog
 *  metric on or off, move the primary and, from `KPI_V2_FROM`, weigh metrics and
 *  set funnel step targets. A set is versioned by its first month (ADR 0160 §2). */

const actorId = z.string().min(1).max(64)
/** Whole percent of the role's score: owners type whole numbers and 100 sums exactly. */
const weightPercent = z.number().int().min(0).max(100)
/** Basis points of the step before (10000 = all pass), as stored, so no rounding on the way. */
const ratioBp = z.number().int().min(0).max(10000)

/** Every step any role's funnel draws (ADR 0160 §7); Sale's are its `StageKey` columns. */
export const KpiFunnelStep = z.enum([
  'lead',
  'mql',
  'sql',
  'opportunity',
  'lead-received',
  'contacted',
  'accepted',
  'met',
  'solution',
  'signed',
  ...StageKey.options,
])

/** Vietnamese step names, declared once so the config screen, the board and the
 *  approval sentence print the same words. Sale's steps are its stage columns. */
export const KPI_FUNNEL_STEP_LABEL: Record<KpiFunnelStep, string> = {
  ...OPPORTUNITY_STAGE_LABEL,
  lead: 'Lead mới',
  mql: 'MQL',
  sql: 'SQL',
  opportunity: 'Cơ hội',
  'lead-received': 'Lead nhận',
  contacted: 'Đã liên hệ',
  accepted: 'Sale nhận',
  met: 'Gặp, khảo sát',
  solution: 'Giải pháp, demo',
  quotation: 'Báo giá',
  signed: 'Ký hợp đồng',
}

/** `base` is counted but has no rate; each `rated` step is ÷ the step before it.
 *  Sale has no base: a stage's rate is the share of deals that left it forward. */
export const KPI_FUNNEL: Record<
  RoleId,
  { base: KpiFunnelStep | null; rated: readonly KpiFunnelStep[] }
> = {
  director: { base: null, rated: [] },
  'head-of-sales': { base: null, rated: [] },
  marketing: { base: 'lead', rated: ['mql', 'sql', 'opportunity'] },
  bd: { base: 'lead-received', rated: ['contacted', 'sql', 'opportunity', 'accepted'] },
  presales: { base: 'met', rated: ['solution', 'quotation', 'signed'] },
  sale: { base: null, rated: StageKey.options },
  'account-executive': { base: null, rated: [] },
}

export const KpiFunnelTarget = z.object({ step: KpiFunnelStep, targetBp: ratioBp })

/** One stored overlay row; a role with no rows reads as the catalog itself. */
export const KpiRoleMetricConfig = z.object({
  role: RoleId,
  fromPeriod: KpiPeriodKey,
  metricKey: KpiMetricKey,
  enabled: z.boolean(),
  primary: z.boolean(),
  weight: weightPercent.nullable(),
})

/** `inCatalog` is a literal: the overlay cannot add a metric, so a row that
 *  claims otherwise is a server bug the parse should surface. `weight` null =
 *  the default split (primary 50 %, the rest equal). */
export const KpiRoleMetric = KpiMetricDef.omit({ key: true }).extend({
  metricKey: KpiMetricKey,
  enabled: z.boolean(),
  inCatalog: z.literal(true),
  weight: weightPercent.nullable(),
})

/** `GET sales/config/kpi-metrics` and `GET sales/kpi/catalog`: the set in force
 *  for `period`; absent reads the current month. */
export const KpiConfigPeriodQuery = z.object({ period: KpiPeriodKey.optional() })

/** `fromPeriod` null = no stored set applies, the month reads the code catalog. */
export const KpiRoleMetricsResponse = z.object({
  period: KpiPeriodKey,
  roles: z.array(
    z.object({
      role: RoleId,
      fromPeriod: KpiPeriodKey.nullable(),
      metrics: z.array(KpiRoleMetric),
      funnel: z.array(KpiFunnelTarget),
    }),
  ),
})

const PatchShape = z.object({
  role: RoleId,
  from: KpiPeriodKey.optional(),
  metrics: z
    .array(
      z.object({
        metricKey: KpiMetricKey,
        enabled: z.boolean(),
        primary: z.boolean(),
        weight: weightPercent.optional(),
      }),
    )
    .min(1),
  funnel: z.array(KpiFunnelTarget).optional(),
})

/** Absent `from` is a request stored before ADR 0160: judged against v1 and carries
 *  neither weights nor funnel targets; the server dates it at approval. */
function checkPatch(
  { role, from, metrics, funnel }: z.infer<typeof PatchShape>,
  fail: (message: string) => void,
): void {
  const v2 = from !== undefined && isKpiV2Period(from)
  const keys = metrics.map((m) => m.metricKey)
  const catalog = (v2 ? KPI_CATALOG_V2 : KPI_CATALOG)[role].map((d) => d.key)
  if (new Set(keys).size !== keys.length) fail('Chỉ số bị lặp.')
  if (keys.length !== catalog.length || !catalog.every((k) => keys.includes(k))) {
    fail('Gửi đủ các chỉ số của vai này.')
  }
  // An enabled primary also guarantees at least one enabled metric.
  const primary = metrics.filter((m) => m.primary)
  const hero = primary[0]
  if (primary.length !== 1 || !hero) fail('Mỗi vai có đúng một chỉ số chính.')
  else if (!hero.enabled) fail('Chỉ số chính phải đang bật.')
  else if ((v2 ? KPI_V2_DEFAULT_OFF[role] : KPI_DEFAULT_OFF).has(hero.metricKey))
    fail('Chỉ số này không chọn làm chỉ số chính được.')

  const weighed = metrics.filter((m) => m.weight !== undefined)
  if (weighed.length > 0) {
    if (!v2) fail('Trọng số chỉ áp dụng từ tháng 01/2027.')
    else if (metrics.some((m) => m.enabled !== (m.weight !== undefined)))
      fail('Mỗi chỉ số đang bật cần một trọng số; chỉ số đang tắt thì để trống.')
    else if (weighed.reduce((sum, m) => sum + (m.weight ?? 0), 0) !== 100)
      fail('Tổng trọng số phải bằng 100%.')
  }

  if (!funnel || funnel.length === 0) return
  const steps = funnel.map((f) => f.step)
  if (from === undefined) fail('Chọn tháng áp dụng trước khi đặt mục tiêu bước.')
  else if (!v2) fail('Mục tiêu bước chỉ đặt được từ tháng 01/2027.')
  if (new Set(steps).size !== steps.length) fail('Bước phễu bị lặp.')
  if (!steps.every((s) => KPI_FUNNEL[role].rated.includes(s))) {
    fail('Bước này không có trong phễu của vai.')
  }
}

/** `PUT` replaces the role's whole set from month `from`, so every catalog metric
 *  of `catalogFor(from)` must be listed — a missing one would be ambiguous between
 *  "off" and "as before". Weights are all or none; funnel targets ride along. "No
 *  earlier than next month" needs the clock, so the server keeps it. */
export const KpiRoleMetricsPatch = PatchShape.superRefine((patch, ctx) =>
  checkPatch(patch, (message) => ctx.addIssue({ code: 'custom', message, path: ['metrics'] })),
)

/** The catalog with the overlay applied — what every reading screen groups by.
 *  Keyed by every `RoleId` (zod 4 records over an enum are exhaustive). */
export const KpiEffectiveCatalogResponse = z.object({
  roles: z.record(RoleId, z.array(KpiMetricDef)),
})

const slipDef = SETTING_REGISTRY['kpi.alert.slip-percent']
const hitDef = SETTING_REGISTRY['kpi.alert.hit-percent']
const toleranceDef = SETTING_REGISTRY['kpi.pace.tolerance-percent']
const gradeDef = SETTING_REGISTRY['kpi.score.grade-a']

/** The three keys as stored in `platform.setting`. `isDefault` means none has
 *  a row; otherwise `updatedBy`/`updatedAt` name the latest write of them. */
export const KpiAlertSettingResponse = z
  .object({
    slipPercent: z.number().int().min(slipDef.min).max(slipDef.max),
    hitPercent: z.number().int().min(hitDef.min).max(hitDef.max),
    tolerancePercent: z.number().int().min(toleranceDef.min).max(toleranceDef.max),
    gradeA: z.number().int().min(gradeDef.min).max(gradeDef.max),
    gradeB: z.number().int().min(gradeDef.min).max(gradeDef.max),
    gradeC: z.number().int().min(gradeDef.min).max(gradeDef.max),
    isDefault: z.boolean(),
    updatedBy: KpiTargetActor.nullable(),
    updatedAt: Moment.nullable(),
  })
  .refine((r) => r.isDefault === (r.updatedBy === null && r.updatedAt === null), {
    message: 'A default pair carries no writer; an override carries both fields.',
  })

export const KpiTargetHistorySource = z.enum(['role-target', 'allocation'])
export const KpiTargetHistoryEvent = z.enum([
  'proposed',
  'agreed',
  'submitted',
  'returned',
  'superseded',
  'countered',
  'accepted',
  'kept',
])

/** `role` is asked for, not inferred: one metric key sits in several roles. */
export const KpiTargetHistoryQuery = z.object({
  role: RoleId,
  metricKey: KpiMetricKey,
  actorId: actorId.optional(),
})

/** `value` is `null` on an event that moves no number (`returned`). `version`
 *  is the one the event belongs to; a proposal carries the one it would become. */
export const KpiTargetHistoryEntry = z.object({
  source: KpiTargetHistorySource,
  version: z.number().int().min(1),
  value: z.number().nonnegative().nullable(),
  actor: KpiTargetActor.nullable(),
  at: Moment,
  event: KpiTargetHistoryEvent,
  note: z.string().min(1).nullable(),
})

export const KpiTargetHistoryResponse = z.object({
  period: KpiPeriodKey,
  role: RoleId,
  metricKey: KpiMetricKey,
  /** `null` reads the role target's history; set, that person's line. */
  actorId: actorId.nullable(),
  entries: z.array(KpiTargetHistoryEntry),
})

export const KpiContributionsParams = KpiPeriodParams.extend({ actorId })

export const KpiContributionKind = z.enum([
  'opportunity',
  'contract',
  'meeting',
  'lead',
  'installment',
])

/** One record behind a figure. `value` is `null` where the record only counts
 *  (a meeting), `at` where it has no date to show. */
export const KpiContribution = z.object({
  kind: KpiContributionKind,
  code: z.string().min(1),
  label: z.string().min(1),
  at: Moment.nullable(),
  value: z.number().nullable(),
  /** A closed month's change; `value` is the signed delta (ADR 0115 §4). In the month it
   *  applies to it is inside the figure; with `sourcePeriod` = the listed month it is
   *  only in "after adjustments". */
  adjustment: z.object({ sourcePeriod: KpiPeriodKey, cause: KpiAdjustmentCause }).nullable(),
})

/** `truncated`: the list is capped server-side; the figure still counts all. */
export const KpiPersonContributions = z.object({
  actorId,
  role: RoleId,
  metricKey: KpiMetricKey,
  items: z.array(KpiContribution),
  truncated: z.boolean(),
})

export const KpiContributionsResponse = z.object({
  period: KpiPeriodKey,
  /** `true` when the month is closed and the list is read from its frozen basis (ADR 0115);
   *  a month closed before that basis existed reads today's data and says `false`. */
  frozen: z.boolean(),
  actorId,
  groups: z.array(KpiPersonContributions),
})

export type KpiFunnelStep = z.infer<typeof KpiFunnelStep>
export type KpiFunnelTarget = z.infer<typeof KpiFunnelTarget>
export type KpiConfigPeriodQuery = z.infer<typeof KpiConfigPeriodQuery>
export type KpiRoleMetricConfig = z.infer<typeof KpiRoleMetricConfig>
export type KpiRoleMetric = z.infer<typeof KpiRoleMetric>
export type KpiRoleMetricsResponse = z.infer<typeof KpiRoleMetricsResponse>
export type KpiRoleMetricsPatch = z.infer<typeof KpiRoleMetricsPatch>
export type KpiEffectiveCatalogResponse = z.infer<typeof KpiEffectiveCatalogResponse>
export type KpiAlertSettingResponse = z.infer<typeof KpiAlertSettingResponse>
export type KpiTargetHistorySource = z.infer<typeof KpiTargetHistorySource>
export type KpiTargetHistoryEvent = z.infer<typeof KpiTargetHistoryEvent>
export type KpiTargetHistoryQuery = z.infer<typeof KpiTargetHistoryQuery>
export type KpiTargetHistoryEntry = z.infer<typeof KpiTargetHistoryEntry>
export type KpiTargetHistoryResponse = z.infer<typeof KpiTargetHistoryResponse>
export type KpiContributionsParams = z.infer<typeof KpiContributionsParams>
export type KpiContributionKind = z.infer<typeof KpiContributionKind>
export type KpiContribution = z.infer<typeof KpiContribution>
export type KpiPersonContributions = z.infer<typeof KpiPersonContributions>
export type KpiContributionsResponse = z.infer<typeof KpiContributionsResponse>
