import { Injectable } from '@nestjs/common'
import type { Db } from '@api/platform/db/db.module'
import type { OrgHook, OrgSeedEntry } from '@api/platform/org/org-hook'
import { KpiSeatService } from './kpi-seat.service'
import { KpiTeamRepository } from './kpi-team.repository'

/** What KPI says about an org tree edit (ADR 0118 §5): the roster's own lock
 *  and floor, and the seat rule's setters, not copies of them, so a tree edit
 *  and an allocation send still cannot cross; the roster a first version starts
 *  from; and a `kpi_team` row per team unit, so a share for a team made in the
 *  tree keeps its FK and its name until wave 2e drops both. */
@Injectable()
export class KpiOrgHook implements OrgHook {
  constructor(
    private readonly teams: KpiTeamRepository,
    private readonly seats: KpiSeatService,
  ) {}

  lock(tx: Db): Promise<void> {
    return this.teams.lockRoster(tx)
  }

  floor(handle?: Db): Promise<string> {
    return this.teams.effectiveFrom(handle)
  }

  setters(): Promise<string[]> {
    return this.seats.setterHolders()
  }

  /** Called only while no tree version exists, so this reads the old roster. */
  rosterAt(period: string, handle?: Db): Promise<OrgSeedEntry[]> {
    return this.teams.rosterAt(period, handle)
  }

  teamSaved(tx: Db, team: { id: string; name: string; by: string }): Promise<void> {
    return this.teams.saveTeam(tx, team)
  }
}
