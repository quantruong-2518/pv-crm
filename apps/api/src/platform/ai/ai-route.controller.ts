import { Body, Controller, Get, Param, Put } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import { AiRouteSet, AiTask } from '@pv/contracts'
import { Need } from '../access/need.decorator'
import { zod } from '../http/zod.pipe'
import { CurrentActor } from '../session/current-actor.decorator'
import { AiRouteService } from './ai-route.service'

/** `/ai/routes` — `cost.view` on both doors, for `AiCostController`'s reason:
 *  a route decides what AI spends, and that view sits with the director alone. */
@Controller('ai/routes')
export class AiRouteController {
  constructor(private readonly routes: AiRouteService) {}

  @Get()
  @Need({ permission: 'cost.view' })
  list() {
    return this.routes.list()
  }

  @Put(':task')
  @Need({ permission: 'cost.view' })
  set(
    @CurrentActor() who: Actor,
    @Param('task', zod(AiTask)) task: AiTask,
    @Body(zod(AiRouteSet)) body: AiRouteSet,
  ) {
    return this.routes.set(who, task, body)
  }
}
