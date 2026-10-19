import { Body, Controller, Get, Put, Query } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import { AiCostQuery, AiPriceSet } from '@pv/contracts'
import { Need } from '../access/need.decorator'
import { zod } from '../http/zod.pipe'
import { CurrentActor } from '../session/current-actor.decorator'
import { AiCostService } from './ai-cost.service'

/** `/ai` — AI spend and the unit prices behind it (ADR 0102). One permission
 *  on every door: the owner put the whole view, prices included, with the
 *  director alone, so there is no reader to split from a writer. */
@Controller('ai')
export class AiCostController {
  constructor(private readonly costs: AiCostService) {}

  @Get('costs')
  @Need({ permission: 'cost.view' })
  report(@Query(zod(AiCostQuery)) q: AiCostQuery) {
    return this.costs.report(q.month)
  }

  @Get('prices')
  @Need({ permission: 'cost.view' })
  prices() {
    return this.costs.prices()
  }

  @Put('prices')
  @Need({ permission: 'cost.view' })
  setPrice(@CurrentActor() who: Actor, @Body(zod(AiPriceSet)) body: AiPriceSet) {
    return this.costs.setPrice(who, body)
  }
}
