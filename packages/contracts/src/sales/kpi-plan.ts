import { z } from 'zod'
import { KpiPeriodKey } from './kpi'
import { StageKey } from './enums'

/** `GET /sales/kpi/:period/people/:actorId/plan` — leading indicators and the backward plan (ADR 0157).
 *
 *  Shown, never scored. Both halves are `null` when the person's scorecard has no
 *  `signed-value`. Ratios sum numerators and denominators before dividing, so a
 *  stage with nothing left reads `null`, not 0. Pipeline money follows ADR 0143's
 *  sight rule: a reader who may not see it gets the coverage flag and `pipeline: null`. */

/** Weighted pipeline ÷ missing target under this reads as low coverage. */
export const KPI_COVERAGE_LOW = 3
/** Closed months the stage rates, the average deal and the win rate look back over. */
export const KPI_PLAN_MONTHS = 3
/** Fewer won deals than this in those months and the plan has no figures. */
export const KPI_PLAN_MIN_WON = 3

export const KpiPersonParams = z.object({
  period: KpiPeriodKey,
  actorId: z.string().min(1).max(64),
})

const count = z.number().int().nonnegative()

/** Share of deals that left a stage and went forward; `left` is the deals that left it. */
export const KpiStageRate = z.object({
  stage: StageKey,
  rate: z.number().min(0).max(1).nullable(),
  left: count,
})

export const KpiLeading = z.object({
  coverage: z.object({
    pipeline: z.number().nonnegative().nullable(),
    /** The `signed-value` target still to sign this month. */
    missing: z.number().nonnegative(),
    ratio: z.number().nonnegative().nullable(),
    /** `ratio` is under `KPI_COVERAGE_LOW`; `null` once the month has ended. */
    low: z.boolean().nullable(),
  }),
  stages: z.array(KpiStageRate),
  newQualified: count,
})

/** Worked backwards from `missing`; every figure is `null` while `enough` is false. */
export const KpiMyPlan = z.object({
  enough: z.boolean(),
  missing: z.number().nonnegative(),
  averageDeal: z.number().nonnegative().nullable(),
  winRate: z.number().min(0).max(1).nullable(),
  dealsToWin: count.nullable(),
  oppsToOpen: count.nullable(),
  quotesToSend: count.nullable(),
})

export const KpiPlanResponse = z.object({
  leading: KpiLeading.nullable(),
  plan: KpiMyPlan.nullable(),
})

export type KpiPersonParams = z.infer<typeof KpiPersonParams>
export type KpiStageRate = z.infer<typeof KpiStageRate>
export type KpiLeading = z.infer<typeof KpiLeading>
export type KpiMyPlan = z.infer<typeof KpiMyPlan>
export type KpiPlanResponse = z.infer<typeof KpiPlanResponse>
