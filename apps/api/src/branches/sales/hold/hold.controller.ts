import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  HoldListQuery,
  HoldPatchBody,
  HoldSetBody,
  LeadHoldEndBody,
  ObjectCode,
  OpportunityHoldEndBody,
} from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { CurrentActor } from '@api/platform/session/current-actor.decorator'
import { HoldService } from './hold.service'

/** Hold doors (ADR 0097 §3). One permission per route (ADR 0004): the
 *  lead's three on `lead.edit`, the deal's three on `opportunity.edit`, scoped
 *  like their siblings (`nurture`, `stop`). The list reads on `lead.view`,
 *  scoped; deal rows inside it are cut by `opportunity.view` and the deal
 *  book's own axis in the service. 200 on every write: each answers the
 *  subject's profile, and `hold/end` creates nothing. */
@Controller('sales')
export class HoldController {
  constructor(private readonly holds: HoldService) {}

  @Get('holds')
  @Need({ branch: 'Sales', permission: 'lead.view', scoped: true })
  list(@CurrentActor() who: Actor, @Query(zod(HoldListQuery)) q: HoldListQuery) {
    return this.holds.list(who, q)
  }

  @Post('leads/:code/hold')
  @HttpCode(200)
  @Need({ branch: 'Sales', permission: 'lead.edit', scoped: true })
  setLead(
    @CurrentActor() who: Actor,
    @Param('code', zod(ObjectCode)) code: ObjectCode,
    @Body(zod(HoldSetBody)) body: HoldSetBody,
  ) {
    return this.holds.setLead(who, code, body)
  }

  @Patch('leads/:code/hold')
  @Need({ branch: 'Sales', permission: 'lead.edit', scoped: true })
  patchLead(
    @CurrentActor() who: Actor,
    @Param('code', zod(ObjectCode)) code: ObjectCode,
    @Body(zod(HoldPatchBody)) body: HoldPatchBody,
  ) {
    return this.holds.patchLead(who, code, body)
  }

  @Post('leads/:code/hold/end')
  @HttpCode(200)
  @Need({ branch: 'Sales', permission: 'lead.edit', scoped: true })
  endLead(
    @CurrentActor() who: Actor,
    @Param('code', zod(ObjectCode)) code: ObjectCode,
    @Body(zod(LeadHoldEndBody)) body: LeadHoldEndBody,
  ) {
    return this.holds.endLead(who, code, body)
  }

  @Post('opportunities/:code/hold')
  @HttpCode(200)
  @Need({ branch: 'Sales', permission: 'opportunity.edit', scoped: true })
  setDeal(
    @CurrentActor() who: Actor,
    @Param('code', zod(ObjectCode)) code: ObjectCode,
    @Body(zod(HoldSetBody)) body: HoldSetBody,
  ) {
    return this.holds.setDeal(who, code, body)
  }

  @Patch('opportunities/:code/hold')
  @Need({ branch: 'Sales', permission: 'opportunity.edit', scoped: true })
  patchDeal(
    @CurrentActor() who: Actor,
    @Param('code', zod(ObjectCode)) code: ObjectCode,
    @Body(zod(HoldPatchBody)) body: HoldPatchBody,
  ) {
    return this.holds.patchDeal(who, code, body)
  }

  @Post('opportunities/:code/hold/end')
  @HttpCode(200)
  @Need({ branch: 'Sales', permission: 'opportunity.edit', scoped: true })
  endDeal(
    @CurrentActor() who: Actor,
    @Param('code', zod(ObjectCode)) code: ObjectCode,
    @Body(zod(OpportunityHoldEndBody)) body: OpportunityHoldEndBody,
  ) {
    return this.holds.endDeal(who, code, body)
  }
}
