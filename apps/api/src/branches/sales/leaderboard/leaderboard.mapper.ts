import type { LeaderboardRow } from '@pv/contracts'
import { toContractRole } from '@api/platform/auth/auth.mapper'
import type { LeaderboardTally } from './leaderboard.repository'

/** Tally row to wire row. The only difference between the two shapes is how a
 *  role is spelled, and this goes through the table `platform/auth` already
 *  keeps rather than a second one: adding a seventh role to E2 must break the
 *  build in one place, not fail to break it in two. */
export function toLeaderboardRow(t: LeaderboardTally): LeaderboardRow {
  return { ...t, roleId: toContractRole(t.roleId) }
}
