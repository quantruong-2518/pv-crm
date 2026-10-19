import { Injectable } from '@nestjs/common'
import {
  KPI_ALLOCATION_RETURNED,
  KPI_ALLOCATION_SUBMITTED,
  KPI_COUNTER_RESOLVED,
  KPI_TEAM_SHARE_ASSIGNED,
  type Actor,
} from '@pv/engines'
import {
  KPI_COUNTER_STATUS_LABEL,
  KPI_METRIC_LABEL,
  ROLE_LABEL,
  type KpiCounterResolveBody,
  type KpiCounterStatus,
} from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import { NotificationHub } from '@api/platform/notification/notification.hub'
import { KpiAllocationRepository, type KpiCounterRow } from './kpi-allocation.repository'
import type { KpiAllocationRowDb } from './kpi-allocation.schema'

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
 *  forecast alerts are `KpiAlertSweeper`'s. Every event key carries the
 *  package's tier and version or the counter id, so a retried write is told
 *  once and a team's v2 is not mistaken for the room's. */
@Injectable()
export class KpiAlertService {
  constructor(
    private readonly repo: KpiAllocationRepository,
    private readonly hub: NotificationHub,
  ) {}

  /** Only holders with a line still to confirm: a re-sent version keeps the
   *  answer on every line it did not change, and that holder has nothing new. */
  async submitted(tx: Db, who: Actor, pkg: KpiAllocationRowDb): Promise<void> {
    const lines = await this.repo.lines([pkg.id], tx)
    const holders = lines.filter((l) => l.ackStatus === 'pending').map((l) => l.actorId)
    await this.hub.announce(tx, {
      event: {
        name: KPI_ALLOCATION_SUBMITTED,
        ref: { code: pkg.period },
        occurrence: occurrenceOf(pkg),
        actorId: who.id,
        audiences: { holders: [...new Set(holders)] },
      },
      subject: { kind: 'kpi-target', code: pkg.period, label: await this.labelOf(tx, pkg) },
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
      : { kind: 'kpi-allocation' as const, code: pkg.period, label }
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

const packageLabel = (pkg: KpiAllocationRowDb): string =>
  `${ROLE_LABEL[pkg.role]} · ${monthLabel(pkg.period)}`

/** Tier before version: the room's v2 and a team's v2 are different packages. */
const occurrenceOf = (pkg: KpiAllocationRowDb): string =>
  `${pkg.role}/${pkg.teamId ?? 'room'}/${pkg.version}`
