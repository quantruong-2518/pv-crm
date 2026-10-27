import { Inject, Injectable } from '@nestjs/common'
import type { AccessControl, Actor } from '@pv/engines'
import {
  KpiAllocationResponse,
  KpiTeamViewResponse,
  type KpiAllocationDraftBody,
  type KpiAllocationSubmitBody,
  type KpiCounterResolveBody,
  type KpiPeriodKey,
  type KpiTeam,
  type KpiTeamReading,
} from '@pv/contracts'
import { ACCESS } from '@api/platform/engines/tokens'
import { invalid, notFound } from '@api/platform/http/problem'
import { KpiAllocationCounterService } from './kpi-allocation-counter.service'
import { KpiAllocationService, notLead } from './kpi-allocation.service'
import { additive, defOf } from './kpi-allocation.mapper'
import { readsInTree } from './kpi-person-access'
import { monthClock } from './kpi-rules'
import { rosterOf, type Roster } from './kpi-allocation-team'
import { KpiSeatService } from './kpi-seat.service'
import { teamsOf } from './kpi-team.mapper'
import { KpiTeamRepository, type RosterEntry } from './kpi-team.repository'
import { expectedOf, verdictOf } from './kpi-verdict'
import { KpiService } from './kpi.service'

type Figures = Pick<KpiTeamReading, 'value' | 'adjustedBy' | 'afterAdjustments'>

/** `null` when no member has a figure, so "no data" never reads as zero. */
const sumOf = (xs: readonly (number | null)[]): number | null =>
  xs.some((x) => x !== null) ? xs.reduce<number>((n, x) => n + (x ?? 0), 0) : null

/** Adjustment notes add like the values (ADR 0115). A member with no note
 *  counts at their own value toward the team's after-adjustments figure. */
function teamFigures(members: readonly Figures[]): Figures {
  const noted = members.some((r) => r.afterAdjustments !== null)
  return {
    value: sumOf(members.map((r) => r.value)),
    adjustedBy: sumOf(members.map((r) => r.adjustedBy)),
    afterAdjustments: noted ? sumOf(members.map((r) => r.afterAdjustments ?? r.value ?? 0)) : null,
  }
}

/** The team page and the team lead's own doors (ADR 0101). All of them take
 *  `kpi.view`: a lead holds nothing more, so "leads this team in the roster of
 *  the month" is checked here, never read off a permission.
 *
 *  Members' cards come from `KpiService.people` filtered to the team, so a
 *  member's card cannot differ from the room's. A team figure is the sum of the
 *  members' values for a count or money metric and nothing for the rest. */
@Injectable()
export class KpiTeamViewService {
  constructor(
    private readonly teams: KpiTeamRepository,
    private readonly packages: KpiAllocationService,
    private readonly counters: KpiAllocationCounterService,
    private readonly kpi: KpiService,
    @Inject(ACCESS) private readonly access: AccessControl,
    private readonly seats: KpiSeatService,
  ) {}

