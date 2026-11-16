import { z } from 'zod'
import { Day, Moment } from '../primitives'
import { KpiMetricKey, KpiPeriodKey } from './kpi'
import { KpiForecastAccuracy } from './kpi-forecast-commit'

/** Total score, grade and monthly 1:1 (ADR 0158 §3–4), closed months only.
 *
 *      GET  /sales/kpi/:period/people/:actorId/score
 *      GET  | PUT /sales/kpi/:period/one-on-ones/:actorId        PUT replaces note and actions
 *      POST /sales/kpi/:period/one-on-ones/:actorId/acknowledge  the person, no body
 *      POST /sales/kpi/one-on-one-actions/:actionId/done         the person or the writer, no body
 *      GET  /sales/kpi/me/actions                                open actions only
 *
 *  Weights and grade bands are the `kpi.score.*` settings, not constants here.
 *  A metric without a target is left out and the weights re-share. PUT and
 *  acknowledge answer the same `KpiOneOnOneResponse` the GET does. */

export const KpiGrade = z.enum(['A', 'B', 'C', 'D'])

export const KpiScoreLine = z.object({
  key: KpiMetricKey,
  actual: z.number().nullable(),
  target: z.number().nonnegative().nullable(),
  /** Achieved share in percent, already capped; a lower-is-better metric is target ÷ actual. */
  percent: z.number().nonnegative().nullable(),
  /** Share of the total, 0..1; the lines of one score sum to 1. */
  weight: z.number().min(0).max(1),
  lowerIsBetter: z.boolean(),
})

export const KpiMonthScore = z.object({
  period: KpiPeriodKey,
  score: z.number().nonnegative(),
  grade: KpiGrade,
  /** The role's hero metric, which carries the primary weight. */
  primary: KpiMetricKey,
  lines: z.array(KpiScoreLine),
})

export const KpiScoreResponse = z.object({
  /** `null` while the month is not closed. */
  score: KpiMonthScore.nullable(),
  accuracy: KpiForecastAccuracy.nullable(),
})

export const KpiOneOnOneAction = z.object({
  id: z.uuid(),
  text: z.string().min(1).max(200),
  due: Day,
  doneAt: Moment.nullable(),
})

export const KpiOneOnOneResponse = z.object({
  score: KpiMonthScore.nullable(),
  accuracy: KpiForecastAccuracy.nullable(),
  note: z.string().nullable(),
  actions: z.array(KpiOneOnOneAction),
  writerName: z.string().nullable(),
  sentAt: Moment.nullable(),
  acknowledgedAt: Moment.nullable(),
  /** The caller is the acting seat over this person and the person has not acknowledged yet. */
  canWrite: z.boolean(),
  /** The caller is the person, the note is written and not yet acknowledged. */
  canAcknowledge: z.boolean(),
  /** The caller may mark an open action done: the person, or a writer seat today, even after acknowledgement. */
  canMarkDone: z.boolean(),
})

export const KpiOneOnOneBody = z.object({
  note: z.string().trim().min(1).max(2000),
  actions: z.array(z.object({ text: z.string().trim().min(1).max(200), due: Day })).max(3),
})

export const KpiOneOnOneActionParams = z.object({ actionId: z.uuid() })

export const KpiMyAction = KpiOneOnOneAction.extend({ period: KpiPeriodKey })

export const KpiMyActionsResponse = z.object({ actions: z.array(KpiMyAction) })

export type KpiGrade = z.infer<typeof KpiGrade>
export type KpiScoreLine = z.infer<typeof KpiScoreLine>
export type KpiMonthScore = z.infer<typeof KpiMonthScore>
export type KpiScoreResponse = z.infer<typeof KpiScoreResponse>
export type KpiOneOnOneAction = z.infer<typeof KpiOneOnOneAction>
export type KpiOneOnOneResponse = z.infer<typeof KpiOneOnOneResponse>
export type KpiOneOnOneBody = z.infer<typeof KpiOneOnOneBody>
export type KpiOneOnOneActionParams = z.infer<typeof KpiOneOnOneActionParams>
export type KpiMyAction = z.infer<typeof KpiMyAction>
export type KpiMyActionsResponse = z.infer<typeof KpiMyActionsResponse>
