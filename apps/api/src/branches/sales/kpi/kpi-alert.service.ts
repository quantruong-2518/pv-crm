import { Injectable } from '@nestjs/common'
import {
  KPI_ALLOCATION_RETURNED,
  KPI_ALLOCATION_SUBMITTED,
  KPI_COUNTER_PROPOSED,
  KPI_COUNTER_RESOLVED,
  KPI_MONTH_UNCLOSED,
  KPI_TEAM_SHARE_ASSIGNED,
  type Actor,
} from '@pv/engines'
import {
  KPI_COUNTER_STATUS_LABEL,
  KPI_METRIC_LABEL,
  ROLE_LABEL,
  type KpiCounterResolveBody,
  type KpiCounterStatus,
  type KpiMetricKey,
} from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import { NotificationHub } from '@api/platform/notification/notification.hub'
import { KpiAllocationRepository, type KpiCounterRow } from './kpi-allocation.repository'
import type { KpiAllocationRowDb } from './kpi-allocation.schema'
import { rosterOf } from './kpi-allocation-team'
import { KpiTeamRepository } from './kpi-team.repository'

/** The month as a bell line prints it after the subject: month number, slash, year. */
export const monthLabel = (period: string): string =>
  `tháng ${Number(period.slice(5))}/${period.slice(0, 4)}`

/** The status a resolution leaves, whose label the proposals screen prints too. */
const OUTCOME: Record<KpiCounterResolveBody['resolution'], KpiCounterStatus> = {
  accept: 'accepted',
  keep: 'kept',
  counter: 'countered',
}

/** KPI allocation news for the bell (ADR 0099 §4), through the hub's one door
 *  and inside the writer's transaction, so a line commits or vanishes with the
 *  move it reports. The allocation services call it right after the move; the
 *  forecast alerts and the close reminder ride `KpiAlertSweeper`. Every event key carries the
 *  package's tier and version or the counter id, so a retried write is told
 *  once and a team's v2 is not mistaken for the room's. A `kpi-allocation`
 *  line's code is `packageCode`, so the link can open the role and team. */
@Injectable()
export class KpiAlertService {
  constructor(
    private readonly repo: KpiAllocationRepository,
    private readonly hub: NotificationHub,
    private readonly teams: KpiTeamRepository,
  ) {}

  /** Only holders with a line still to confirm: a re-sent version keeps the
   *  answer on every line it did not change, and that holder has nothing new.
   *  Every setter but the sender (E4 drops the actor) is asked to decide it;
   *  a re-send after a return is a new version, so it rings again. */
  async submitted(tx: Db, who: Actor, pkg: KpiAllocationRowDb): Promise<void> {
    const lines = await this.repo.lines([pkg.id], tx)
    const holders = lines.filter((l) => l.ackStatus === 'pending').map((l) => l.actorId)
    const label = await this.labelOf(tx, pkg)
    const event = {
      name: KPI_ALLOCATION_SUBMITTED,
      ref: { code: pkg.period },
      occurrence: occurrenceOf(pkg),
      actorId: who.id,
    }
    await this.hub.announce(tx, {
      event: { ...event, audiences: { holders: [...new Set(holders)] } },
      subject: { kind: 'kpi-target', code: pkg.period, label },
    })
    await this.hub.announce(tx, {
      event: { ...event, audiences: { approvers: await this.setters(tx) } },
      subject: { kind: 'kpi-allocation', code: packageCode(pkg), label },
    })
  }

  async returned(tx: Db, who: Actor, pkg: KpiAllocationRowDb, reason: string): Promise<void> {
    await this.hub.announce(tx, {
      event: {
        name: KPI_ALLOCATION_RETURNED,
        ref: { code: pkg.period },
        occurrence: occurrenceOf(pkg),
        actorId: who.id,
        audiences: { sender: [pkg.submittedBy] },
      },
      subject: await this.returnedSubject(tx, pkg),
      detail: { reason, period: pkg.period },
    })
  }

  /** A room package that gives teams a share was agreed: each team's lead is
   *  told once per team and version, and the line opens the team page. */
  async shareAssigned(
    tx: Db,
    who: Actor,
    pkg: KpiAllocationRowDb,
    teams: readonly { id: string; name: string; leadId: string }[],
  ): Promise<void> {
    for (const team of teams) {
      await this.hub.announce(tx, {
        event: {
          name: KPI_TEAM_SHARE_ASSIGNED,
          ref: { code: pkg.period },
          occurrence: `${pkg.role}/${pkg.version}/${team.id}`,
          actorId: who.id,
          audiences: { lead: [team.leadId] },
        },
        subject: {
          kind: 'kpi-team',
          code: team.id,
          label: `${team.name} · ${ROLE_LABEL[pkg.role]} · ${monthLabel(pkg.period)}`,
        },
        detail: { period: pkg.period },
      })
    }
  }

