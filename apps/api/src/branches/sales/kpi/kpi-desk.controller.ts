import { Controller, Get, Param, Query } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import { KpiDeskQuery, KpiPeriodParams } from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { CurrentActor } from '@api/platform/session/current-actor.decorator'
import { KpiCompanyDeskService } from './kpi-company-desk.service'
import { KpiDeskService } from './kpi-desk.service'

/** `/sales/kpi/:period/desk` and `/company/desk` (ADR 0159 §1).
 *
 *  Both are `kpi.view` (ADR 0004): which tab a caller holds turns on a seat in the
 *  org tree or on `kpi.view-all`, which the services check, not on a second permission. */
@Controller('sales/kpi')
export class KpiDeskController {
  constructor(
    private readonly desk: KpiDeskService,
    private readonly company: KpiCompanyDeskService,
  ) {}

  @Get(':period/desk')
  @Need({ branch: 'Sales', permission: 'kpi.view' })
  unit(
    @CurrentActor() who: Actor,
    @Param(zod(KpiPeriodParams)) params: KpiPeriodParams,
    @Query(zod(KpiDeskQuery)) query: KpiDeskQuery,
  ) {
    return this.desk.desk(who, params.period, query)
  }

  @Get(':period/company/desk')
  @Need({ branch: 'Sales', permission: 'kpi.view' })
  companyDesk(@CurrentActor() who: Actor, @Param(zod(KpiPeriodParams)) params: KpiPeriodParams) {
    return this.company.of(who, params.period)
  }
}
