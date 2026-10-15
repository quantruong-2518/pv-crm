import { z } from 'zod'
import { Moment } from '../primitives'
import { RoleId } from '../auth'
import { SETTING_REGISTRY } from '../setting'
import {
  KPI_CATALOG,
  KpiMetricDef,
  KpiMetricKey,
  KpiPeriodKey,
  KpiPeriodParams,
  KpiTargetActor,
} from './kpi'

/** KPI configuration, target history and per-person contributions.
 *
 *  `GET sales/kpi/catalog` · `GET|PUT sales/config/kpi-metrics` ·
 *  `GET|PATCH sales/config/kpi-alert` (body `KpiAlertPatch`, `../setting`) ·
 *  `GET sales/kpi/:period/history` · `GET …/:period/people/:actorId/contributions`.
 *  Config writes answer `ConfigProposalReceipt` — the approval flow every config
 *  list uses (ADR 0095 §4), no second door.
 *
 *  The metric config is an OVERLAY on `KPI_CATALOG`, not a list of its own:
 *  formulas live in code, so config may only switch a catalog metric on or off
 *  and move the primary. A metric outside the catalog has no formula to run. */

const actorId = z.string().min(1).max(64)

/** One stored overlay row; a role with no rows reads as the catalog itself. */
export const KpiRoleMetricConfig = z.object({
  role: RoleId,
  metricKey: KpiMetricKey,
  enabled: z.boolean(),
  primary: z.boolean(),
})

/** `inCatalog` is a literal: the overlay cannot add a metric, so a row that
 *  claims otherwise is a server bug the parse should surface. */
export const KpiRoleMetric = KpiMetricDef.omit({ key: true }).extend({
  metricKey: KpiMetricKey,
  enabled: z.boolean(),
  inCatalog: z.literal(true),
})

export const KpiRoleMetricsResponse = z.object({
  roles: z.array(z.object({ role: RoleId, metrics: z.array(KpiRoleMetric) })),
})

/** `PUT` replaces the role's whole overlay, so every catalog metric of the role
 *  must be listed — a missing one would be ambiguous between "off" and "as
 *  before". The role is in the body, so catalog membership is checked here. */
export const KpiRoleMetricsPatch = z
  .object({
    role: RoleId,
    metrics: z
      .array(z.object({ metricKey: KpiMetricKey, enabled: z.boolean(), primary: z.boolean() }))
      .min(1),
  })
  .superRefine(({ role, metrics }, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: 'custom', message, path: ['metrics'] })
    const keys = metrics.map((m) => m.metricKey)
    const catalog = KPI_CATALOG[role].map((d) => d.key)
    if (new Set(keys).size !== keys.length) fail('Chỉ số bị lặp.')
    if (keys.length !== catalog.length || !catalog.every((k) => keys.includes(k))) {
      fail('Gửi đủ các chỉ số của vai này.')
    }
    // An enabled primary also guarantees at least one enabled metric.
    const primary = metrics.filter((m) => m.primary)
    if (primary.length !== 1) fail('Mỗi vai có đúng một chỉ số chính.')
    else if (!primary[0]?.enabled) fail('Chỉ số chính phải đang bật.')
  })

/** The catalog with the overlay applied — what every reading screen groups by.
 *  Keyed by every `RoleId` (zod 4 records over an enum are exhaustive). */
export const KpiEffectiveCatalogResponse = z.object({
  roles: z.record(RoleId, z.array(KpiMetricDef)),
})

const slipDef = SETTING_REGISTRY['kpi.alert.slip-percent']
const hitDef = SETTING_REGISTRY['kpi.alert.hit-percent']

/** The pair as stored in `platform.setting`. `isDefault` means neither key has
 *  a row; otherwise `updatedBy`/`updatedAt` name the latest write of the two. */
export const KpiAlertSettingResponse = z
  .object({
    slipPercent: z.number().int().min(slipDef.min).max(slipDef.max),
    hitPercent: z.number().int().min(hitDef.min).max(hitDef.max),
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
  actorId,
  groups: z.array(KpiPersonContributions),
})

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
