import { Inject, Injectable } from '@nestjs/common'
import type { AccessControl, Actor } from '@pv/engines'
import {
  KpiCompanyDeskResponse,
  TIERED_FROM,
  type KpiCompanyDeskUnit,
  type KpiPeriodKey,
} from '@pv/contracts'
import { ACCESS } from '@api/platform/engines/tokens'
import { denied } from '@api/platform/http/problem'
import { spansOf } from '../performance/performance-period'
import { additive } from './kpi-allocation.mapper'
import { companyCommitted, personAccuracy, weekAccuracy } from './kpi-accuracy'
import { KpiDeskRepository } from './kpi-desk.repository'
import { coverageOver, unitPrimary, type Face } from './kpi-desk.figures'
import { KpiDeskService, type DeskUnitRow, type Ground } from './kpi-desk.service'
import { weekOfPeriod } from './kpi-forecast-commit.service'
import { KpiScoreReader } from './kpi-score.reader'
import { KpiTeamRepository } from './kpi-team.repository'
import { monthEnded, vietnamToday } from './kpi-rules'

/** The company tab of the KPI desk (ADR 0159 §5): one row per unit and who is slipping.
 *  `kpi.view-all`, or the company seat in a tiered month (hole 1). Every figure is the
 *  unit's whole subtree, the same one its head sees on the unit tab. */

const SLIPPING_MAX = 10

/** Each department followed by its own teams, then the rest by name: a reader scans down
 *  a department, not across levels. */
function walk(units: readonly DeskUnitRow[]): DeskUnitRow[] {
  const byName = (a: DeskUnitRow, b: DeskUnitRow) => a.name.localeCompare(b.name, 'vi')
  const below = (parent: string | null) => units.filter((u) => u.parentId === parent).sort(byName)
  const walked = (parent: DeskUnitRow): DeskUnitRow[] =>
    below(parent.id).flatMap((u) => [u, ...walked(u)])
  const roots = units.filter((u) => u.level === 'company')
  return roots.length > 0
    ? roots.flatMap(walked)
    : units.filter((u) => u.parentId === null).sort(byName)
}

@Injectable()
export class KpiCompanyDeskService {
  constructor(
    private readonly desk: KpiDeskService,
    private readonly repo: KpiDeskRepository,
    private readonly teams: KpiTeamRepository,
    private readonly scores: KpiScoreReader,
    @Inject(ACCESS) private readonly access: AccessControl,
  ) {}

  async of(
    who: Actor,
    period: KpiPeriodKey,
    today = vietnamToday(),
  ): Promise<KpiCompanyDeskResponse> {
    const ground = await this.desk.groundOf(period)
    if (!this.access.allows(who, 'kpi.view-all')) {
      const held = await this.desk.seatsOf(who, ground, today)
      if (!held.some((s) => s.unit.level === 'company'))
        throw denied('permission-denied', 'Bạn không xem được KPI toàn công ty.')
    }
    const fig = await this.desk.figuresOf(who, period)
    const prev = spansOf(period).previous.key
    const at = weekOfPeriod(period, today)
    const week = at.week
    const rows = walk(ground.units).filter((u) => u.level !== 'company')
    const [scores, committed, acting] = await Promise.all([
      this.scores.monthScores(prev, [...new Set(rows.flatMap((u) => u.members))]),
      ground.tiered
        ? this.repo.unitsCommitted(
            week,
            rows.map((u) => u.id),
          )
        : new Set<string>(),
      ground.acting(
        rows.map((u) => u.id),
        today,
      ),
    ])
    const extra = rows.flatMap((u) => acting.get(u.id) ?? []).filter((id) => !ground.names.has(id))
    const named = new Map([
      ...ground.names,
      ...(await this.teams.actors([...new Set(extra)])).map((a) => [a.id, a.name] as const),
    ])

    const unitRow = (u: DeskUnitRow): KpiCompanyDeskUnit => {
      const faces = fig.faces.filter((f) => u.members.includes(f.actorId))
      const marks = u.members.flatMap((id) => scores.get(id)?.score ?? [])
      const here = acting.get(u.id) ?? []
      const covers = u.head !== null && !here.includes(u.head) && here[0] !== undefined
      return {
        unitId: u.id,
        name: u.name,
        headName: u.head ? (named.get(u.head) ?? null) : null,
        standInName: covers ? (named.get(here[0]!) ?? null) : null,
        primary: unitPrimary(faces, fig.elapsed, fig.tolerance),
        ...coverageOver(faces, fig.pipeline, fig.sees, monthEnded(period, today)),
        averageScore: marks.length > 0 ? marks.reduce((s, x) => s + x, 0) / marks.length : null,
        /* A week that has not started has nothing to commit yet. */
        forecastCommitted:
          ground.tiered && at.why !== 'not-started' && faces.some((f) => f.signed)
            ? committed.has(u.id)
            : null,
      }
    }
    return KpiCompanyDeskResponse.parse({
      units: rows.map(unitRow),
      slipping: slippingOf(fig.faces, ground),
      committed: await this.committedOf(period, ground, week, fig.faces),
    })
  }

  /** Null before the tiered months and while nothing is committed. Last month's accuracy is
   *  the mean over its committed weeks of the week's company figure against what the people
   *  froze at close; `null` while that month is open. */
  private async committedOf(
    period: KpiPeriodKey,
    ground: Ground,
    week: string,
    faces: readonly Face[],
  ) {
    if (!ground.tree) return null
    const db = this.repo.handle
    const amount = await companyCommitted(period, week, ground.tree, db)
    if (amount === null) return null
    const prev = spansOf(period).previous.key
    const tree = prev >= TIERED_FROM ? await this.teams.orgTreeAt(prev) : null
    if (!tree) return { amount, accuracyLastMonth: null }
    const frozen = await personAccuracy(
      prev,
      faces.map((f) => f.actorId),
      db,
    )
    const actuals = [...frozen.values()].map((a) => a.actual)
    const actual =
      actuals.length === 0 || actuals.some((a) => a === null)
        ? null
        : actuals.reduce<number>((s, a) => s + (a ?? 0), 0)
    const figures =
      actual === null
        ? []
        : await Promise.all(
            (await this.repo.committedWeeks(prev)).map((w) => companyCommitted(prev, w, tree, db)),
          )
    const kept = figures.filter((c): c is number => c !== null)
    const mean =
      actual === null || kept.length === 0
        ? null
        : kept.reduce((s, c) => s + weekAccuracy(c, actual), 0) / kept.length
    return { amount, accuracyLastMonth: mean }
  }
}

/** People behind on an own, higher-is-better, additive primary metric. The gap is the
 *  reading's own `expected` (what `verdictOf` paced against) less the value. */
function slippingOf(faces: readonly Face[], ground: Ground) {
  return faces
    .flatMap((f) => {
      const r = f.reading
      const behind = r?.verdict === 'behind' || r?.verdict === 'missed'
      const counts = f.def !== null && f.def.higherIsBetter && additive(f.def)
      if (!r || !behind || !counts || r.value === null || r.expected === null) return []
      const gap = r.expected - r.value
      const unitName = ground.home.get(f.actorId)?.name ?? null
      return gap > 0 ? [{ actorId: f.actorId, name: f.name, unitName, gap }] : []
    })
    .sort((a, b) => b.gap - a.gap)
    .slice(0, SLIPPING_MAX)
}
