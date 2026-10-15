import { Controller, Get, Param } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import { KpiContributionsParams } from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { CurrentActor } from '@api/platform/session/current-actor.decorator'
import { KpiContributionsService } from './kpi-contributions.service'

/** `/sales/kpi/:period/people/:actorId/contributions` — read-only (ADR 0099 §5).
 *
 *  One door on `kpi.view`, widened by E2 in the service for `kpi.view-all`:
 *  the `:period/allocations` read's shape, not two routes, because the
 *  contract names one path and the permission turns on WHOSE line, not on
 *  what the request does. */
@Controller('sales/kpi')
export class KpiContributionsController {
  constructor(private readonly contributions: KpiContributionsService) {}

  @Get(':period/people/:actorId/contributions')
  @Need({ branch: 'Sales', permission: 'kpi.view' })
  of(
    @CurrentActor() who: Actor,
    @Param(zod(KpiContributionsParams)) params: KpiContributionsParams,
  ) {
    return this.contributions.of(who, params.period, params.actorId)
  }
}
