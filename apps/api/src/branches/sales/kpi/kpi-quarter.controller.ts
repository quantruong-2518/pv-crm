import { Controller, Get, Param } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import { KpiQuarterParams } from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { CurrentActor } from '@api/platform/session/current-actor.decorator'
import { KpiQuarterService } from './kpi-quarter.service'

/** `/sales/kpi/quarters/:quarter/me` — your cards read over a quarter (ADR 0146).
 *
 *  Whoever sees the month view sees the quarter, so the permission is the
 *  month door's. */
@Controller('sales/kpi/quarters')
export class KpiQuarterController {
  constructor(private readonly quarters: KpiQuarterService) {}

  @Get(':quarter/me')
  @Need({ branch: 'Sales', permission: 'kpi.view' })
  me(@CurrentActor() who: Actor, @Param(zod(KpiQuarterParams)) params: KpiQuarterParams) {
    return this.quarters.me(who, params.quarter)
  }
}
