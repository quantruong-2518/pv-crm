import type { RoleId } from './types'

/** Who may act on behalf of whom: a strict seniority ladder over role ids.
 *  Peers never outrank each other, so a bd cannot act for another bd. The
 *  ranks live here, not in the permission matrix, because the matrix answers
 *  "may this role do X" while rank answers "may this person stand in for that one". */
const ROLE_RANK: Record<RoleId, number> = {
  marketing: 1,
  presales: 1,
  sale: 1,
  bd: 2,
  'account-executive': 3,
  'head-of-sales': 4,
  director: 5,
}

export const roleRank = (roleId: RoleId): number => ROLE_RANK[roleId]

export const highestRank = (roleIds: readonly RoleId[]): number =>
  roleIds.reduce((max, r) => Math.max(max, roleRank(r)), 0)

export const outranks = (
  actorRoleIds: readonly RoleId[],
  ownerRoleIds: readonly RoleId[],
): boolean => highestRank(actorRoleIds) > highestRank(ownerRoleIds)

/** May this person run that account, and hand it these roles. Unlike `outranks`
 *  a peer passes: a sole director has to be able to appoint a second. */
export const mayAdminister = (
  actorRoleIds: readonly RoleId[],
  targetRoleIds: readonly RoleId[],
  nextRoleIds: readonly RoleId[] = [],
): boolean =>
  highestRank(actorRoleIds) >= Math.max(highestRank(targetRoleIds), highestRank(nextRoleIds))

const TOP_RANK = Math.max(...Object.values(ROLE_RANK))

/** Sits at the top of the ladder. Locking and both password doors ask this rather
 *  than `mayAdminister`: each can hand a manager another person's account, and
 *  the agent reads whatever that account may read. Read from the table, not listed. */
export const isAdmin = (roleIds: readonly RoleId[]): boolean => highestRank(roleIds) === TOP_RANK

export const MEETING_CLOSER_ROLES: readonly RoleId[] = [
  'bd',
  'account-executive',
  'head-of-sales',
  'director',
]

export const canCloseMeetingOnBehalf = (
  actorRoleIds: readonly RoleId[],
  ownerRoleIds: readonly RoleId[],
): boolean =>
  actorRoleIds.some((r) => MEETING_CLOSER_ROLES.includes(r)) && outranks(actorRoleIds, ownerRoleIds)
