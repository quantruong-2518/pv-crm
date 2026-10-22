import { Inject, Injectable } from '@nestjs/common'
import type { AccessControl, Actor } from '@pv/engines'
import {
  isCumulative,
  KpiForecastResponse,
  KpiWeeklyResponse,
  type KpiForecast,
  type KpiMetricDef,
  type KpiMetricKey,
  type KpiPeriodKey,
  type RoleId,
} from '@pv/contracts'
import { toContractRole } from '@api/platform/auth/auth.mapper'
import { ACCESS } from '@api/platform/engines/tokens'
import { denied, invalid, notFound } from '@api/platform/http/problem'
import { SettingService } from '@api/platform/setting/setting.service'
import { spansOf } from '../performance/performance-period'
import { targetSources } from './kpi-allocation.mapper'
import { KpiAllocationRepository } from './kpi-allocation.repository'
import { KpiCloseRepository } from './kpi-close.repository'
import { KpiConfigService } from './kpi-config.service'
import { assertReadsPerson } from './kpi-person-access'
import { KpiReadingsRepository, type KpiSeat } from './kpi-readings.repository'
import { monthClock, vietnamToday } from './kpi-rules'
import { KpiTargetsRepository } from './kpi-targets.repository'
import { KpiTeamRepository } from './kpi-team.repository'
import { elapsedOf } from './kpi-verdict'
import { agreedIn, toReadings } from './kpi.mapper'

/** "About to miss / about to hit" and the weekly cumulative series (ADR 0098 §6).
 *
 *  Nothing new is counted: figures come from `KpiReadingsRepository.values`
 *  and pace from `elapsedOf`, the two the scorecard verdict already uses, so
 *  a forecast cannot disagree with the card it sits beside.
 *
 *  Which target a figure is judged against is `targetSources`' call (ADR 0098
 *  §4) — the same one the scorecard makes, so the two cannot disagree. */

type Holder = { id: string; name: string; roleIds: readonly RoleId[] }
type Thresholds = { slipRatio: number; hitRatio: number }

const DAY_MS = 86_400_000

const addDays = (day: string, n: number): string =>
  new Date(Date.parse(day) + n * DAY_MS).toISOString().slice(0, 10)

/** Monday on or before `day`; a bare date parses as UTC midnight, so no zone. */
const mondayOf = (day: string): string =>
  addDays(day, -((new Date(Date.parse(day)).getUTCDay() + 6) % 7))

/** `elapsed` is 1 once the month closes, so a closed month projects its own
 *  value; 0 before the month and on its first day, where nothing can be
 *  extrapolated yet. Adjustments from closed months are one-off lumps, not a
 *  daily rate, so only the live part is scaled (ADR 0115). */
function projectedOf(
  value: number | null,
  adjusted: number | null,
  def: KpiMetricDef,
  elapsed: number,
): number | null {
  if (!def.paced || value === null || elapsed === 0) return null
  const lump = adjusted ?? 0
  return (value - lump) / elapsed + lump
}

/** Slip reads the forecast, hit reads what is already done: ADR 0098 §6 and
 *  the registry text of `kpi.alert.hit-percent` both say "already reached".
 *  Only a running month warns: a closed one has a verdict, a future one no pace. */
function flagOf(
  value: number | null,
  projected: number | null,
  target: number | null,
  def: KpiMetricDef,
  t: Thresholds,
  running: boolean,
): KpiForecast['flag'] {
  if (!running || !def.higherIsBetter || value === null || projected === null || !target) {
    return null
  }
  if (value / target >= t.hitRatio) return 'hit'
  return projected / target < t.slipRatio ? 'slip' : null
}

@Injectable()
export class KpiForecastService {
  constructor(
    private readonly readings: KpiReadingsRepository,
    private readonly targets: KpiTargetsRepository,
    private readonly allocations: KpiAllocationRepository,
    private readonly settings: SettingService,
    private readonly config: KpiConfigService,
    private readonly closes: KpiCloseRepository,
    private readonly teams: KpiTeamRepository,
    @Inject(ACCESS) private readonly access: AccessControl,
  ) {}

  async everyone(period: KpiPeriodKey): Promise<KpiForecastResponse> {
    const people = (await this.readings.people()).map((p) => ({
      ...p,
      roleIds: p.roleIds.map(toContractRole),
    }))
    return this.forecast(period, people)
  }

  async mine(who: Actor, period: KpiPeriodKey): Promise<KpiForecastResponse> {
    const holder = { id: who.id, name: who.name, roleIds: who.roleIds.map(toContractRole) }
    return this.forecast(period, [holder], who.id)
  }

  /** `mine` for someone else, behind `assertReadsPerson`. */
  async ofPerson(who: Actor, period: KpiPeriodKey, actorId: string): Promise<KpiForecastResponse> {
    await assertReadsPerson(this.access, this.teams, who, period, actorId)
    const person = await this.readings.person(actorId)
    if (!person) throw notFound('người này')
    return this.forecast(
      period,
      [{ ...person, roleIds: person.roleIds.map(toContractRole) }],
      actorId,
    )
  }