  async view(who: Actor, period: KpiPeriodKey, teamId: string): Promise<KpiTeamViewResponse> {
    const ctx = await this.packages.periodContext(period)
    const { roster, entries } = ctx.tier
    const all = this.access.allows(who, 'kpi.view-all')
    /* Reading follows the seat (ADR 0117 §6): the lead even while away, or whoever acts for them. */
    const actsForLead = await this.packages.actsFor(who, roster, teamId)
    if (!all && !actsForLead && !(await this.reads(who, period, roster, teamId))) throw notLead()
    if (!roster.team(teamId)) throw notFound('nhóm')

    const members = new Set(roster.membersOf(teamId))
    const [cards, team, allocations, counters] = await Promise.all([
      this.kpi.people(period, members, ctx),
      this.teamOf(entries, teamId),
      this.packages.teamPackages(period, teamId, ctx),
      this.counters.counterViews(period, teamId, ctx),
    ])
    const { tolerance } = ctx
    const mine = ctx.shares.filter((s) => s.teamId === teamId)
    const { elapsed } = monthClock(period)
    const readings = mine.flatMap((s): KpiTeamReading[] => {
      const def = defOf(s.role, s.metricKey)
      if (!def) return []
      if (!additive(def)) {
        return [
          {
            role: s.role,
            metricKey: s.metricKey,
            value: null,
            share: null,
            expected: null,
            verdict: 'no-data',
            adjustedBy: null,
            afterAdjustments: null,
          },
        ]
      }
      const { value, adjustedBy, afterAdjustments } = teamFigures(
        cards.people
          .flatMap((p) => p.scorecards.filter((c) => c.role === s.role))
          .flatMap((c) => c.readings.filter((r) => r.key === s.metricKey)),
      )
      const share = Number(s.value)
      return [
        {
          role: s.role,
          metricKey: s.metricKey,
          value,
          share,
          expected: expectedOf(share, def, elapsed),
          verdict: verdictOf(value, share, def, elapsed, tolerance),
          adjustedBy,
          afterAdjustments,
        },
      ]
    })
    return KpiTeamViewResponse.parse({
      period,
      monthClose: cards.monthClose,
      team,
      actsForLead,
      shares: mine.map((s) => ({ role: s.role, metricKey: s.metricKey, value: Number(s.value) })),
      readings,
      people: cards.people,
      allocations,
      counters,
    })
  }

  /** The lead drafts, never the head: the roster says who, `kpi.set-target` does not. */
  async draft(
    who: Actor,
    period: KpiPeriodKey,
    teamId: string,
    body: KpiAllocationDraftBody,
  ): Promise<KpiAllocationResponse> {
    if (body.teamId !== undefined && body.teamId !== teamId) {
      throw invalid({ teamId: ['Nhóm trong nội dung khác nhóm trên đường dẫn.'] })
    }
    if (body.shares.length > 0) {
      throw invalid({ shares: ['Gói của nhóm không chia tiếp cho nhóm khác.'] })
    }
    await this.packages.saveDraft(who, period, { ...body, teamId }, teamId)
    return this.packages.teamResponse(period, teamId)
  }

  async submit(
    who: Actor,
    period: KpiPeriodKey,
    teamId: string,
    body: KpiAllocationSubmitBody,
  ): Promise<KpiAllocationResponse> {
    if (body.teamId !== undefined && body.teamId !== teamId) {
      throw invalid({ teamId: ['Nhóm trong nội dung khác nhóm trên đường dẫn.'] })
    }
    await this.packages.send(who, period, body.role, body.ackDays, teamId)
    return this.packages.teamResponse(period, teamId)
  }

  /** Answers like the room's resolve door, over this team's packages. */
  async resolve(
    who: Actor,
    period: KpiPeriodKey,
    teamId: string,
    counterId: string,
    body: KpiCounterResolveBody,
  ): Promise<KpiAllocationResponse> {
    await this.counters.settleCounter(who, period, counterId, body, teamId)
    return this.packages.teamResponse(period, teamId)
  }

  /** The roster's lead and their seat, or a head above the team (ADR 0120 §7). */
  private async reads(who: Actor, period: KpiPeriodKey, roster: Roster, teamId: string) {
    if (await this.seats.readsTeam(who, roster, teamId)) return true
    const tree = await this.teams.orgTreeAt(period)
    return tree !== null && tree.nodes.some((n) => n.unitId === teamId)
      ? readsInTree(this.seats, tree, who, teamId)
      : false
  }

  /** Names come from `actor` whether or not the person is still enabled. */
  private async teamOf(entries: readonly RosterEntry[], teamId: string): Promise<KpiTeam> {
    const mine = entries.filter((e) => e.teamId === teamId)
    const faces = new Map(
      (await this.teams.actors(mine.map((e) => e.actorId))).map((a) => [a.id, a]),
    )
    const acting = await this.seats.actingFor(rosterOf(entries), [teamId])
    const team = teamsOf(mine, faces, acting).find((t) => t.id === teamId)
    if (!team) throw notFound('nhóm')
    return team
  }
}
