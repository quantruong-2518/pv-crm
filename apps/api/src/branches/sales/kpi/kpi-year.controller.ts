import { Controller, Get, Param } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import { KpiYearParams } from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { CurrentActor } from '@api/platform/session/current-actor.decorator'
import { KpiQuarterService } from './kpi-quarter.service'

/** `/sales/kpi/years/:year/me` — your cards read over a year (ADR 0158 §6).
 *
 *  Same door as the quarter: whoever sees the month view sees the year. */
@Controller('sales/kpi/years')
export class KpiYearController {
  constructor(private readonly quarters: KpiQuarterService) {}

  @Get(':year/me')
  @Need({ branch: 'Sales', permission: 'kpi.view' })
  me(@CurrentActor() who: Actor, @Param(zod(KpiYearParams)) params: KpiYearParams) {
    return this.quarters.year(who, params.year)
  }
}
