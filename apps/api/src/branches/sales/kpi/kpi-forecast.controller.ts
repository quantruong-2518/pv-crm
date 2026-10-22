import { Controller, Get, Param, Query } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  KpiContributionsParams,
  KpiPeriodParams,
  KpiRoleParams,
  KpiWeeklyQuery,
} from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { CurrentActor } from '@api/platform/session/current-actor.decorator'
import { KpiForecastService } from './kpi-forecast.service'

/** `/sales/kpi/:period/forecast…` and `/weekly/:role` — read-only (ADR 0098 §6).
 *
 *  Everyone's forecast and one's own are two permissions, so two routes,
 *  the `people` / `me` split of `kpi.controller.ts` (ADR 0004); one person's,
 *  for their team lead too, is `kpi.view` checked in the service. The weekly
 *  series is always the caller's own: the contract carries no actor, and
 *  holding the role is checked in the service, as `acknowledge` does. */
@Controller('sales/kpi')
export class KpiForecastController {
  constructor(private readonly forecast: KpiForecastService) {}

  @Get(':period/forecast')
  @Need({ branch: 'Sales', permission: 'kpi.view-all' })
  everyone(@Param(zod(KpiPeriodParams)) params: KpiPeriodParams) {
    return this.forecast.everyone(params.period)
  }

  @Get(':period/forecast/me')
  @Need({ branch: 'Sales', permission: 'kpi.view' })
  mine(@CurrentActor() who: Actor, @Param(zod(KpiPeriodParams)) params: KpiPeriodParams) {
    return this.forecast.mine(who, params.period)
  }

  @Get(':period/forecast/people/:actorId')
  @Need({ branch: 'Sales', permission: 'kpi.view' })
  ofPerson(
    @CurrentActor() who: Actor,
    @Param(zod(KpiContributionsParams)) params: KpiContributionsParams,
  ) {
    return this.forecast.ofPerson(who, params.period, params.actorId)
  }

  @Get(':period/weekly/:role')
  @Need({ branch: 'Sales', permission: 'kpi.view' })
  weekly(
    @CurrentActor() who: Actor,
    @Param(zod(KpiRoleParams)) params: KpiRoleParams,
    @Query(zod(KpiWeeklyQuery)) query: KpiWeeklyQuery,
  ) {
    return this.forecast.weekly(who, params.period, params.role, query.metricKey)
  }
}
