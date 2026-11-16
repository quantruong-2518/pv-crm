import { Body, Controller, Get, HttpCode, Param, Post, Put } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import { KpiContributionsParams, KpiOneOnOneActionParams, KpiOneOnOneBody } from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { CurrentActor } from '@api/platform/session/current-actor.decorator'
import { KpiOneOnOneService } from './kpi-one-on-one.service'

/** The monthly 1:1 and its actions (ADR 0158 §4). Every door is `kpi.view` (ADR 0004):
 *  writing, acknowledging and ticking an action turn on the seat, which the service checks. */
@Controller('sales/kpi')
export class KpiOneOnOneController {
  constructor(private readonly service: KpiOneOnOneService) {}

  @Get('me/actions')
  @Need({ branch: 'Sales', permission: 'kpi.view' })
  mine(@CurrentActor() who: Actor) {
    return this.service.mine(who)
  }

  @Get(':period/one-on-ones/:actorId')
  @Need({ branch: 'Sales', permission: 'kpi.view' })
  view(@CurrentActor() who: Actor, @Param(zod(KpiContributionsParams)) p: KpiContributionsParams) {
    return this.service.view(who, p.period, p.actorId)
  }

  @Put(':period/one-on-ones/:actorId')
  @Need({ branch: 'Sales', permission: 'kpi.view' })
  write(
    @CurrentActor() who: Actor,
    @Param(zod(KpiContributionsParams)) p: KpiContributionsParams,
    @Body(zod(KpiOneOnOneBody)) body: KpiOneOnOneBody,
  ) {
    return this.service.write(who, p.period, p.actorId, body)
  }

  @Post(':period/one-on-ones/:actorId/acknowledge')
  @HttpCode(200)
  @Need({ branch: 'Sales', permission: 'kpi.view' })
  acknowledge(
    @CurrentActor() who: Actor,
    @Param(zod(KpiContributionsParams)) p: KpiContributionsParams,
  ) {
    return this.service.acknowledge(who, p.period, p.actorId)
  }

  @Post('one-on-one-actions/:actionId/done')
  @HttpCode(204)
  @Need({ branch: 'Sales', permission: 'kpi.view' })
  async done(
    @CurrentActor() who: Actor,
    @Param(zod(KpiOneOnOneActionParams)) p: KpiOneOnOneActionParams,
  ): Promise<void> {
    await this.service.done(who, p.actionId)
  }
}
