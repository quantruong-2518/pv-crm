import { Inject, Injectable } from '@nestjs/common'
import type { AccessControl, Actor } from '@pv/engines'
import {
  isTieredPeriod,
  KpiDeskResponse,
  RAMP_FROM,
  rampFactor,
  TIERED_FROM,
  type KpiDeskMember,
  type KpiDeskQuery,
  type KpiDeskSeat,
  type KpiDeskUnit,
  type KpiDeskUnitView,
  type KpiPeriodKey,
  type OrgUnitKind,
} from '@pv/contracts'
import { ACCESS } from '@api/platform/engines/tokens'
import { denied, notFound } from '@api/platform/http/problem'
import { headOf, membersUnder } from '@api/platform/org/org-heads'
import { spansOf } from '../performance/performance-period'
import { unitAccuracy } from './kpi-accuracy'
import { rosterOf } from './kpi-allocation-team'
import { KpiAssignmentRepository } from './kpi-assignment.repository'
import { KpiCloseRepository } from './kpi-close.repository'
import { KpiConfigService } from './kpi-config.service'
import { KpiDeskRepository } from './kpi-desk.repository'
import { coverageOver, faceOf, primaryOf, unitPrimary, type Face } from './kpi-desk.figures'
import { KpiForecastCommitRepository } from './kpi-forecast-commit.repository'
import { weekOfPeriod } from './kpi-forecast-commit.service'
import { pipelineSight } from './kpi-forecast-sight'
import { readsInTree } from './kpi-person-access'
import { KpiReadingsRepository } from './kpi-readings.repository'
import { monthClock, monthEnded, vietnamToday } from './kpi-rules'
import { KpiScoreReader } from './kpi-score.reader'
import { KpiSeatService } from './kpi-seat.service'
import { KpiTeamRepository, type KpiOrgTree } from './kpi-team.repository'
import { KpiService } from './kpi.service'

/** The unit tab of the per-role KPI desk (ADR 0159): which units the caller holds or
 *  acts for, and one unit's members. `kpi.view` only; who sees what is decided here.
 *
 *  A unit is an org-tree node from `TIERED_FROM` and a roster team before it. The head
 *  keeps the seat while away (ADR 0117 §6), so `holder` is read off the tree, never off
 *  `unitSeats`, which skips an away head; `stand-in` is whoever `unitSeats` names for a
 *  head who is away today, fallbacks included. */

export type DeskUnitRow = {
  id: string
  name: string
  level: OrgUnitKind
  parentId: string | null
  head: string | null
  members: string[]
}

/** One month's units with the seat reads that go with them. */
export type Ground = {
  tiered: boolean
  tree: KpiOrgTree | null
  units: DeskUnitRow[]
  names: ReadonlyMap<string, string>
  home: ReadonlyMap<string, DeskUnitRow>
  acting(unitIds: readonly string[], today: string): Promise<Map<string, string[]>>
}

export type Seated = {
  unit: DeskUnitRow
  seat: KpiDeskSeat
  forName: string | null
  until: string | null
}

const LEVELS: readonly OrgUnitKind[] = ['company', 'department', 'team']
const byLevelThenName = (a: DeskUnitRow, b: DeskUnitRow) =>
  LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level) || a.name.localeCompare(b.name, 'vi')

const asDeskUnit = (s: Seated): KpiDeskUnit => ({
  unitId: s.unit.id,
  name: s.unit.name,
  level: s.unit.level,
  seat: s.seat,
  forName: s.forName,
  until: s.until,
})

@Injectable()
export class KpiDeskService {
  constructor(
    private readonly repo: KpiDeskRepository,
    private readonly teams: KpiTeamRepository,
    private readonly seats: KpiSeatService,
    private readonly kpi: KpiService,
    private readonly config: KpiConfigService,
    private readonly readings: KpiReadingsRepository,
    private readonly scores: KpiScoreReader,
    private readonly commits: KpiForecastCommitRepository,
    private readonly assigned: KpiAssignmentRepository,
    private readonly closes: KpiCloseRepository,
    @Inject(ACCESS) private readonly access: AccessControl,
  ) {}

