import { Body, Controller, Get, HttpCode, Param, Post, Put } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import { KpiAgreeBody, KpiPeriodParams, KpiProposeBody, KpiRoleParams } from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { CurrentActor } from '@api/platform/session/current-actor.decorator'
import { KpiService } from './kpi.service'

/** `/sales/kpi/:period/…` — scorecards per role and the agreed monthly targets.
 *
 *  Seven doors, one permission each (ADR 0004): reading your own card, the
 *  company card and everyone's cards are three different permissions, so they
 *  are three routes rather than one route that reads a query flag.
 *
 *  None is `scoped`: `own` and `room` are properties of each METRIC
 *  (`KPI_CATALOG`), not an `ownOnly` cut over rows. `:period` is a month key;
 *  the params schema refuses a quarter. */
@Controller('sales/kpi')
export class KpiController {
  constructor(private readonly kpi: KpiService) {}

  @Get(':period/me')
  @Need({ branch: 'Sales', permission: 'kpi.view' })
  me(@CurrentActor() who: Actor, @Param(zod(KpiPeriodParams)) params: KpiPeriodParams) {
    return this.kpi.me(who, params.period)
  }

  /** The performance permission, like the overview it sits beside. */
  @Get(':period/company')
  @Need({ branch: 'Sales', permission: 'performance.view' })
  company(@Param(zod(KpiPeriodParams)) params: KpiPeriodParams) {
    return this.kpi.company(params.period)
  }

  @Get(':period/people')
  @Need({ branch: 'Sales', permission: 'kpi.view-all' })
  people(@Param(zod(KpiPeriodParams)) params: KpiPeriodParams) {
    return this.kpi.people(params.period)
  }

  /** Everyone who has a card reads the targets it is judged against. */
  @Get(':period/targets')
  @Need({ branch: 'Sales', permission: 'kpi.view' })
  targets(@Param(zod(KpiPeriodParams)) params: KpiPeriodParams) {
    return this.kpi.targetsOf(params.period)
  }

  @Put(':period/targets/:role')
  @Need({ branch: 'Sales', permission: 'kpi.set-target' })
  propose(
    @CurrentActor() who: Actor,
    @Param(zod(KpiRoleParams)) params: KpiRoleParams,
    @Body(zod(KpiProposeBody)) body: KpiProposeBody,
  ) {
    return this.kpi.propose(who, params.period, params.role, body)
  }

  /** 200, not 201: it answers with the refreshed targets, and creates nothing.
   *  The body is what the agreer saw — the service refuses anything else. */
  @Post(':period/targets/:role/agree')
  @HttpCode(200)
  @Need({ branch: 'Sales', permission: 'kpi.set-target' })
  agree(
    @CurrentActor() who: Actor,
    @Param(zod(KpiRoleParams)) params: KpiRoleParams,
    @Body(zod(KpiAgreeBody)) body: KpiAgreeBody,
  ) {
    return this.kpi.agree(who, params.period, params.role, body)
  }

  /** Holding the role is checked in the service: it is a fact about the
   *  caller, not a permission of the matrix. */
  @Post(':period/acknowledgements/:role')
  @HttpCode(200)
  @Need({ branch: 'Sales', permission: 'kpi.view' })
  acknowledge(@CurrentActor() who: Actor, @Param(zod(KpiRoleParams)) params: KpiRoleParams) {
    return this.kpi.acknowledge(who, params.period, params.role)
  }
}
