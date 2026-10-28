import { Module } from '@nestjs/common'
import { IndustryReportController } from './industry-report.controller'
import { IndustryReportRepository } from './industry-report.repository'
import { IndustryReportService } from './industry-report.service'

/** The industry report — period figures over the lead, deal and contract
 *  books grouped by the CATEGORY/INDUSTRY lists. The leaderboard's standing:
 *  it reads all three books and no module asks it anything. */
@Module({
  controllers: [IndustryReportController],
  providers: [IndustryReportService, IndustryReportRepository],
})
export class IndustryReportModule {}
