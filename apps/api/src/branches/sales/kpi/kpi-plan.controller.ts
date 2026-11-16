import { Controller, Get, Param } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import { KpiPersonParams } from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { CurrentActor } from '@api/platform/session/current-actor.decorator'
import { KpiPlanService } from './kpi-plan.service'

/** `/sales/kpi/:period/people/:actorId/plan` — read-only (ADR 0157). One door on
 *  `kpi.view`; whose plan the caller may read is `readsPerson`, in the service. */
@Controller('sales/kpi')
export class KpiPlanController {
  constructor(private readonly plan: KpiPlanService) {}

  @Get(':period/people/:actorId/plan')
  @Need({ branch: 'Sales', permission: 'kpi.view' })
  of(@CurrentActor() who: Actor, @Param(zod(KpiPersonParams)) params: KpiPersonParams) {
    return this.plan.of(who, params.period, params.actorId)
  }
}
