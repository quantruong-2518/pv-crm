import { Inject, Injectable } from '@nestjs/common'
import type { AccessControl, Actor } from '@pv/engines'
import {
  KPI_CATALOG,
  KPI_COVERAGE_LOW,
  KPI_PLAN_MIN_WON,
  KPI_PLAN_MONTHS,
  KpiPlanResponse,
  salesPeriodSpan,
  stepSalesPeriod,
  StageKey,
  type KpiLeading,
  type KpiMetricDef,
  type KpiMyPlan,
  type KpiPeriodKey,
  type RoleId,
} from '@pv/contracts'
import { toContractRole } from '@api/platform/auth/auth.mapper'
import { ACCESS } from '@api/platform/engines/tokens'
import { notFound } from '@api/platform/http/problem'
import type { PeriodSpan } from '../performance/performance-period'
import { KpiConfigService } from './kpi-config.service'
import { KpiForecastService } from './kpi-forecast.service'
import { pipelineSight } from './kpi-forecast-sight'
import { assertReadsPerson } from './kpi-person-access'
import { KpiPlanRepository, type StageExits } from './kpi-plan.repository'
import { KpiReadingsRepository } from './kpi-readings.repository'
import { holdsSigned, monthEnded, vietnamToday } from './kpi-rules'
import { KpiSeatService } from './kpi-seat.service'
import { KpiTeamRepository } from './kpi-team.repository'

/** Leading indicators and the backward plan of one person (ADR 0157 §2, §4).
 *
 *  The month's value and target come from `KpiForecastService.ofPerson`, the
 *  pipeline from `KpiReadingsRepository.pipeline` — the one formula — so this
 *  read cannot disagree with the forecast beside it. The money is hidden from
 *  a reader the sight rule excludes, but the flag is computed from the real
 *  number first (ADR 0143). */

/** Pipeline over the month's missing target. */
export function coverageOf(real: number, missing: number, visible: boolean) {
  const ratio = missing > 0 ? real / missing : null
  return {
    pipeline: visible ? real : null,
    missing,
    ratio: visible ? ratio : null,
    low: ratio !== null && ratio < KPI_COVERAGE_LOW,
  }
}

const salesPeriodSpanOf = (period: KpiPeriodKey): PeriodSpan => ({
  key: period,
  ...salesPeriodSpan(period),
})

/** The catalog's own definition, so `metricSql` picks the role's override of it. */
const defOf = (role: RoleId, key: KpiMetricDef['key']): KpiMetricDef =>
  KPI_CATALOG[role].find((d) => d.key === key)!

/** The window of closed months before `period`, as one span. */
function windowBefore(period: KpiPeriodKey): PeriodSpan {
  let first: string = period
  for (let i = 0; i < KPI_PLAN_MONTHS; i += 1) first = stepSalesPeriod(first, -1)
  return {
    key: `${period}@plan`,
    from: salesPeriodSpan(first).from,
    to: salesPeriodSpan(period).from,
  }
}

const stagesOf = (exits: readonly StageExits[]): KpiLeading['stages'] =>
  StageKey.options.map((stage) => {
    const e = exits.find((x) => x.stage === stage)
    const left = (e?.forward ?? 0) + (e?.lost ?? 0)
    return { stage, left, rate: left > 0 ? (e?.forward ?? 0) / left : null }
  })

/** Any divisor that is not positive leaves that figure `null`. */
const upTo = (n: number, by: number | null): number | null =>
  by !== null && by > 0 ? Math.ceil(n / by) : null

@Injectable()
export class KpiPlanService {
  constructor(
    private readonly forecast: KpiForecastService,
    private readonly readings: KpiReadingsRepository,
    private readonly repo: KpiPlanRepository,
    private readonly config: KpiConfigService,
    private readonly teams: KpiTeamRepository,
    private readonly seats: KpiSeatService,
    @Inject(ACCESS) private readonly access: AccessControl,
  ) {}

  async of(
    who: Actor,
    period: KpiPeriodKey,
    actorId: string,
    today = vietnamToday(),
  ): Promise<KpiPlanResponse> {
    await assertReadsPerson(this.access, this.teams, this.seats, who, period, actorId)
    const person = await this.readings.person(actorId)
    if (!person) throw notFound('người này')
    const catalog = await this.config.effectiveCatalog()
    const seat = person.roleIds
      .map(toContractRole)
      .flatMap((role) => catalog[role].map((def) => ({ role, def })))
      .find((s) => holdsSigned(s.def))
    if (!seat) return KpiPlanResponse.parse({ leading: null, plan: null })

    const forecast = await this.forecast.ofPerson(who, period, actorId)
    const item = forecast.items.find((i) => i.role === seat.role && i.metricKey === 'signed-value')
    const missing = Math.max(0, (item?.target ?? 0) - (item?.value ?? 0))
    const pipe = await this.readings.pipeline(salesPeriodSpanOf(period), [actorId])
    const real = pipe.own.get(actorId) ?? 0
    const window = windowBefore(period)
    const [exits, signed, won, opened] = await Promise.all([
      this.repo.stageExits(window, actorId),
      this.repo.fold(seat, window, actorId),
      this.repo.fold({ role: seat.role, def: defOf('sale', 'win-rate') }, window, actorId),
      this.repo.enteredSale(salesPeriodSpanOf(period), actorId),
    ])
    const stages = stagesOf(exits)
    const cover = coverageOf(real, missing, pipelineSight(this.access, who)(actorId, 'own'))
    const leading: KpiLeading = {
      /* A month that has ended has nothing left to cover. */
      coverage: monthEnded(period, today)
        ? { ...cover, pipeline: null, ratio: null, low: null }
        : cover,
      stages,
      newQualified: opened,
    }
    const quote = stages.find((s) => s.stage === 'quotation')?.rate ?? null
    const plan =
      item?.target === undefined || item.target === null
        ? noPlan()
        : planOf(missing, signed, won, quote)
    return KpiPlanResponse.parse({ leading, plan })
  }
}

/** No signed-value target for the period: nothing to work backwards from, so no zero figures. */
const noPlan = (): KpiMyPlan => ({
  enough: false,
  missing: 0,
  averageDeal: null,
  winRate: null,
  dealsToWin: null,
  oppsToOpen: null,
  quotesToSend: null,
})

/** `won.rows` are the closed deals of the window, `ones` those that were won. */
function planOf(
  missing: number,
  signed: { sum: number; codes: number },
  won: { rows: number; ones: number },
  quoteRate: number | null,
): KpiMyPlan {
  if (signed.codes < KPI_PLAN_MIN_WON) {
    return {
      enough: false,
      missing,
      averageDeal: null,
      winRate: null,
      dealsToWin: null,
      oppsToOpen: null,
      quotesToSend: null,
    }
  }
  const averageDeal = signed.sum / signed.codes
  const winRate = won.rows > 0 ? won.ones / won.rows : null
  if (missing === 0) {
    return {
      enough: true,
      missing,
      averageDeal,
      winRate,
      dealsToWin: 0,
      oppsToOpen: 0,
      quotesToSend: 0,
    }
  }
  const dealsToWin = upTo(missing, averageDeal)
  return {
    enough: true,
    missing,
    averageDeal,
    winRate,
    dealsToWin,
    oppsToOpen: dealsToWin === null ? null : upTo(dealsToWin, winRate),
    quotesToSend: dealsToWin === null ? null : upTo(dealsToWin, quoteRate),
  }
}
