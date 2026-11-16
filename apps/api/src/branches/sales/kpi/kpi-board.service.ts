import { Inject, Injectable } from '@nestjs/common'
import type { AccessControl, Actor } from '@pv/engines'
import {
  KPI_COVERAGE_LOW,
  KPI_FUNNEL,
  KpiBdOriginsResponse,
  KpiFunnelResponse,
  KpiMarketingSourcesResponse,
  KpiPresalesCollectionResponse,
  KpiSignedByDayResponse,
  KpiTrendResponse,
  salesPeriodSpan,
  stepSalesPeriod,
  type KpiPeriodKey,
  type KpiScorecard,
  type RoleId,
} from '@pv/contracts'
import { toContractRole } from '@api/platform/auth/auth.mapper'
import { ACCESS } from '@api/platform/engines/tokens'
import { notFound } from '@api/platform/http/problem'
import { membersUnder } from '@api/platform/org/org-heads'
import { spansOf } from '../performance/performance-period'
import { KpiBudgetService } from './kpi-board-budget.service'
import { KpiBoardRepository } from './kpi-board.repository'
import { KpiConfigService } from './kpi-config.service'
import { faceOf, missingOf } from './kpi-desk.figures'
import { KpiForecastService } from './kpi-forecast.service'
import { pipelineSight } from './kpi-forecast-sight'
import { assertReadsPerson, readsInTree, readsPerson } from './kpi-person-access'
import { KpiReadingsRepository } from './kpi-readings.repository'
import { holdsSigned, monthEnded, vietnamToday } from './kpi-rules'
import { KpiSeatService } from './kpi-seat.service'
import { KpiTeamRepository } from './kpi-team.repository'
import { KpiService } from './kpi.service'

/** Display-only reads of the personal boards (ADR 0160 §9). Each runs behind `kpi.view`
 *  and the plan route's rule: the person, a `kpi.view-all` holder, or a seat above them.
 *  Nothing here is scored, and every figure folds the card's own basis where one exists. */

const MONTHS = 6
const DAY_MS = 86_400_000
const dayAfter = (day: string, n: number): string =>
  new Date(Date.parse(day) + n * DAY_MS).toISOString().slice(0, 10)

/** The real ratio, above 1 too (this month's MQLs over this month's leads, ADR 0160);
 *  a screen clamps only when it draws. */
const ratio = (n: number, of: number | undefined): number | null =>
  of !== undefined && of > 0 ? n / of : null

@Injectable()
export class KpiBoardService {
  constructor(
    private readonly repo: KpiBoardRepository,
    private readonly readings: KpiReadingsRepository,
    private readonly config: KpiConfigService,
    private readonly kpi: KpiService,
    private readonly forecast: KpiForecastService,
    private readonly budgets: KpiBudgetService,
    private readonly teams: KpiTeamRepository,
    private readonly seats: KpiSeatService,
    @Inject(ACCESS) private readonly access: AccessControl,
  ) {}

  /** The person's roles after the read check; a role they do not hold has no board. */
  private async holder(who: Actor, period: KpiPeriodKey, actorId: string, role?: RoleId) {
    await assertReadsPerson(this.access, this.teams, this.seats, who, period, actorId)
    const person = await this.readings.person(actorId)
    if (!person) throw notFound('người này')
    const roles = person.roleIds.map(toContractRole)
    if (role && !roles.includes(role)) throw notFound('vai trò này của người này')
    return { person, roles }
  }

  async funnel(
    who: Actor,
    period: KpiPeriodKey,
    actorId: string,
    role: RoleId,
  ): Promise<KpiFunnelResponse> {
    await this.holder(who, period, actorId, role)
    const { base, rated } = KPI_FUNNEL[role]
    if (base === null) return KpiFunnelResponse.parse({ role, steps: [] })
    const [counts, targets] = await Promise.all([
      this.repo.funnel(role, spansOf(period).current, actorId),
      this.config.funnelTargets(period, role),
    ])
    const order = [base, ...rated]
    return KpiFunnelResponse.parse({
      role,
      steps: order.map((step, i) => ({
        step,
        count: counts.get(step) ?? 0,
        rate: i === 0 ? null : ratio(counts.get(step) ?? 0, counts.get(order[i - 1]!)),
        target: targets.get(step) ?? null,
      })),
    })
  }

