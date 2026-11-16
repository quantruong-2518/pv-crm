import { z } from 'zod'
import { ContractCode, Day, Moment, MoneyVnd } from '../primitives'
import { RoleId } from '../auth'
import { ConfigCode } from './config'
import { KpiMetricKey, KpiPeriodKey, KpiTargetActor } from './kpi'
import { KpiFunnelStep } from './kpi-config'
import { KpiQuarterMonthReading } from './kpi-quarter'

/** Display-only reads of the personal KPI boards (ADR 0160 §8–9): shown, never scored.
 *
 *  Person routes take `KpiPersonParams` (`./kpi-plan`), unit routes `KpiUnitParams`
 *  (`./kpi-forecast-commit`); each schema names its route. A `rate` is a step over
 *  the step before and may pass 1 (older leads reaching MQL this month, ADR 0160);
 *  a `target` is 0..1. Both are `null` over a zero denominator. Sale's funnel is
 *  `KpiPlanResponse.leading.stages`, not a read here. */

const count = z.number().int().nonnegative()
const share = z.number().min(0).max(1)
/** Screens clamp a rate only when drawing it, so the figure stays true. */
const rate = z.number().nonnegative()
/** Signed-value credit may be a split share, so not a whole-dong `MoneyVnd`. */
const credit = z.number().nonnegative()

/** The person may hold several roles; funnel and trend are per role. */
export const KpiBoardRoleQuery = z.object({ role: RoleId })

/** `GET /sales/kpi/:period/people/:actorId/funnel?role=` — `KPI_FUNNEL[role]` in
 *  order, base first. `target` is the step's set target as a share; `null` = not drawn. */
export const KpiFunnelResponse = z.object({
  role: RoleId,
  steps: z.array(
    z.object({ step: KpiFunnelStep, count, rate: rate.nullable(), target: share.nullable() }),
  ),
})

/** `GET /sales/kpi/:period/people/:actorId/trend?role=` — the six months ending at
 *  `:period`, one series per metric of the role's set; a v2 key reads `null` before `KPI_V2_FROM`. */
export const KpiTrendResponse = z.object({
  role: RoleId,
  months: z.array(KpiPeriodKey).length(6),
  series: z.array(
    z.object({ key: KpiMetricKey, months: z.array(KpiQuarterMonthReading).length(6) }),
  ),
})

/** `GET|PUT /sales/kpi/:period/units/:unitId/marketing-budget` — `amount` null while
 *  unset. `spent` sums `source_cost` of SOURCE rows the unit's members own, by `spent_on`. */
export const KpiMarketingBudgetResponse = z.object({
  period: KpiPeriodKey,
  unitId: z.uuid(),
  amount: MoneyVnd.nullable(),
  spent: MoneyVnd,
  setBy: KpiTargetActor.nullable(),
  setAt: Moment.nullable(),
  /** The caller heads the unit, stands in for its head or sits above it. */
  canEdit: z.boolean(),
})

export const KpiMarketingBudgetBody = z.object({ amount: MoneyVnd })

/** `GET /sales/kpi/:period/people/:actorId/marketing-sources` — one row per SOURCE
 *  the person owns. `budget` is the person's unit's; `null` outside any unit. */
export const KpiMarketingSourcesResponse = z.object({
  rows: z.array(
    z.object({
      sourceCode: ConfigCode,
      name: z.string().min(1),
      leads: count,
      mql: count,
      rate: rate.nullable(),
      spent: MoneyVnd,
      costPerMql: MoneyVnd.nullable(),
    }),
  ),
  budget: KpiMarketingBudgetResponse.nullable(),
})

/** Where a BD lead came from: handed on by Marketing as MQL, or found by the BD. */
export const KpiBdLeadOrigin = z.enum(['marketing', 'self-sourced'])

/** `GET /sales/kpi/:period/people/:actorId/bd-origins` — `pipeline.created` is the
 *  value of deals the person opened in the month; `target` is `KPI_COVERAGE_LOW` ×
 *  the unit's missing `signed-value`, `null` with no unit target or when the reader
 *  may not read that unit. */
export const KpiBdOriginsResponse = z.object({
  origins: z.array(
    z.object({ origin: KpiBdLeadOrigin, leads: count, sql: count, opportunities: count }),
  ),
  pipeline: z.object({ created: MoneyVnd, target: credit.nullable() }),
})

const collection = {
  value: MoneyVnd,
  collected: MoneyVnd,
  overdue: MoneyVnd,
  notDue: MoneyVnd,
}

/** `GET /sales/kpi/:period/people/:actorId/presales-collection` — contracts with the
 *  person on the PRESALES lane; amounts, so the screen draws the shares. */
export const KpiPresalesCollectionResponse = z.object({
  contracts: z.array(
    z.object({ contractCode: ContractCode, customerName: z.string().min(1), ...collection }),
  ),
  totals: z.object(collection),
})

/** `GET /sales/kpi/:period/people/:actorId/signed-by-day` — the running month total of
 *  `signed-value`; `forecast` continues it from the person's latest weekly pick by
 *  expected close. `target` is the month's, `null` while none is agreed. */
export const KpiSignedByDayResponse = z.object({
  signed: z.array(
    z.object({ day: Day, contractCode: ContractCode, amount: credit, cumulative: credit }),
  ),
  forecast: z.array(z.object({ day: Day, cumulative: credit })),
  target: credit.nullable(),
})

export type KpiBoardRoleQuery = z.infer<typeof KpiBoardRoleQuery>
export type KpiFunnelResponse = z.infer<typeof KpiFunnelResponse>
export type KpiTrendResponse = z.infer<typeof KpiTrendResponse>
export type KpiMarketingBudgetResponse = z.infer<typeof KpiMarketingBudgetResponse>
export type KpiMarketingBudgetBody = z.infer<typeof KpiMarketingBudgetBody>
export type KpiMarketingSourcesResponse = z.infer<typeof KpiMarketingSourcesResponse>
export type KpiBdLeadOrigin = z.infer<typeof KpiBdLeadOrigin>
export type KpiBdOriginsResponse = z.infer<typeof KpiBdOriginsResponse>
export type KpiPresalesCollectionResponse = z.infer<typeof KpiPresalesCollectionResponse>
export type KpiSignedByDayResponse = z.infer<typeof KpiSignedByDayResponse>
