import { Controller, Get, Query } from '@nestjs/common'
import { IndustryReportQuery } from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { IndustryReportService } from './industry-report.service'

/** The industry report (Reports menu). `campaign.view` and not `scoped`, exactly
 *  the source stats doors (`SourceController`): department numbers with no row
 *  in anyone's name, so a scope cut would only shrink them into noise. */
@Controller('sales/reports/industries')
export class IndustryReportController {
  constructor(private readonly report: IndustryReportService) {}

  @Get()
  @Need({ branch: 'Sales', permission: 'campaign.view' })
  read(@Query(zod(IndustryReportQuery)) q: IndustryReportQuery) {
    return this.report.read(q.period)
  }
}
