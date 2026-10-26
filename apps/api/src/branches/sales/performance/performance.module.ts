import { Module } from '@nestjs/common'
import { EnginesModule } from '@api/platform/engines/engines.module'
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
 *  `EnginesModule` for one question: the money entries' open-deal list asks E2
 *  for the deal book's permission. `exports` is empty: no module asks this one. */
@Module({
  imports: [OpportunityModule, EnginesModule],
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
