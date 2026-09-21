import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  LeadOriginCreate,
  LeadOriginId,
  LeadOriginListQuery,
  LeadOriginMerge,
  LeadOriginPatch,
  LeadSourceStatsQuery,
} from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { CurrentActor } from '@api/platform/session/current-actor.decorator'
import { LeadOriginService } from './lead-origin.service'

/** `/sales/lead-origins` — the origin catalog. Reading and ADDING ride on the
 *  lead permissions (whoever types a lead may name a new place); rename, hide
 *  and merge move other people's leads, so they need `lead-origin.manage`. */
@Controller('sales/lead-origins')
export class LeadOriginController {
  constructor(private readonly origins: LeadOriginService) {}

  /** `scoped`: the rows are shared, but each `leadCount` is cut to the caller's book. */
  @Get()
  @Need({ branch: 'Sales', permission: 'lead.view', scoped: true })
  list(@CurrentActor() who: Actor, @Query(zod(LeadOriginListQuery)) q: LeadOriginListQuery) {
    return this.origins.list(who, q)
  }

  @Post()
  @Need({ branch: 'Sales', permission: 'lead.edit' })
  create(@CurrentActor() who: Actor, @Body(zod(LeadOriginCreate)) body: LeadOriginCreate) {
    return this.origins.create(who, body)
  }

  @Patch(':id')
  @Need({ branch: 'Sales', permission: 'lead-origin.manage' })
  patch(
    @CurrentActor() who: Actor,
    @Param('id', zod(LeadOriginId)) id: LeadOriginId,
    @Body(zod(LeadOriginPatch)) body: LeadOriginPatch,
  ) {
    return this.origins.patch(who, id, body)
  }

  @Post(':id/merge')
  @HttpCode(200)
  @Need({ branch: 'Sales', permission: 'lead-origin.manage' })
  merge(
    @CurrentActor() who: Actor,
    @Param('id', zod(LeadOriginId)) id: LeadOriginId,
    @Body(zod(LeadOriginMerge)) body: LeadOriginMerge,
  ) {
    return this.origins.merge(who, id, body.into)
  }
}

/** `GET /sales/leads/source-stats` — lives beside the catalog it groups by, on
 *  the lead prefix. `campaign.view` as the contract says; `scoped` because the
 *  rows ARE leads, so an `ownOnly` caller counts only their own. */
@Controller('sales/leads')
export class LeadSourceStatsController {
  constructor(private readonly origins: LeadOriginService) {}

  @Get('source-stats')
  @Need({ branch: 'Sales', permission: 'campaign.view', scoped: true })
  stats(@CurrentActor() who: Actor, @Query(zod(LeadSourceStatsQuery)) q: LeadSourceStatsQuery) {
    return this.origins.sourceStats(who, q)
  }
}
