import { Controller, Get, Query } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import { StopLogQuery } from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { CurrentActor } from '@api/platform/session/current-actor.decorator'
import { StopLogService } from './stop-log.service'

/** `/sales/stop-log` — one row per stop decision (ADR 0125). Its own root for
 *  the performance module's reason: it joins all three books. `lead.view` opens
 *  it; deal and contract rows each need their own view, checked in the service. */
@Controller('sales/stop-log')
export class StopLogController {
  constructor(private readonly log: StopLogService) {}

  @Get()
  @Need({ branch: 'Sales', permission: 'lead.view', scoped: true })
  list(@CurrentActor() who: Actor, @Query(zod(StopLogQuery)) q: StopLogQuery) {
    return this.log.page(who, q)
  }
}
