import { Module } from '@nestjs/common'
import { LeaderboardController } from './leaderboard.controller'
import { LeaderboardRepository } from './leaderboard.repository'
import { LeaderboardService } from './leaderboard.service'

/** The sales desk side by side — one read-only door.
 *
 *  No `EnginesModule`, unlike its four siblings: the door is unscoped and asks
 *  E2 nothing beyond what `@Need` already declares, so there is no second grid
 *  to run. `imports` staying empty is the honest statement of that.
 *
 *  `exports` is empty too: no module needs to ask this one anything. The day
 *  one does it gets `LeaderboardService`, not the tables. */
@Module({
  controllers: [LeaderboardController],
  providers: [LeaderboardService, LeaderboardRepository],
})
export class LeaderboardModule {}
