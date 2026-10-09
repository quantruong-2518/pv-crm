import { Controller, Get, Param } from '@nestjs/common'
import { SalesPerformanceParams } from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { PerformanceService } from './performance.service'

/** `/sales/performance/:period` — the overview's period figures in one read.
 *
 *  Its own root for the leaderboard's reason: the figures join all three books,
 *  so hanging the route off one would make the other two reach across for it.
 *  It asks for the performance permission, not the three books' own, which
 *  would shut out whoever reads how the desk is doing without holding a book.
 *
 *  NOT `scoped`: whole-book figures like the three scorecards they sit beside,
 *  none of which applies an `ownOnly` cut. */
@Controller('sales/performance')
export class PerformanceController {
  constructor(private readonly performance: PerformanceService) {}

  @Get(':period')
  @Need({ branch: 'Sales', permission: 'performance.view' })
  read(@Param(zod(SalesPerformanceParams)) params: SalesPerformanceParams) {
    return this.performance.read(params.period)
  }
}
