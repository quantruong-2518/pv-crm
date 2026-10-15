import { z } from 'zod'
import { Day, Moment } from '../primitives'
import { RoleId } from '../auth'
import { KpiMetricKey, KpiPeriodKey, KpiPeriodParams, KpiTargetActor } from './kpi'

/** `/sales/kpi/:period/…` — a role's agreed target split per person.
 *
 *  `GET allocations | counters | forecast[/me] | weekly/:role?metricKey=`,
 *  `PUT allocations/draft`, `POST allocations/submit`,
 *  `POST allocations/:role/decide | acknowledge | counters`,
 *  `POST counters/:counterId/resolve`. Every write answers `KpiAllocationResponse`.
 *
 *  A line sits beside the role target, never replacing it: `roleValue` reads the
 *  split against the role. Only additive metrics (count/money, scope `own`) are
 *  summed; any other split has no total, so it reads `null`, never 0. Where a
 *  person has an agreed line, `KpiReading.target` is that line and its
 *  `targetVersion` is the PACKAGE's version, not the role target's. */

const amount = z.number().nonnegative()
const actorId = z.string().min(1).max(64)
const reason = z.string().trim().min(1).max(500)

/** A `kpi.view`-only reader gets `superseded` for exactly one case: the last
 *  agreed package, still the one their card is judged by, while the next
 *  version is a draft or returned. It is in force, not newly handed down. */
export const KpiAllocationStatus = z.enum([
  'draft',
  'submitted',
  'returned',
  'agreed',
  'superseded',
])
export const KpiAckStatus = z.enum(['pending', 'acknowledged', 'countered'])
export const KpiCounterStatus = z.enum(['open', 'accepted', 'kept', 'countered'])

/** Declared once: the proposals screen and the bell line both print it. */
export const KPI_COUNTER_STATUS_LABEL: Record<z.infer<typeof KpiCounterStatus>, string> = {
  open: 'Chờ xử lý',
  accepted: 'Đã đồng ý',
  kept: 'Giữ mức cũ',
  countered: 'Đã đề nghị mức khác',
}

export const KpiCounterParams = KpiPeriodParams.extend({ counterId: z.string().min(1).max(64) })
export const KpiWeeklyQuery = z.object({ metricKey: KpiMetricKey })

export const KpiAllocationLine = KpiTargetActor.extend({
  metricKey: KpiMetricKey,
  value: amount,
  ackStatus: KpiAckStatus,
  ackedAt: Moment.nullable(),
  /** The role's agreed target for this metric; `null` while none is agreed. */
  roleValue: amount.nullable(),
  /** Last month's actual; `null` when it could not be read, not when it was 0. */
  lastMonth: z.number().nullable(),
})

export const KpiAllocationTotal = z.object({
  metricKey: KpiMetricKey,
  /** `null` for a metric that does not add up across people. */
  allocated: amount.nullable(),
  roleTarget: amount.nullable(),
  /** `allocated − roleTarget`; `null` when either side is. */
  delta: z.number().nullable(),
})

export const KpiAllocation = z.object({
  period: KpiPeriodKey,
  role: RoleId,
  version: z.number().int().min(1),
  status: KpiAllocationStatus,
  /** Whoever set the numbers last — on a draft, its author and the only sender. */
  submittedBy: KpiTargetActor.nullable(),
  submittedAt: Moment.nullable(),
  decidedBy: KpiTargetActor.nullable(),
  decidedAt: Moment.nullable(),
  returnReason: z.string().min(1).nullable(),
  lines: z.array(KpiAllocationLine),
  /** Empty for a reader without `kpi.view-all`: a sum gives away others' shares. */
  totals: z.array(KpiAllocationTotal),
})

export const KpiAllocationResponse = z.object({
  period: KpiPeriodKey,
  closed: z.boolean(),
  allocations: z.array(KpiAllocation),
})

/** `PUT …/allocations/draft` replaces the whole draft, so a line left out is
 *  removed. Whether a key belongs to the role's catalog is checked server-side. */
export const KpiAllocationDraftBody = z.object({
  role: RoleId,
  lines: z
    .array(z.object({ actorId, metricKey: KpiMetricKey, value: amount }))
    .min(1)
    .refine((l) => new Set(l.map((x) => `${x.actorId}|${x.metricKey}`)).size === l.length, {
      message: 'Chỉ tiêu bị lặp.',
    }),
})

export const KpiAllocationSubmitBody = z.object({ role: RoleId })

export const KpiAllocationDecideBody = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('agree') }),
  z.object({ decision: z.literal('return'), reason }),
])

/** No `metricKeys` acknowledges every line the caller holds in the role. */
export const KpiAcknowledgeBody = z.object({
  metricKeys: z
    .array(KpiMetricKey)
    .min(1)
    .refine((k) => new Set(k).size === k.length, { message: 'Chỉ tiêu bị lặp.' })
    .optional(),
})

