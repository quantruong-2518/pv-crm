import { Module } from '@nestjs/common'
import { OpportunityModule } from '../opportunity/opportunity.module'
import { PerformanceController } from './performance.controller'
import { PerformanceExitsRepository } from './performance-exits.repository'
import { PerformanceMoneyRepository } from './performance-money.repository'
import { PerformanceMoneyService } from './performance-money.service'
import { PerformanceRepository } from './performance.repository'
import { PerformanceService } from './performance.service'

/** The desk's period figures — four read-only doors.
 *
 *  `OpportunityModule` is imported, unlike the leaderboard's empty `imports`:
 *  the open pipeline is asked of `OpportunityService.scorecard` so the overview
 *  and the opportunity book cannot print two readings of "open".
 *
 *  No `EnginesModule`: the door is unscoped and asks E2 nothing beyond what
 *  `@Need` already declares; the money doors' `ownOnly` refusal reads the
 *  actor's own flag. `exports` is empty: no module asks this one. */
@Module({
  imports: [OpportunityModule],
  controllers: [PerformanceController],
  providers: [
    PerformanceService,
    PerformanceRepository,
    PerformanceExitsRepository,
    PerformanceMoneyService,
    PerformanceMoneyRepository,
  ],
})
export class PerformanceModule {}
