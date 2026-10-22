import type { KpiTargetActor, KpiTeam, KpiTeamMember } from '@pv/contracts'
import type { ActorFace, RosterEntry, RosterFace } from './kpi-team.repository'

/** Roster rows → the team as the wire prints it. One copy, so the roster
 *  screen and the team page list the same people in the same order. */

export const memberOf = (a: ActorFace, lead: boolean): KpiTeamMember => ({
  actorId: a.id,
  name: a.name,
  roleIds: a.roleIds,
  lead,
})

/** Rows of a roster grouped by team, the lead first and the rest by name;
 *  `acting` is `KpiSeatService.actingFor`'s answer. */
export function teamsOf(
  entries: readonly RosterEntry[],
  faces: Map<string, RosterFace>,
  acting: ReadonlyMap<string, KpiTargetActor[]>,
): KpiTeam[] {
  const byTeam = new Map<string, { name: string; members: KpiTeamMember[] }>()
  for (const e of entries) {
    const face = faces.get(e.actorId)
    if (!face) continue
    const team = byTeam.get(e.teamId) ?? { name: e.teamName, members: [] }
    team.members.push(memberOf(face, e.lead))
    byTeam.set(e.teamId, team)
  }
  const teams: KpiTeam[] = []
  for (const [id, { name, members }] of byTeam) {
    members.sort((a, b) => Number(b.lead) - Number(a.lead) || a.name.localeCompare(b.name, 'vi'))
    const [lead] = members
    if (lead?.lead)
      teams.push({
        id,
        name,
        lead: { actorId: lead.actorId, name: lead.name },
        actingFor: acting.get(id) ?? [],
        members,
      })
  }
  return teams.sort((a, b) => a.name.localeCompare(b.name, 'vi'))
}
