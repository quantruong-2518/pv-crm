import type {
  KpiAllocation,
  KpiTeam,
  KpiTeamShare,
  KpiTeamViewResponse,
  RoleId,
} from '@pv/contracts'
import { monthEnded } from './kpi-model'

/** What the team page computes besides what it draws: which roles the team has
 *  a share of, who holds each, which package belongs to a role, and whether the
 *  month still takes edits. No render, no fetch.
 *
 *  Sums and verdicts are the server's; nothing here adds figures up. */

/** Someone a line can be handed to. */
export type Recipient = { actorId: string; name: string }

/** Whether `me` acts for the team's lead today (ADR 0117): the lead while nobody
 *  stands in, else whoever `actingFor` names. */
export const actsFor = (team: Pick<KpiTeam, 'lead' | 'actingFor'>, me: string | undefined) =>
  me !== undefined &&
  (team.actingFor.length === 0
    ? team.lead.actorId === me
    : team.actingFor.some((a) => a.actorId === me))

/** Who answers a team counter, as the server decides (ADR 0117): whoever acts for
 *  the lead, minus the one who filed it. Empty = the target setters take it, and
 *  always for the roster lead's own: a member never settles their lead's target. */
export function counterActors(team: Pick<KpiTeam, 'lead' | 'actingFor'>, proposerId: string) {
  if (proposerId === team.lead.actorId) return []
  return (team.actingFor.length > 0 ? team.actingFor : [team.lead])
    .map((a) => a.actorId)
    .filter((id) => id !== proposerId)
}

/** The line beside a team's lead while someone stands in; null while the lead acts. */
export function actingLine(team: Pick<KpiTeam, 'actingFor'>, me: string | undefined) {
  if (team.actingFor.length === 0) return null
  if (team.actingFor.some((a) => a.actorId === me)) return 'Bạn đang làm thay trưởng nhóm'
  return `Người làm thay trưởng nhóm: ${team.actingFor.map((a) => a.name).join(', ')}`
}

/** Teams the reader acts for, from the roster: theirs as lead, or one they stand in for. */
export const teamsActedFor = (teams: readonly KpiTeam[], me: string | undefined) =>
  teams.filter((t) => actsFor(t, me))

/** The view has `monthClose` but no `closed`: a month is shut once it is over or was closed by hand. */
export const isClosed = (view: KpiTeamViewResponse) =>
  view.monthClose !== null || monthEnded(view.period)

/** Roles the room has given this team a share of, in the order the server sent them. */
export const sharedRoles = (shares: readonly KpiTeamShare[]): RoleId[] => [
  ...new Set(shares.map((s) => s.role)),
]

/** Members holding the role, plus anyone still on a line who no longer does. */
export function holdersOf(
  team: KpiTeam,
  role: RoleId,
  pkg: KpiAllocation | undefined,
): Recipient[] {
  const held = team.members
    .filter((m) => m.roleIds.includes(role))
    .map((m) => ({ actorId: m.actorId, name: m.name }))
  const known = new Set(held.map((h) => h.actorId))
  const strays = (pkg?.lines ?? []).filter((l) => !known.has(l.actorId) && known.add(l.actorId))
  return [...held, ...strays.map((l) => ({ actorId: l.actorId, name: l.name }))]
}

/** The role's package; a live one wins over the agreed one it replaces. */
export function packageOf(
  allocations: readonly KpiAllocation[],
  role: RoleId,
): KpiAllocation | undefined {
  const ofRole = allocations.filter((a) => a.role === role)
  return ofRole.find((a) => a.status !== 'superseded') ?? ofRole[0]
}
