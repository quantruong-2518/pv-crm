import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  OrgMemberBody,
  OrgMemberParams,
  OrgTreeQuery,
  OrgUnitCreateBody,
  OrgUnitParams,
  OrgUnitUpdateBody,
} from '@pv/contracts'
import { Need } from '../access/need.decorator'
import { zod } from '../http/zod.pipe'
import { CurrentActor } from '../session/current-actor.decorator'
import { OrgService } from './org.service'

/** `/platform/org…` — the org tree (ADR 0118). Branch Sales on every door: KPI
 *  is the tree's only reader today. The read is cut to the caller's own path
 *  without `kpi.view-all`; a write also needs `kpi.view-all`, checked in the
 *  service (a target setter, as the seat rule says). Every write answers the
 *  tree of the month it landed on. */
@Controller('platform/org')
export class OrgController {
  constructor(private readonly org: OrgService) {}

  @Get()
  @Need({ branch: 'Sales', permission: 'kpi.view' })
  read(@CurrentActor() who: Actor, @Query(zod(OrgTreeQuery)) query: OrgTreeQuery) {
    return this.org.read(who, query.period)
  }

  /** 201: it creates a unit. */
  @Post('units')
  @Need({ branch: 'Sales', permission: 'kpi.set-target' })
  create(@CurrentActor() who: Actor, @Body(zod(OrgUnitCreateBody)) body: OrgUnitCreateBody) {
    return this.org.create(who, body)
  }

  @Patch('units/:unitId')
  @Need({ branch: 'Sales', permission: 'kpi.set-target' })
  update(
    @CurrentActor() who: Actor,
    @Param(zod(OrgUnitParams)) params: OrgUnitParams,
    @Body(zod(OrgUnitUpdateBody)) body: OrgUnitUpdateBody,
  ) {
    return this.org.update(who, params.unitId, body)
  }

  @Delete('units/:unitId')
  @Need({ branch: 'Sales', permission: 'kpi.set-target' })
  remove(@CurrentActor() who: Actor, @Param(zod(OrgUnitParams)) params: OrgUnitParams) {
    return this.org.remove(who, params.unitId)
  }

  @Put('members/:actorId')
  @Need({ branch: 'Sales', permission: 'kpi.set-target' })
  place(
    @CurrentActor() who: Actor,
    @Param(zod(OrgMemberParams)) params: OrgMemberParams,
    @Body(zod(OrgMemberBody)) body: OrgMemberBody,
  ) {
    return this.org.place(who, params.actorId, body)
  }

  @Delete('members/:actorId')
  @Need({ branch: 'Sales', permission: 'kpi.set-target' })
  unplace(@CurrentActor() who: Actor, @Param(zod(OrgMemberParams)) params: OrgMemberParams) {
    return this.org.unplace(who, params.actorId)
  }
}
