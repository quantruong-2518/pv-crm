import { z } from 'zod'
import { Day, Moment, ObjectCode } from '../primitives'
import { KpiPeriodKey } from './kpi'
import { dayNo, weekdayOf } from './sales-period'

/** Weekly forecast commit (ADR 0158 §1–2), from `TIERED_FROM`; the month is checked server-side.
 *
 *      GET | PUT /sales/kpi/:period/commit/me                   a signed-value holder's own pick
 *      GET | PUT /sales/kpi/:period/units/:unitId/commit     the unit's review and commit
 *
 *  A week is named by its Monday and belongs to the month holding that Monday.
 *  One commit per person and per unit per week; a later save replaces it until
 *  the week ends. An opportunity is identified by its code, so "id" here is that code. */

/** A Monday as `YYYY-MM-DD`. */
export const KpiWeekKey = Day.refine((d) => weekdayOf(dayNo(d)) === 0, {
  error: 'Tuần bắt đầu từ thứ Hai.',
})

export const KpiUnitParams = z.object({ period: KpiPeriodKey, unitId: z.uuid() })

const money = z.number().int().nonnegative()
const actorId = z.string().min(1).max(64)

export const KpiForecastCandidate = z.object({
  opportunityId: ObjectCode,
  name: z.string().min(1),
  customerName: z.string().min(1),
  value: money,
  expectedClose: Day.nullable(),
})

export const KpiForecastMeResponse = z.object({
  week: KpiWeekKey,
  /** `false` once the week has ended. */
  editable: z.boolean(),
  candidates: z.array(KpiForecastCandidate),
  picked: z.array(ObjectCode),
  total: money,
  savedAt: Moment.nullable(),
})

export const KpiForecastMeBody = z.object({
  opportunityIds: z
    .array(ObjectCode)
    .max(50)
    .refine((ids) => new Set(ids).size === ids.length, { error: 'Cơ hội bị lặp.' }),
})

export const KpiUnitForecastPerson = z.object({
  actorId,
  name: z.string().min(1),
  /** `null` while the person has saved nothing this week. */
  total: money.nullable(),
  codes: z.array(ObjectCode),
  savedAt: Moment.nullable(),
})

export const KpiUnitForecastResponse = z.object({
  week: KpiWeekKey,
  people: z.array(KpiUnitForecastPerson),
  sum: money,
  committed: z.object({ amount: money, byName: z.string().min(1), at: Moment }).nullable(),
  /** The caller holds or stands in for this unit's seat and the week is open. */
  canCommit: z.boolean(),
})

export const KpiUnitForecastBody = z.object({ amount: money })

/** Frozen close values only (ADR 0158 §2); never scored. */
export const KpiForecastAccuracy = z.object({
  accuracy: z.number().min(0).max(1).nullable(),
  /** Weeks of the month that hold a commit. */
  weeks: z.number().int().nonnegative(),
  /** The last week's commit and the month's closed `signed-value`. */
  committed: money.nullable(),
  actual: z.number().nullable(),
})

export type KpiWeekKey = z.infer<typeof KpiWeekKey>
export type KpiUnitParams = z.infer<typeof KpiUnitParams>
export type KpiForecastCandidate = z.infer<typeof KpiForecastCandidate>
export type KpiForecastMeResponse = z.infer<typeof KpiForecastMeResponse>
export type KpiForecastMeBody = z.infer<typeof KpiForecastMeBody>
export type KpiUnitForecastPerson = z.infer<typeof KpiUnitForecastPerson>
export type KpiUnitForecastResponse = z.infer<typeof KpiUnitForecastResponse>
export type KpiUnitForecastBody = z.infer<typeof KpiUnitForecastBody>
export type KpiForecastAccuracy = z.infer<typeof KpiForecastAccuracy>
