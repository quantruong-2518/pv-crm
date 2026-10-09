import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import { NextStepDoneBody, NextStepSetBody, ObjectCode } from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { CurrentActor } from '@api/platform/session/current-actor.decorator'
import { NextStepService } from './next-step.service'

/** `/sales/leads/:code/next-step` — the lead's one next step.
 *
 *  `:code` on the path puts the scope axis in front of the read, the reason
 *  `MeetingModule` gives. All four answer `NextStepResponse`, DELETE included,
 *  so the screen never needs a re-read. */
@Controller('sales/leads/:code/next-step')
export class NextStepController {
  constructor(private readonly steps: NextStepService) {}

  @Get()
  @Need({ branch: 'Sales', permission: 'lead.view', scoped: true })
  get(@CurrentActor() who: Actor, @Param('code', zod(ObjectCode)) code: ObjectCode) {
    return this.steps.get(who, code)
  }

  /** The picker's templates and free-entry flag for the state the object
   *  stands in NOW (ADR 0080 §4) — the client never names a state. */
  @Get('options')
  @Need({ branch: 'Sales', permission: 'lead.view', scoped: true })
  options(@CurrentActor() who: Actor, @Param('code', zod(ObjectCode)) code: ObjectCode) {
    return this.steps.options(who, code)
  }

  @Put()
  @Need({ branch: 'Sales', permission: 'lead.edit', scoped: true })
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
  @Need({ branch: 'Sales', permission: 'lead.edit', scoped: true })
  done(
    @CurrentActor() who: Actor,
    @Param('code', zod(ObjectCode)) code: ObjectCode,
    @Body(zod(NextStepDoneBody)) body: NextStepDoneBody,
  ) {
    return this.steps.done(who, code, body)
  }

  @Delete()
  @Need({ branch: 'Sales', permission: 'lead.edit', scoped: true })
  clear(@CurrentActor() who: Actor, @Param('code', zod(ObjectCode)) code: ObjectCode) {
    return this.steps.clear(who, code)
  }
}
