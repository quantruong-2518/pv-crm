import { Body, Controller, Get, Param, Put } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  KpiForecastMeBody,
  KpiPeriodParams,
  KpiUnitForecastBody,
  KpiUnitParams,
} from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { CurrentActor } from '@api/platform/session/current-actor.decorator'
import { KpiForecastCommitService } from './kpi-forecast-commit.service'

/** `/sales/kpi/:period/commit/me` and `/units/:unitId/commit` (ADR 0158 §1).
 *
 *  Every door is `kpi.view` (ADR 0004): who may pick or commit turns on the caller's
 *  scorecard and seat, which the service checks, not on a second permission. */
@Controller('sales/kpi')
export class KpiForecastCommitController {
  constructor(private readonly commits: KpiForecastCommitService) {}

  @Get(':period/commit/me')
  @Need({ branch: 'Sales', permission: 'kpi.view' })
  mine(@CurrentActor() who: Actor, @Param(zod(KpiPeriodParams)) params: KpiPeriodParams) {
    return this.commits.mine(who, params.period)
  }

  @Put(':period/commit/me')
  @Need({ branch: 'Sales', permission: 'kpi.view' })
  saveMine(
    @CurrentActor() who: Actor,
    @Param(zod(KpiPeriodParams)) params: KpiPeriodParams,
    @Body(zod(KpiForecastMeBody)) body: KpiForecastMeBody,
  ) {
    return this.commits.saveMine(who, params.period, body)
  }

  @Get(':period/units/:unitId/commit')
  @Need({ branch: 'Sales', permission: 'kpi.view' })
  ofUnit(@CurrentActor() who: Actor, @Param(zod(KpiUnitParams)) params: KpiUnitParams) {
    return this.commits.ofUnit(who, params.period, params.unitId)
  }

  @Put(':period/units/:unitId/commit')
  @Need({ branch: 'Sales', permission: 'kpi.view' })
  commitUnit(
    @CurrentActor() who: Actor,
    @Param(zod(KpiUnitParams)) params: KpiUnitParams,
    @Body(zod(KpiUnitForecastBody)) body: KpiUnitForecastBody,
  ) {
    return this.commits.commitUnit(who, params.period, params.unitId, body)
  }
}
