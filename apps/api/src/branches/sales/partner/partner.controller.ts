import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import { PartnerCode, PartnerCreate, PartnerListQuery, PartnerPatch } from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { CurrentActor } from '@api/platform/session/current-actor.decorator'
import { PartnerService } from './partner.service'

/** `/sales/partners` — the referrer book. Read on the lead-origin catalog's
 *  own permission (the lead form's picker). Writes shape how FUTURE referred
 *  leads are filed — a lead's origin is a snapshot at intake, so old leads keep
 *  theirs — and that catalog upkeep is `lead-origin.manage`. */
@Controller('sales/partners')
export class PartnerController {
  constructor(private readonly partners: PartnerService) {}

  @Get()
  @Need({ branch: 'Sales', permission: 'lead.view' })
  list(@CurrentActor() who: Actor, @Query(zod(PartnerListQuery)) q: PartnerListQuery) {
    return this.partners.list(who, q)
  }

  @Post()
  @Need({ branch: 'Sales', permission: 'lead-origin.manage' })
  create(@CurrentActor() who: Actor, @Body(zod(PartnerCreate)) body: PartnerCreate) {
    return this.partners.create(who, body)
  }

  @Patch(':code')
  @Need({ branch: 'Sales', permission: 'lead-origin.manage' })
  patch(
    @CurrentActor() who: Actor,
    @Param('code', zod(PartnerCode)) code: PartnerCode,
    @Body(zod(PartnerPatch)) body: PartnerPatch,
  ) {
    return this.partners.patch(who, code, body)
  }
}
