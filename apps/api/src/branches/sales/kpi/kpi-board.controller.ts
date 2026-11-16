import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  KpiBoardRoleQuery,
  KpiMarketingBudgetBody,
  KpiPersonParams,
  KpiUnitParams,
} from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { CurrentActor } from '@api/platform/session/current-actor.decorator'
import { KpiBudgetService } from './kpi-board-budget.service'
import { KpiBoardService } from './kpi-board.service'

/** Display-only reads of the personal boards and the unit's Marketing budget (ADR 0160 §9).
 *
 *  Every door is `kpi.view` (ADR 0004): whose board a caller may read, and who may set a
 *  unit's budget, is the seat rule in the services, as on the plan route. The budget write
 *  stays on `kpi.view` like the tiered assignment writes (ADR 0120 §7): a unit head may
 *  hold nothing more, and ADR 0160 §8 gives the budget to that head. */
@Controller('sales/kpi')
export class KpiBoardController {
  constructor(
    private readonly board: KpiBoardService,
    private readonly budgets: KpiBudgetService,
  ) {}

  @Get(':period/people/:actorId/funnel')
  @Need({ branch: 'Sales', permission: 'kpi.view' })
  funnel(
    @CurrentActor() who: Actor,
    @Param(zod(KpiPersonParams)) p: KpiPersonParams,
    @Query(zod(KpiBoardRoleQuery)) q: KpiBoardRoleQuery,
  ) {
    return this.board.funnel(who, p.period, p.actorId, q.role)
  }

  @Get(':period/people/:actorId/trend')
  @Need({ branch: 'Sales', permission: 'kpi.view' })
  trend(
    @CurrentActor() who: Actor,
    @Param(zod(KpiPersonParams)) p: KpiPersonParams,
    @Query(zod(KpiBoardRoleQuery)) q: KpiBoardRoleQuery,
  ) {
    return this.board.trend(who, p.period, p.actorId, q.role)
  }

  @Get(':period/people/:actorId/marketing-sources')
  @Need({ branch: 'Sales', permission: 'kpi.view' })
  sources(@CurrentActor() who: Actor, @Param(zod(KpiPersonParams)) p: KpiPersonParams) {
    return this.board.sources(who, p.period, p.actorId)
  }

  @Get(':period/people/:actorId/bd-origins')
  @Need({ branch: 'Sales', permission: 'kpi.view' })
  bdOrigins(@CurrentActor() who: Actor, @Param(zod(KpiPersonParams)) p: KpiPersonParams) {
    return this.board.bdOrigins(who, p.period, p.actorId)
  }

  @Get(':period/people/:actorId/presales-collection')
  @Need({ branch: 'Sales', permission: 'kpi.view' })
  collection(@CurrentActor() who: Actor, @Param(zod(KpiPersonParams)) p: KpiPersonParams) {
    return this.board.presalesCollection(who, p.period, p.actorId)
  }

  @Get(':period/people/:actorId/signed-by-day')
  @Need({ branch: 'Sales', permission: 'kpi.view' })
  signedByDay(@CurrentActor() who: Actor, @Param(zod(KpiPersonParams)) p: KpiPersonParams) {
    return this.board.signedByDay(who, p.period, p.actorId)
  }

  @Get(':period/units/:unitId/marketing-budget')
  @Need({ branch: 'Sales', permission: 'kpi.view' })
  budget(@CurrentActor() who: Actor, @Param(zod(KpiUnitParams)) p: KpiUnitParams) {
    return this.budgets.of(who, p.period, p.unitId)
  }

  @Put(':period/units/:unitId/marketing-budget')
  @Need({ branch: 'Sales', permission: 'kpi.view' })
  setBudget(
    @CurrentActor() who: Actor,
    @Param(zod(KpiUnitParams)) p: KpiUnitParams,
    @Body(zod(KpiMarketingBudgetBody)) body: KpiMarketingBudgetBody,
  ) {
    return this.budgets.set(who, p.period, p.unitId, body)
  }
}
