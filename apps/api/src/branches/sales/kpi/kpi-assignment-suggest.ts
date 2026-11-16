import { Inject, Injectable, Logger } from '@nestjs/common'
import type { AccessControl, Actor } from '@pv/engines'
import {
  KPI_PLAN_MONTHS,
  kpiMetricShare,
  rampFactor,
  salesPeriodSpan,
  TIERED_FROM,
  type KpiAssignmentSuggestion,
  type KpiMetricDef,
  type KpiPeriodKey,
  type RoleId,
} from '@pv/contracts'
import { ACCESS } from '@api/platform/engines/tokens'
import { pipelineSight } from './kpi-forecast-sight'
import { coverageOf } from './kpi-plan.service'
import { KpiPlanRepository } from './kpi-plan.repository'
import { KpiReadingsRepository } from './kpi-readings.repository'

/** The figure beside a person's additive box on the assignment page (ADR 0157 §3).
 *
 *  Built from the frozen close only (ADR 0115): the three newest closed months
 *  before the target month, which are not the three calendar months before it —
 *  the month an assignment is made in has not closed yet. Never written into the
 *  box. `ramped` is clamped at 0 because a month can end below it and the wire
 *  refuses a negative.  */

@Injectable()
export class KpiAssignmentSuggester {
  private readonly log = new Logger('sales.kpi')

  constructor(
    private readonly repo: KpiPlanRepository,
    private readonly readings: KpiReadingsRepository,
    @Inject(ACCESS) private readonly access: AccessControl,
  ) {}

  /** A hint only: a failure is logged and answers none, so a send that went through
   *  never reads as an error (`lastMonth`'s rule). */
  async forPeople(
    who: Actor,
    period: KpiPeriodKey,
    role: RoleId,
    defs: readonly KpiMetricDef[],
    people: readonly string[],
    started: ReadonlyMap<string, string | null>,
  ): Promise<Map<string, KpiAssignmentSuggestion[]>> {
    const additive = defs.filter((d) => kpiMetricShare(d) === 'additive')
    if (period < TIERED_FROM || additive.length === 0 || people.length === 0) return new Map()
    try {
      return await this.read(who, period, role, additive, people, started)
    } catch (error) {
      this.log.error(`KPI suggestion ${period} for ${role} not read: ${String(error)}`)
      return new Map()
    }
  }

  private async read(
    who: Actor,
    period: KpiPeriodKey,
    role: RoleId,
    additive: readonly KpiMetricDef[],
    people: readonly string[],
    started: ReadonlyMap<string, string | null>,
  ): Promise<Map<string, KpiAssignmentSuggestion[]>> {
    const closed = await this.repo.closedBefore(period, KPI_PLAN_MONTHS)
    const frozen = await this.repo.frozen(
      closed,
      role,
      people,
      additive.map((d) => d.key),
    )
    const pipe = additive.some((d) => d.key === 'signed-value')
      ? (await this.readings.pipeline({ key: period, ...salesPeriodSpan(period) }, people)).own
      : null
    const sees = pipelineSight(this.access, who)
    return new Map(
      people.map((id) => {
        const factor = rampFactor(started.get(id) ?? null, period)
        const list = additive.map((def): KpiAssignmentSuggestion => {
          const results = closed.map((p) => frozen.get(`${p}|${id}|${def.key}`))
          const enough = closed.length === KPI_PLAN_MONTHS && results.every((v) => v !== undefined)
          const last = results[0] ?? null
          const average = enough
            ? (results as number[]).reduce((a, b) => a + b, 0) / KPI_PLAN_MONTHS
            : null
          const base = enough ? average : last
          const ramped = base === null ? null : Math.max(0, Math.round(base * factor))
          const cover =
            def.key === 'signed-value'
              ? coverageOf(pipe?.get(id) ?? 0, ramped ?? 0, sees(id, 'own'))
              : null
          return {
            metricKey: def.key,
            enough,
            average,
            last,
            ramped,
            pipeline: cover?.pipeline ?? null,
            low: cover?.low ?? false,
          }
        })
        return [id, list]
      }),
    )
  }
}
