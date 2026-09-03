import { Injectable } from '@nestjs/common'
import { SalesLeaderboard } from '@pv/contracts'
import { toLeaderboardRow } from './leaderboard.mapper'
import { LeaderboardRepository } from './leaderboard.repository'

/** The desk side by side — read only, and it holds no engine.
 *
 *  No `Actor` and no scope axis: a leaderboard cut to "rows you own" is a
 *  leaderboard with one row on it. The door demands the performance permission
 *  instead, which is the one this answers a question for. */
@Injectable()
export class LeaderboardService {
  constructor(private readonly repo: LeaderboardRepository) {}

  async rows(): Promise<SalesLeaderboard> {
    /* Parsed rather than returned raw, like the two books: a column that
       changed type or a mapper that drifted trips here and not on a screen. */
    return SalesLeaderboard.parse({ rows: (await this.repo.rows()).map(toLeaderboardRow) })
  }
}