  async desk(
    who: Actor,
    period: KpiPeriodKey,
    query: KpiDeskQuery,
    today = vietnamToday(),
  ): Promise<KpiDeskResponse> {
    const ground = await this.groundOf(period)
    const mine = (await this.seatsOf(who, ground, today)).sort((a, b) =>
      byLevelThenName(a.unit, b.unit),
    )
    const company =
      this.access.allows(who, 'kpi.view-all') || mine.some((s) => s.unit.level === 'company')
    const chosen = query.unit
      ? (mine.find((s) => s.unit.id === query.unit) ?? (await this.above(who, ground, query.unit)))
      : mine[0]
    const units = [...mine, ...(chosen && !mine.includes(chosen) ? [chosen] : [])].map(asDeskUnit)
    return KpiDeskResponse.parse({
      company,
      units,
      unit: chosen ? await this.unitView(who, period, ground, chosen.unit, today) : null,
    })
  }

  /** The month's units and who sits where. A tiered month without a tree has no units. */
  async groundOf(period: KpiPeriodKey): Promise<Ground> {
    if (isTieredPeriod(period)) {
      const tree = await this.teams.orgTreeAt(period)
      const units = (tree?.nodes ?? []).map((n): DeskUnitRow => ({
        id: n.unitId,
        name: n.name,
        level: n.kind,
        parentId: n.parentId,
        head: tree ? headOf(tree, n.unitId) : null,
        members: tree ? membersUnder(tree, n.unitId) : [],
      }))
      const names = new Map((tree?.members ?? []).map((m) => [m.actorId, m.name]))
      const home = new Map(
        (tree?.members ?? []).flatMap((m) => {
          const unit = units.find((u) => u.id === m.unitId)
          return unit ? [[m.actorId, unit] as const] : []
        }),
      )
      const acting = async (ids: readonly string[], today: string) =>
        tree ? this.seats.unitSeats(tree, ids, today) : new Map<string, string[]>()
      return { tiered: true, tree, units, names, home, acting }
    }
    const roster = rosterOf(await this.teams.rosterAt(period))
    const units = roster.teams().map((t): DeskUnitRow => ({
      id: t.id,
      name: t.name,
      level: 'team',
      parentId: null,
      head: roster.leadOf(t.id),
      members: roster.membersOf(t.id),
    }))
    const heads = units.flatMap((u) => (u.head ? [u.head] : []))
    const names = new Map((await this.teams.actors(heads)).map((a) => [a.id, a.name]))
    const home = new Map(units.flatMap((u) => u.members.map((m) => [m, u] as const)))
    const acting = (ids: readonly string[], today: string) =>
      this.seats.leadSeats(roster, ids, today)
    return { tiered: false, tree: null, units, names, home, acting }
  }

  /** The units `who` heads, or acts for while their head is away today. One seat read,
   *  and only when some head is away. */
  async seatsOf(who: Actor, ground: Ground, today: string): Promise<Seated[]> {
    const away = await this.repo.absencesOn(today)
    const gone = ground.units.filter((u) => u.head && u.head !== who.id && away.has(u.head))
    const acting =
      gone.length > 0
        ? await ground.acting(
            gone.map((u) => u.id),
            today,
          )
        : new Map()
    return ground.units.flatMap((unit): Seated[] => {
      if (unit.head === who.id) return [{ unit, seat: 'holder', forName: null, until: null }]
      const absence = unit.head ? away.get(unit.head) : undefined
      if (!absence || !acting.get(unit.id)?.includes(who.id)) return []
      const forName = ground.names.get(unit.head!) ?? null
      return [{ unit, seat: 'stand-in', forName, until: absence.until }]
    })
  }

  /** A unit the caller does not hold: read-only for a head above it or a `kpi.view-all`
   *  holder (ADR 0159 §7); nobody else. */
  private async above(who: Actor, ground: Ground, unitId: string): Promise<Seated> {
    const unit = ground.units.find((u) => u.id === unitId)
    if (!unit) throw notFound('đơn vị')
    const reads =
      this.access.allows(who, 'kpi.view-all') ||
      (ground.tree !== null && (await readsInTree(this.seats, ground.tree, who, unitId)))
    if (!reads) throw denied('permission-denied', 'Bạn không phụ trách đơn vị này.')
    const forName = unit.head ? (ground.names.get(unit.head) ?? null) : null
    return { unit, seat: 'above', forName, until: null }
  }

