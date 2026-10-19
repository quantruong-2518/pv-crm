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
import { monthClock } from './kpi-rules'
import { teamsOf } from './kpi-team.mapper'
import { KpiTeamRepository, type RosterEntry } from './kpi-team.repository'
import { expectedOf, verdictOf } from './kpi-verdict'
import { KpiService } from './kpi.service'

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
  ) {}

  async view(who: Actor, period: KpiPeriodKey, teamId: string): Promise<KpiTeamViewResponse> {
    const ctx = await this.packages.periodContext(period)
    const { roster, entries } = ctx.tier
    const all = this.access.allows(who, 'kpi.view-all')
    /* A stand-in for a locked lead edits too, so `iLead` is "acts for the lead". */
    const iLead = await this.packages.actsFor(who, roster, teamId)
    if (!all && !iLead) throw notLead()
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
          },
        ]
      }
      const figures = cards.people
        .flatMap((p) => p.scorecards.filter((c) => c.role === s.role))
        .flatMap((c) => c.readings.filter((r) => r.key === s.metricKey))
        .flatMap((r) => (r.value === null ? [] : [r.value]))
      const value = figures.length > 0 ? figures.reduce((n, v) => n + v, 0) : null
      const share = Number(s.value)
      return [
        {
          role: s.role,
          metricKey: s.metricKey,
          value,
          share,
          expected: expectedOf(share, def, elapsed),
          verdict: verdictOf(value, share, def, elapsed, tolerance),
        },
      ]
    })
    return KpiTeamViewResponse.parse({
      period,
      monthClose: cards.monthClose,
      team,
      iLead,
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

  /** Names come from `actor` whether or not the person is still enabled. */
  private async teamOf(entries: readonly RosterEntry[], teamId: string): Promise<KpiTeam> {
    const mine = entries.filter((e) => e.teamId === teamId)
    const faces = new Map(
      (await this.teams.actors(mine.map((e) => e.actorId))).map((a) => [a.id, a]),
    )
    const team = teamsOf(mine, faces).find((t) => t.id === teamId)
    if (!team) throw notFound('nhóm')
    return team
  }
}
