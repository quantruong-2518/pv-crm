import { Controller, Get, Param, Query } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import { KpiPeriodParams, KpiTargetHistoryQuery } from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { CurrentActor } from '@api/platform/session/current-actor.decorator'
import { KpiHistoryService } from './kpi-history.service'

/** `GET /sales/kpi/:period/history` — read-only (ADR 0099 §5). One door on
 *  `kpi.view`; reading another person's line also needs `kpi.view-all`,
 *  decided by E2 in the service as the allocation read does. */
@Controller('sales/kpi')
export class KpiHistoryController {
  constructor(private readonly history: KpiHistoryService) {}

  @Get(':period/history')
  @Need({ branch: 'Sales', permission: 'kpi.view' })
  read(
    @CurrentActor() who: Actor,
    @Param(zod(KpiPeriodParams)) params: KpiPeriodParams,
    @Query(zod(KpiTargetHistoryQuery)) query: KpiTargetHistoryQuery,
  ) {
    return this.history.history(who, params.period, query)
  }
}