  /** A team's lead holds `kpi.view` only and the room subject needs
   *  `kpi.view-all`, so a returned team package points at the team page. */
  private async returnedSubject(tx: Db, pkg: KpiAllocationRowDb) {
    const label = await this.labelOf(tx, pkg)
    return pkg.teamId
      ? { kind: 'kpi-team' as const, code: pkg.teamId, label }
      : { kind: 'kpi-allocation' as const, code: packageCode(pkg), label }
  }

  /** A team counter is the lead's to answer (ADR 0101), on the team page; the
   *  setters take it when there is no lead to ask: a room counter, the lead's
   *  own line, or a lead locked out. Keyed on the counter id. */
  async countered(
    tx: Db,
    who: Actor,
    pkg: KpiAllocationRowDb,
    metricKey: KpiMetricKey,
    counterId: string,
  ): Promise<void> {
    const label = `${KPI_METRIC_LABEL[metricKey]} · ${await this.labelOf(tx, pkg)}`
    const event = {
      name: KPI_COUNTER_PROPOSED,
      ref: { code: pkg.period },
      occurrence: counterId,
      actorId: who.id,
    }
    const lead = pkg.teamId ? await this.answeringLead(tx, pkg.teamId, pkg.period, who.id) : null
    if (lead && pkg.teamId) {
      return this.hub.announce(tx, {
        event: { ...event, audiences: { lead: [lead] } },
        subject: { kind: 'kpi-team', code: pkg.teamId, label },
        detail: { period: pkg.period },
      })
    }
    await this.hub.announce(tx, {
      event: { ...event, audiences: { setters: await this.setters(tx) } },
      subject: { kind: 'kpi-allocation', code: packageCode(pkg), label },
    })
  }

  /** The team's lead in that month's roster, unless it is the proposer or locked
   *  out. A failed read falls back to the setters rather than abort the counter. */
  private answeringLead(tx: Db, teamId: string, period: string, proposer: string) {
    return this.hub.bellRead(tx, 'team lead', null, async (s) => {
      const lead = rosterOf(await this.teams.rosterAt(period, s)).leadOf(teamId)
      if (!lead || lead === proposer) return null
      return (await this.teams.disabledAmong([lead], s)).has(lead) ? null : lead
    })
  }

  /** No occurrence: one line per setter and month, however many sweeps ask. */
  async monthUnclosed(tx: Db, period: string): Promise<void> {
    await this.hub.announce(tx, {
      event: {
        name: KPI_MONTH_UNCLOSED,
        ref: { code: period },
        audiences: { setters: await this.setters(tx) },
      },
      subject: { kind: 'kpi-allocation', code: period, label: monthLabel(period) },
    })
  }

  /** Setters who can also open a `kpi-allocation` subject (it needs
   *  `kpi.view-all`); otherwise the hub would drop their line silently. */
  private async setters(tx: Db): Promise<string[]> {
    const [setters, viewers] = await Promise.all([
      this.hub.holding(tx, 'kpi.set-target', 'Sales'),
      this.hub.holding(tx, 'kpi.view-all', 'Sales'),
    ])
    return setters.filter((id) => viewers.includes(id))
  }

  /** The package's label, with the team's name when it is a team package. */
  private async labelOf(tx: Db, pkg: KpiAllocationRowDb): Promise<string> {
    const base = packageLabel(pkg)
    const name = pkg.teamId ? await this.repo.teamName(tx, pkg.teamId) : null
    return name ? `${base} · Nhóm ${name}` : base
  }

  async resolved(
    tx: Db,
    who: Actor,
    period: string,
    counter: KpiCounterRow,
    resolution: KpiCounterResolveBody['resolution'],
  ): Promise<void> {
    const label = `${KPI_METRIC_LABEL[counter.metricKey]} · ${monthLabel(period)} · ${KPI_COUNTER_STATUS_LABEL[OUTCOME[resolution]]}`
    await this.hub.announce(tx, {
      event: {
        name: KPI_COUNTER_RESOLVED,
        ref: { code: period },
        occurrence: counter.id,
        actorId: who.id,
        audiences: { proposer: [counter.actorId] },
      },
      subject: { kind: 'kpi-target', code: period, label },
    })
  }
}

/** A package's `kpi-allocation` link: `<period>:<role>`, plus `:<teamId>` on a team. */
export const packageCode = (pkg: Pick<KpiAllocationRowDb, 'period' | 'role' | 'teamId'>): string =>
  [pkg.period, pkg.role, pkg.teamId].filter(Boolean).join(':')

const packageLabel = (pkg: KpiAllocationRowDb): string =>
  `${ROLE_LABEL[pkg.role]} · ${monthLabel(pkg.period)}`

/** Tier before version: the room's v2 and a team's v2 are different packages. */
const occurrenceOf = (pkg: KpiAllocationRowDb): string =>
  `${pkg.role}/${pkg.teamId ?? 'room'}/${pkg.version}`
