import type { AccessControl, Actor } from '@pv/engines'
import type { KpiPeriodKey } from '@pv/contracts'
import { denied } from '@api/platform/http/problem'
import { headOf, unitsAbove } from '@api/platform/org/org-heads'
import { rosterOf } from './kpi-allocation-team'
import type { KpiSeatService } from './kpi-seat.service'
import type { KpiOrgTree, KpiTeamRepository } from './kpi-team.repository'

/** Who reads one person's KPI behind a `kpi.view` door (ADR 0101, 0117 §6,
 *  0120 §7): that person, a holder of `kpi.view-all`, whoever reads that
 *  person's team in the roster of the month read — its lead, even while away,
 *  or whoever acts for the lead today (`KpiSeatService.readsTeam`) — and, in a
 *  month the org tree covers, the head of any unit at or above theirs or whoever
 *  acts for that head today (`readsInTree`). The person page, the contributions
 *  and the target history all ask this one question. */
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
  if (team !== null && (await seats.readsTeam(who, roster, team.id))) return true
  const tree = await teams.orgTreeAt(period)
  const unit = tree?.members.find((m) => m.actorId === actorId)?.unitId
  return tree !== null && unit !== undefined && (await readsInTree(seats, tree, who, unit))
}

/** A head reads their subtree with `kpi.view` alone; reading follows the seat. */
export async function readsInTree(
  seats: KpiSeatService,
  tree: KpiOrgTree,
  who: Actor,
  unitId: string,
): Promise<boolean> {
  const chain = [unitId, ...unitsAbove(tree, unitId)]
  if (chain.some((u) => headOf(tree, u) === who.id)) return true
  const acting = await seats.unitSeats(tree, chain)
  return chain.some((u) => acting.get(u)?.includes(who.id))
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
