import { Controller, HttpCode, Param, Post } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import { ObjectCode } from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { CurrentActor } from '@api/platform/session/current-actor.decorator'
import { LeadAiFillService } from './lead-ai-fill.service'

/** `POST /sales/leads/:code/ai-fill` — start filling a lead's empty fields.
 *
 *  Its own file beside `LeadController`, which is near its line ceiling. Same
 *  declaration as `PATCH :code`: the fill is an edit of the profile, so
 *  `lead.edit`, scoped, and `LeadAiFillService` holds the holder check. 202:
 *  the answer is the job, the fill runs on the worker (ADR 0131). No body. */
@Controller('sales/leads')
export class LeadAiFillController {
  constructor(private readonly fills: LeadAiFillService) {}

  @Post(':code/ai-fill')
  @HttpCode(202)
  @Need({ branch: 'Sales', permission: 'lead.edit', scoped: true })
  press(@CurrentActor() who: Actor, @Param('code', zod(ObjectCode)) code: ObjectCode) {
    return this.fills.press(who, code)
  }
}