  /** The caller's own series: a room metric reads the room fragment, which
   *  counts each deal once however many people stand on it. */
  async weekly(
    who: Actor,
    period: KpiPeriodKey,
    role: RoleId,
    metricKey: KpiMetricKey,
  ): Promise<KpiWeeklyResponse> {
    if (!who.roleIds.map(toContractRole).includes(role)) {
      throw denied('permission-denied', 'Bạn không giữ vai này nên không xem được tiến độ của vai.')
    }
    const def = (await this.config.effectiveCatalog())[role].find((d) => d.key === metricKey)
    if (!def) throw invalid({ metricKey: ['Vai này không có chỉ số này.'] })
    if (!isCumulative(def)) {
      throw invalid({ metricKey: ['Chỉ số này không cộng dồn theo tuần được.'] })
    }

    const { from, to } = spansOf(period).current
    const today = vietnamToday()
    const seat: KpiSeat = { role, def }
    const [target, close] = await Promise.all([
      this.targetOf(period, who.id, role, metricKey),
      this.closes.of(period),
    ])
    /* A closed month charts its frozen basis, unless it closed before 0136 froze one. */
    const frozen = close !== null && (await this.readings.basisFrozen(period))
    const weeks = this.weeksOf(from, to).map((weekStart) => ({
      weekStart,
      end: addDays(weekStart, 7) < to ? addDays(weekStart, 7) : to,
      started: (weekStart > from ? weekStart : from) <= today,
    }))
    /* One scan of the month's rows for every started week's running total. */
    const totals = await this.readings.cumulativeAt(
      seat,
      { key: period, from, to },
      weeks.filter((w) => w.started).map((w) => w.end),
      who.id,
      frozen,
    )
    const points = weeks.map(({ weekStart, end, started }) => ({
      weekStart,
      cumulative: started ? (totals.get(end) ?? 0) : null,
      expected: target === null ? null : target * elapsedOf(from, to, end),
    }))
    return KpiWeeklyResponse.parse({ period, frozen, role, metricKey, points })
  }

  /** Every Monday whose week touches the month; the first may fall in the
   *  month before, and only the month's own days are counted for it. */
  private weeksOf(from: string, to: string): string[] {
    const weeks: string[] = []
    for (let w = mondayOf(from); w < to; w = addDays(w, 7)) weeks.push(w)
    return weeks
  }

  private async targetOf(
    period: KpiPeriodKey,
    actorId: string,
    role: RoleId,
    key: KpiMetricKey,
  ): Promise<number | null> {
    const [rows, lines] = await Promise.all([
      this.targets.ofPeriod(period),
      this.allocations.agreedLines(period, actorId),
    ])
    const agreed = agreedIn(targetSources(rows, lines).slotsFor(actorId), role, key)
    return agreed ? Number(agreed.value) : null
  }

  private async forecast(
    period: KpiPeriodKey,
    holders: readonly Holder[],
    only?: string,
  ): Promise<KpiForecastResponse> {
    const catalog = await this.config.effectiveCatalog()
    const seats = holders.flatMap((h) =>
      h.roleIds.flatMap((role) => catalog[role].map((def) => ({ role, def }))),
    )
    const { from, to } = spansOf(period).current
    const [monthClose, adjustments] = await Promise.all([
      this.closes.of(period),
      this.readings.adjustments(seats, period, only),
    ])
    const [values, rows, lines, thresholds] = await Promise.all([
      this.readings.monthValues(seats, { key: period, from, to }, only, {
        closed: monthClose !== null,
        adjustments,
      }),
      this.targets.ofPeriod(period),
      this.allocations.agreedLines(period, only),
      this.thresholds(),
    ])
    const { elapsed, phase } = monthClock(period)
    const running = phase === 'running'
    const sources = targetSources(rows, lines)

    const items = holders.flatMap((h) =>
      h.roleIds.flatMap((role) => {
        const defs = new Map(catalog[role].map((d) => [d.key, d]))
        /* Only value and target are read, so the verdict's tolerance is moot. */
        const ctx = {
          catalog,
          values,
          slots: sources.slotsFor(h.id),
          elapsed,
          running,
          tolerance: 0,
          adjustments,
        }
        /* `toReadings` is the card's own value and target rule: zero for an
           empty tally, nothing for a snapshot of a month not begun. */
        return toReadings(role, h.id, ctx).flatMap((r) => {
          const def = defs.get(r.key)
          if (!def?.paced) return []
          const target = r.target
          const projected = projectedOf(r.value, r.adjustedBy, def, elapsed)
          return [
            {
              actorId: h.id,
              name: h.name,
              role,
              metricKey: r.key,
              value: r.value,
              target,
              projected,
              projectedRatio: projected !== null && target ? projected / target : null,
              flag: flagOf(r.value, projected, target, def, thresholds, running),
            },
          ]
        })
      }),
    )
    return KpiForecastResponse.parse({ period, monthClose, thresholds, items })
  }

  /** Read once per request, above the loop (`SettingService.value`'s rule). */
  private async thresholds(): Promise<Thresholds> {
    const [slip, hit] = await Promise.all([
      this.settings.value('kpi.alert.slip-percent'),
      this.settings.value('kpi.alert.hit-percent'),
    ])
    return { slipRatio: slip.value / 100, hitRatio: hit.value / 100 }
  }
}
