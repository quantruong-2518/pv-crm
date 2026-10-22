import type { AccessControl, Actor } from '@pv/engines'
import type { KpiPeriodKey } from '@pv/contracts'
import { denied } from '@api/platform/http/problem'
import { rosterOf } from './kpi-allocation-team'
import type { KpiSeatService } from './kpi-seat.service'
import type { KpiTeamRepository } from './kpi-team.repository'

/** Who reads one person's KPI behind a `kpi.view` door (ADR 0101, 0117 §6):
 *  that person, a holder of `kpi.view-all`, or whoever reads that person's team
 *  in the roster of the month read — its lead, even while away, or whoever acts
 *  for the lead today (`KpiSeatService.readsTeam`). The person page, the
 *  contributions and the target history all ask this one question. */
export async function readsPerson(
  access: AccessControl,
  teams: KpiTeamRepository,
  seats: KpiSeatService,
  who: Actor,
  period: KpiPeriodKey,
  actorId: string,
): Promise<boolean> {
  if (actorId === who.id || access.allows(who, 'kpi.view-all')) return true
  const roster = rosterOf(await teams.rosterAt(period))
  const team = roster.teamOf(actorId)
  return team !== null && (await seats.readsTeam(who, roster, team.id))
}

export async function assertReadsPerson(
  access: AccessControl,
  teams: KpiTeamRepository,
  seats: KpiSeatService,
  who: Actor,
  period: KpiPeriodKey,
  actorId: string,
): Promise<void> {
  if (await readsPerson(access, teams, seats, who, period, actorId)) return
  throw denied(
    'permission-denied',
    'Bạn chỉ xem được KPI của mình và của thành viên nhóm bạn phụ trách.',
  )
}
