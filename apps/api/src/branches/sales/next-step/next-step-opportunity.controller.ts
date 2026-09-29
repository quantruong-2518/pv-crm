import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import { NextStepDoneBody, NextStepSetBody, ObjectCode } from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { CurrentActor } from '@api/platform/session/current-actor.decorator'
import { OpportunityStepService } from './next-step-opportunity.service'

/** `/sales/opportunities/:code/next-step` — the deal's one next step, the lead
 *  door's verbs and bodies under the opportunity pair (ADR 0069 §10). */
@Controller('sales/opportunities/:code/next-step')
export class OpportunityStepController {
  constructor(private readonly steps: OpportunityStepService) {}

  @Get()
  @Need({ branch: 'Sales', permission: 'opportunity.view', scoped: true })
  get(@CurrentActor() who: Actor, @Param('code', zod(ObjectCode)) code: ObjectCode) {
    return this.steps.get(who, code)
  }

  @Put()
  @Need({ branch: 'Sales', permission: 'opportunity.edit', scoped: true })
  set(
    @CurrentActor() who: Actor,
    @Param('code', zod(ObjectCode)) code: ObjectCode,
    @Body(zod(NextStepSetBody)) body: NextStepSetBody,
  ) {
    return this.steps.set(who, code, body)
  }

  /** 200, not 201: it may create nothing (no `next`), and it answers the step. */
  @Post('done')
  @HttpCode(200)
  @Need({ branch: 'Sales', permission: 'opportunity.edit', scoped: true })
  done(
    @CurrentActor() who: Actor,
    @Param('code', zod(ObjectCode)) code: ObjectCode,
    @Body(zod(NextStepDoneBody)) body: NextStepDoneBody,
  ) {
    return this.steps.done(who, code, body)
  }

  @Delete()
  @Need({ branch: 'Sales', permission: 'opportunity.edit', scoped: true })
  clear(@CurrentActor() who: Actor, @Param('code', zod(ObjectCode)) code: ObjectCode) {
    return this.steps.clear(who, code)
  }
}