export const KpiCounterBody = z.object({
  metricKey: KpiMetricKey,
  proposedValue: amount,
  reason,
})

export const KpiCounterResolveBody = z.discriminatedUnion('resolution', [
  z.object({ resolution: z.literal('accept') }),
  z.object({ resolution: z.literal('keep') }),
  z.object({ resolution: z.literal('counter'), value: amount }),
])

export const KpiCompensator = KpiTargetActor.extend({
  /** Suggested raise on this person's line toward closing the shortfall. */
  delta: z.number().positive(),
})

/** What accepting the counter would do to the role's split. */
export const KpiCounterEffect = z.object({
  allocatedAfter: amount.nullable(),
  roleTarget: amount.nullable(),
  /** `max(0, roleTarget − allocatedAfter)`; `null` for a non-additive metric. */
  shortfall: amount.nullable(),
  compensators: z.array(KpiCompensator),
})

export const KpiCounter = KpiTargetActor.extend({
  id: z.string().min(1).max(64),
  role: RoleId,
  metricKey: KpiMetricKey,
  assigned: amount,
  proposed: amount,
  reason: z.string().min(1),
  status: KpiCounterStatus,
  counterValue: amount.nullable(),
  createdAt: Moment,
  resolvedAt: Moment.nullable(),
  effect: KpiCounterEffect,
})

export const KpiCounterListResponse = z.object({
  period: KpiPeriodKey,
  counters: z.array(KpiCounter),
})

/** `projected` = value ÷ share of the month's Vietnam days elapsed (the same
 *  share the pace verdict uses), so a closed month projects its own value.
 *  `null` for an unpaced metric, a missing value, a missing target for the
 *  ratio, or before day one. `flag` is `slip` when `projectedRatio` is under
 *  `slipRatio`, `hit` when the figure already reached `hitRatio` of target
 *  (value, not projection), else `null`. */
export const KpiForecast = KpiTargetActor.extend({
  role: RoleId,
  metricKey: KpiMetricKey,
  value: z.number().nullable(),
  target: amount.nullable(),
  projected: z.number().nullable(),
  projectedRatio: z.number().nonnegative().nullable(),
  flag: z.enum(['slip', 'hit']).nullable(),
})

export const KpiForecastResponse = z.object({
  period: KpiPeriodKey,
  thresholds: z.object({ slipRatio: z.number().positive(), hitRatio: z.number().positive() }),
  items: z.array(KpiForecast),
})

/** Only cumulative metrics (money/count, paced) have a weekly series. */
export const KpiWeeklyPoint = z.object({
  weekStart: Day,
  /** `null` for a week that has not started yet. */
  cumulative: z.number().nullable(),
  /** `null` while the role has no agreed target. */
  expected: z.number().nonnegative().nullable(),
})

export const KpiWeeklyResponse = z.object({
  period: KpiPeriodKey,
  role: RoleId,
  metricKey: KpiMetricKey,
  points: z.array(KpiWeeklyPoint),
})

export type KpiAllocationStatus = z.infer<typeof KpiAllocationStatus>
export type KpiAckStatus = z.infer<typeof KpiAckStatus>
export type KpiCounterStatus = z.infer<typeof KpiCounterStatus>
export type KpiCounterParams = z.infer<typeof KpiCounterParams>
export type KpiWeeklyQuery = z.infer<typeof KpiWeeklyQuery>
export type KpiAllocationLine = z.infer<typeof KpiAllocationLine>
export type KpiAllocationTotal = z.infer<typeof KpiAllocationTotal>
export type KpiAllocation = z.infer<typeof KpiAllocation>
export type KpiAllocationResponse = z.infer<typeof KpiAllocationResponse>
export type KpiAllocationDraftBody = z.infer<typeof KpiAllocationDraftBody>
export type KpiAllocationSubmitBody = z.infer<typeof KpiAllocationSubmitBody>
export type KpiAllocationDecideBody = z.infer<typeof KpiAllocationDecideBody>
export type KpiAcknowledgeBody = z.infer<typeof KpiAcknowledgeBody>
export type KpiCounterBody = z.infer<typeof KpiCounterBody>
export type KpiCounterResolveBody = z.infer<typeof KpiCounterResolveBody>
export type KpiCompensator = z.infer<typeof KpiCompensator>
export type KpiCounterEffect = z.infer<typeof KpiCounterEffect>
export type KpiCounter = z.infer<typeof KpiCounter>
export type KpiCounterListResponse = z.infer<typeof KpiCounterListResponse>
export type KpiForecast = z.infer<typeof KpiForecast>
export type KpiForecastResponse = z.infer<typeof KpiForecastResponse>
export type KpiWeeklyPoint = z.infer<typeof KpiWeeklyPoint>
export type KpiWeeklyResponse = z.infer<typeof KpiWeeklyResponse>
