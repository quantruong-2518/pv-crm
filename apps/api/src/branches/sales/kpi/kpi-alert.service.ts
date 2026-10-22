import { Injectable } from '@nestjs/common'
import {
  KPI_ALLOCATION_RETURNED,
  KPI_ALLOCATION_SUBMITTED,
  KPI_COUNTER_PROPOSED,
  KPI_COUNTER_RESOLVED,
  KPI_MONTH_UNCLOSED,
  KPI_STAND_IN,
  KPI_TEAM_SHARE_ASSIGNED,
  type Actor,
} from '@pv/engines'
import {
  NOTIFICATION_DETAIL_COUNT,
  NOTIFICATION_DETAIL_FOR,
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
import { KpiSeatService } from './kpi-seat.service'
import { KpiTeamRepository } from './kpi-team.repository'

export type StandInLine = {
  to: string[]
  forName: string
  waiting: number
  occurrence: string
  subject: { kind: 'kpi-team' | 'kpi-allocation'; code: string; label: string }
}

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
 *  line's code is `packageCode`, so the link can open the role and team.
 *  Every recipient is a seat read through `KpiSeatService` (ADR 0117). */
@Injectable()
export class KpiAlertService {
  constructor(
    private readonly repo: KpiAllocationRepository,
    private readonly hub: NotificationHub,
    private readonly teams: KpiTeamRepository,
    private readonly seats: KpiSeatService,
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
      event: { ...event, audiences: { approvers: await this.setters(tx, pkg.period, who.id) } },
      subject: { kind: 'kpi-allocation', code: packageCode(pkg), label },
    })
  }

  /** A team package goes back to whoever acts for the team now; a room one to
   *  whoever acts for its sender (ADR 0117 §3). */
  async returned(tx: Db, who: Actor, pkg: KpiAllocationRowDb, reason: string): Promise<void> {
    const seat = pkg.teamId
      ? ({ kind: 'team-lead', teamId: pkg.teamId } as const)
      : ({ kind: 'sender', actorId: pkg.submittedBy } as const)
    await this.hub.announce(tx, {
      event: {
        name: KPI_ALLOCATION_RETURNED,
        ref: { code: pkg.period },
        occurrence: occurrenceOf(pkg),
        actorId: who.id,
        audiences: {
          sender: await this.seats.bellActors(seat, pkg.period, undefined, tx, [who.id]),
        },
      },
      subject: await this.returnedSubject(tx, pkg),
      detail: { reason, period: pkg.period },
    })
  }

  /** A room package that gives teams a share was agreed: whoever acts for each
   *  team's lead is told once per team and version, and the line opens the
   *  team page — never dropped on a lead who cannot act (ADR 0117). */
  async shareAssigned(
    tx: Db,
    who: Actor,
    pkg: KpiAllocationRowDb,
    teams: readonly { id: string; name: string }[],
  ): Promise<void> {
    const roster = rosterOf(await this.teams.rosterAt(pkg.period, tx))
    const acting = await this.seats.bellLeadSeats(
      roster,
      teams.map((t) => t.id),
      undefined,
      tx,
      [who.id],
    )
    for (const team of teams) {
      await this.hub.announce(tx, {
        event: {
          name: KPI_TEAM_SHARE_ASSIGNED,
          ref: { code: pkg.period },
          occurrence: `${pkg.role}/${pkg.version}/${team.id}`,
          actorId: who.id,
          audiences: { lead: acting.get(team.id) ?? [] },
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

  /** A team counter is for whoever acts for the lead (ADR 0101, 0117), on the
   *  team page; the setters take it when nobody else is there to ask: a room
   *  counter, the roster lead's own line, or the acting person's own line.
   *  Keyed on the counter id. */
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
    const acting = pkg.teamId ? await this.answering(tx, pkg.teamId, pkg.period, who.id) : []
    if (acting.length > 0 && pkg.teamId) {
      return this.hub.announce(tx, {
        event: { ...event, audiences: { lead: acting } },
        subject: { kind: 'kpi-team', code: pkg.teamId, label },
        detail: { period: pkg.period },
      })
    }
    await this.hub.announce(tx, {
      event: { ...event, audiences: { setters: await this.setters(tx, pkg.period, who.id) } },
      subject: { kind: 'kpi-allocation', code: packageCode(pkg), label },
    })
  }

  /** Who acts for the team's lead, less the proposer. A failed read falls back
   *  to the setters rather than abort the counter. */
  private answering(tx: Db, teamId: string, period: string, proposer: string) {
    return this.hub.bellRead(tx, 'team lead', [], async (s) => {
      const roster = rosterOf(await this.teams.rosterAt(period, s))
      /* The roster lead's own counter is the setters' (ADR 0101), even while a member stands in. */
      if (roster.leadOf(teamId) === proposer) return []
      const acting = await this.seats.leadSeats(roster, [teamId], undefined, s)
      return (acting.get(teamId) ?? []).filter((id) => id !== proposer)
    })
  }

  /** No occurrence: one line per setter and month, however many sweeps ask. */
  async monthUnclosed(tx: Db, period: string): Promise<void> {
    await this.hub.announce(tx, {
      event: {
        name: KPI_MONTH_UNCLOSED,
        ref: { code: period },
        audiences: { setters: await this.setters(tx, period) },
      },
      subject: { kind: 'kpi-allocation', code: period, label: monthLabel(period) },
    })
  }

  /** Whoever now acts for `forName` hears it once per `occurrence` (ADR 0117
   *  §4): an absence's id, or a lead and the day they were locked. No actor —
   *  the system speaks, so a declarer naming themself is still told. */
  async standIn(tx: Db, line: StandInLine): Promise<void> {
    await this.hub.announce(tx, {
      event: {
        name: KPI_STAND_IN,
        ref: { code: line.subject.code },
        occurrence: line.occurrence,
        audiences: { standIn: line.to },
      },
      subject: line.subject,
      detail: {
        [NOTIFICATION_DETAIL_FOR]: line.forName,
        [NOTIFICATION_DETAIL_COUNT]: line.waiting,
      },
    })
  }

  /** The setters' bell pool today, less the actor (`KpiSeatService.bellActors`). */
  private setters(tx: Db, period: string, actorId?: string): Promise<string[]> {
    const without = actorId ? [actorId] : []
    return this.seats.bellActors({ kind: 'setters' }, period, undefined, tx, without)
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
