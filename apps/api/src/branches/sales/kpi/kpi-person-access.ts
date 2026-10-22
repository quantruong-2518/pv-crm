import type { AccessControl, Actor } from '@pv/engines'
import type { KpiPeriodKey } from '@pv/contracts'
import { denied } from '@api/platform/http/problem'
import { leadsOver, rosterOf } from './kpi-allocation-team'
import type { KpiTeamRepository } from './kpi-team.repository'

/** Who reads one person's KPI page behind a `kpi.view` door (ADR 0101): that
 *  person, a holder of `kpi.view-all`, or the lead of that person's team in the
 *  roster of the month read — the rule the contributions and history reads apply. */
export async function assertReadsPerson(
  access: AccessControl,
  teams: KpiTeamRepository,
  who: Actor,
  period: KpiPeriodKey,
  actorId: string,
): Promise<void> {
  if (actorId === who.id || access.allows(who, 'kpi.view-all')) return
  if (leadsOver(rosterOf(await teams.rosterAt(period)), who.id, actorId)) return
  throw denied(
    'permission-denied',
    'Bạn chỉ xem được KPI của mình và của thành viên nhóm bạn phụ trách.',
  )
}