  /** The six months ending at `period`; the months are read in turn, one connection under PGlite.
   *  Each earlier month asks the read rule again: a seat held now may not have been held then. */
  async trend(
    who: Actor,
    period: KpiPeriodKey,
    actorId: string,
    role: RoleId,
  ): Promise<KpiTrendResponse> {
    await this.holder(who, period, actorId, role)
    const months: KpiPeriodKey[] = [period]
    while (months.length < MONTHS) months.unshift(stepSalesPeriod(months[0]!, -1) as KpiPeriodKey)
    const keys = (await this.config.effectiveCatalog(period))[role].map((d) => d.key)
    const cards: (KpiScorecard | undefined)[] = []
    for (const month of months) {
      const sees =
        month === period ||
        (await readsPerson(this.access, this.teams, this.seats, who, month, actorId))
      if (!sees) {
        cards.push(undefined)
        continue
      }
      const { people } = await this.kpi.people(month, new Set([actorId]))
      cards.push(people[0]?.scorecards.find((c) => c.role === role))
    }
    return KpiTrendResponse.parse({
      role,
      months,
      series: keys.map((key) => ({
        key,
        months: months.map((month, i) => {
          const r = cards[i]?.readings.find((x) => x.key === key)
          return { period: month, value: r?.value ?? null, target: r?.target ?? null }
        }),
      })),
    })
  }

  async sources(
    who: Actor,
    period: KpiPeriodKey,
    actorId: string,
  ): Promise<KpiMarketingSourcesResponse> {
    await this.holder(who, period, actorId)
    const rows = await this.repo.sources(spansOf(period).current, actorId)
    const tree = await this.teams.orgTreeAt(period)
    const unitId = tree?.members.find((m) => m.actorId === actorId)?.unitId
    const budget =
      tree && unitId
        ? await this.budgets.read(
            period,
            tree,
            unitId,
            await this.budgets.editable(who, period, tree, unitId),
          )
        : null
    return KpiMarketingSourcesResponse.parse({
      rows: rows.map((r) => {
        const spent = Math.round(r.spent)
        return {
          sourceCode: r.sourceCode,
          name: r.name,
          leads: r.leads,
          mql: r.mql,
          rate: ratio(r.mql, r.leads),
          spent,
          costPerMql: r.mql > 0 ? Math.round(spent / r.mql) : null,
        }
      }),
      budget,
    })
  }

  async bdOrigins(
    who: Actor,
    period: KpiPeriodKey,
    actorId: string,
  ): Promise<KpiBdOriginsResponse> {
    await this.holder(who, period, actorId)
    const span = spansOf(period).current
    const [found, created, missing] = await Promise.all([
      this.repo.origins(span, actorId),
      this.repo.createdValue(span, actorId),
      this.unitMissing(who, period, actorId),
    ])
    return KpiBdOriginsResponse.parse({
      origins: (['marketing', 'self-sourced'] as const).map((origin) => {
        const r = found.find((x) => x.origin === origin)
        return {
          origin,
          leads: r?.leads ?? 0,
          sql: r?.sql ?? 0,
          opportunities: r?.opportunities ?? 0,
        }
      }),
      pipeline: {
        created: Math.round(created),
        target: missing === null ? null : missing * KPI_COVERAGE_LOW,
      },
    })
  }