  /** Cards, pace and pipeline for `ids` (everyone when absent), read once per kind. The
   *  pipeline is one statement for every signed-value holder among them. */
  async figuresOf(who: Actor, period: KpiPeriodKey, ids?: ReadonlySet<string>) {
    const [catalog, tolerance] = await Promise.all([
      this.config.effectiveCatalog(period),
      this.config.tolerance(),
    ])
    const cards = ids && ids.size === 0 ? [] : (await this.kpi.people(period, ids)).people
    const faces = cards.flatMap((p) => faceOf(p, catalog) ?? [])
    const holders = faces.filter((f) => f.signed).map((f) => f.actorId)
    const piped =
      holders.length > 0 ? await this.readings.pipeline(spansOf(period).current, holders) : null
    const sight = pipelineSight(this.access, who)
    return {
      faces,
      pipeline: piped?.own ?? new Map<string, number>(),
      sees: (actorId: string) => sight(actorId, 'own'),
      elapsed: monthClock(period).elapsed,
      tolerance,
    }
  }

  private async unitView(
    who: Actor,
    period: KpiPeriodKey,
    ground: Ground,
    unit: DeskUnitRow,
    today: string,
  ): Promise<KpiDeskUnitView> {
    const fig = await this.figuresOf(who, period, new Set(unit.members))
    const mates = fig.faces.filter((f) => f.actorId !== who.id)
    const ids = mates.map((f) => f.actorId)
    const holders = mates.filter((f) => f.signed).map((f) => f.actorId)
    const { week, editable } = weekOfPeriod(period, today)
    const over = monthEnded(period, today)
    const [scores, saved, started] = await Promise.all([
      this.scores.monthScores(spansOf(period).previous.key, ids),
      ground.tiered && editable && holders.length > 0
        ? this.commits.commitsOf(week, holders)
        : null,
      period >= RAMP_FROM ? this.assigned.startedOnOf(ids) : null,
    ])
    const member = (f: Face): KpiDeskMember => {
      const ramp = rampFactor(started?.get(f.actorId) ?? null, period)
      const last = scores.get(f.actorId)
      return {
        actorId: f.actorId,
        name: f.name,
        role: f.role,
        rampFactor: ramp < 1 ? ramp : null,
        primary: primaryOf(f.reading),
        ...coverageOver([f], fig.pipeline, fig.sees, over),
        lastScore: last ? { score: last.score, grade: last.grade } : null,
        forecastSaved: saved && f.signed ? saved.has(f.actorId) : null,
      }
    }
    return {
      unitId: unit.id,
      members: mates.map(member).sort((a, b) => a.name.localeCompare(b.name, 'vi')),
      primary: unitPrimary(fig.faces, fig.elapsed, fig.tolerance),
      ...coverageOver(fig.faces, fig.pipeline, fig.sees, over),
      lastAccuracy: await this.lastAccuracy(period, ground, unit.id),
      oneOnOnes: await this.oneOnOnes(period, ground, ids),
    }
  }

  /** Tiered units only: the month before must itself be tiered, and the unit must have
   *  stood in its tree, because accuracy sums whoever sat under it then. */
  private async lastAccuracy(period: KpiPeriodKey, ground: Ground, unitId: string) {
    const prev = spansOf(period).previous.key
    if (!ground.tiered || prev < TIERED_FROM) return null
    const tree = await this.teams.orgTreeAt(prev)
    if (!tree?.nodes.some((n) => n.unitId === unitId)) return null
    const found = await unitAccuracy(prev, [unitId], tree, this.repo.handle)
    return found.get(unitId)?.accuracy ?? null
  }

  /** `null` until last month is closed, and for any month before 1:1s existed. */
  private async oneOnOnes(period: KpiPeriodKey, ground: Ground, ids: readonly string[]) {
    const prev = spansOf(period).previous.key
    if (!ground.tiered || prev < TIERED_FROM || (await this.closes.of(prev)) === null) return null
    const rows = await this.repo.oneOnOnesOf(prev, ids)
    const acknowledged = [...rows.values()].filter((r) => r.acknowledged).length
    return { written: rows.size, acknowledged, total: ids.length }
  }
}
