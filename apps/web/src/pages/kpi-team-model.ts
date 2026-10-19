import type {
  KpiAllocation,
  KpiTeam,
  KpiTeamShare,
  KpiTeamViewResponse,
  RoleId,
} from '@pv/contracts'
import { MONTH_PARAM, monthEnded } from './kpi-model'

/** What the team page computes besides what it draws: which roles the team has
 *  a share of, who holds each, which package belongs to a role, and whether the
 *  month still takes edits. No render, no fetch.
 *
 *  Sums and verdicts are the server's; nothing here adds figures up. */

/** Someone a line can be handed to. */
export type Recipient = { actorId: string; name: string }

export const teamPath = (teamId: string, period: string) =>
  `/sales/kpi/team/${encodeURIComponent(teamId)}?${MONTH_PARAM}=${period}`

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