  /** What the person's unit still has to sign this month, as the desk counts it (`missingOf`);
   *  `null` with no unit, no target, or a reader the unit tab would refuse — the total would
   *  give away the unit's figures. */
  private async unitMissing(
    who: Actor,
    period: KpiPeriodKey,
    actorId: string,
  ): Promise<number | null> {
    const tree = await this.teams.orgTreeAt(period)
    const unitId = tree?.members.find((m) => m.actorId === actorId)?.unitId
    if (!tree || !unitId) return null
    const reads =
      this.access.allows(who, 'kpi.view-all') || (await readsInTree(this.seats, tree, who, unitId))
    if (!reads) return null
    const [catalog, { people }] = await Promise.all([
      this.config.effectiveCatalog(period),
      this.kpi.people(period, new Set(membersUnder(tree, unitId))),
    ])
    const holders = people
      .flatMap((p) => faceOf(p, catalog) ?? [])
      .filter((f) => f.signed && f.signed.reading.target !== null)
    return holders.length === 0 ? null : missingOf(holders)
  }

  async presalesCollection(
    who: Actor,
    period: KpiPeriodKey,
    actorId: string,
  ): Promise<KpiPresalesCollectionResponse> {
    await this.holder(who, period, actorId)
    const contracts = (await this.repo.collection(spansOf(period).current, actorId)).map((c) => {
      const value = Math.round(c.value)
      const collected = Math.round(c.collected)
      const overdue = Math.round(c.overdue)
      return {
        contractCode: c.contractCode,
        customerName: c.customerName,
        value,
        collected,
        overdue,
        notDue: Math.max(0, value - collected - overdue),
      }
    })
    const sum = (pick: (c: (typeof contracts)[number]) => number) =>
      contracts.reduce((s, c) => s + pick(c), 0)
    return KpiPresalesCollectionResponse.parse({
      contracts,
      totals: {
        value: sum((c) => c.value),
        collected: sum((c) => c.collected),
        overdue: sum((c) => c.overdue),
        notDue: sum((c) => c.notDue),
      },
    })
  }

  /** The month's running signed value by contract, and the person's latest weekly pick
   *  continued from it. A reader without the deal-book sight gets no forecast line. */
  async signedByDay(
    who: Actor,
    period: KpiPeriodKey,
    actorId: string,
    today = vietnamToday(),
  ): Promise<KpiSignedByDayResponse> {
    const { roles } = await this.holder(who, period, actorId)
    const catalog = await this.config.effectiveCatalog(period)
    const seat = roles
      .flatMap((role) => catalog[role].map((def) => ({ role, def })))
      .find((s) => holdsSigned(s.def))
    if (!seat) return KpiSignedByDayResponse.parse({ signed: [], forecast: [], target: null })

    const span = spansOf(period).current
    const frozen = await this.readings.basisFrozen(period)
    const [rows, forecast] = await Promise.all([
      this.repo.signedRows(seat, span, actorId, frozen),
      this.forecast.ofPerson(who, period, actorId),
    ])
    let total = 0
    const signed = rows.map((r) => {
      total += r.amount
      return { day: r.day, contractCode: r.contractCode, amount: r.amount, cumulative: total }
    })
    const target =
      forecast.items.find((i) => i.role === seat.role && i.metricKey === 'signed-value')?.target ??
      null
    const sees = pipelineSight(this.access, who)(actorId, 'own')
    const lines =
      sees && !monthEnded(period, today) ? await this.repo.forecastLines(period, actorId) : []
    return KpiSignedByDayResponse.parse({
      signed,
      forecast: forecastOf(lines, total, today, dayAfter(salesPeriodSpan(period).to, -1)),
      target,
    })
  }
}

/** Each pick lands on its deal's expected close, no earlier than today and no later than the
 *  month's last day; a deal with no date is left out rather than guessed. */
function forecastOf(
  lines: readonly { value: number; expectedClose: string | null }[],
  from: number,
  today: string,
  last: string,
): { day: string; cumulative: number }[] {
  const byDay = new Map<string, number>()
  for (const l of lines) {
    if (l.expectedClose === null) continue
    const day = l.expectedClose < today ? today : l.expectedClose > last ? last : l.expectedClose
    byDay.set(day, (byDay.get(day) ?? 0) + l.value)
  }
  let total = from
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, value]) => ({ day, cumulative: (total += value) }))
}
