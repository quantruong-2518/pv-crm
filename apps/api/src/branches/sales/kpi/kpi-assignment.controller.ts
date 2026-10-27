import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  KpiAssignmentDraftBody,
  KpiAssignmentQuery,
  KpiAssignmentSendBody,
  KpiRoleParams,
} from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { CurrentActor } from '@api/platform/session/current-actor.decorator'
import { KpiAssignmentReader } from './kpi-assignment-read.service'
import { KpiAssignmentService } from './kpi-assignment.service'

/** `/sales/kpi/:period/assignments/:role…` — targets handed down the org tree
 *  (ADR 0120). Five doors, all `kpi.view` (ADR 0004): a head of a unit may hold
 *  nothing more, so who sits on the unit's seat — head, stand-in, a head above,
 *  else the setters — is the tree's fact and the service's check (§7). Writes
 *  that answer with refreshed state are 200. */
@Controller('sales/kpi')
export class KpiAssignmentController {
  constructor(
    private readonly reader: KpiAssignmentReader,
    private readonly sets: KpiAssignmentService,
  ) {}

  @Get(':period/assignments/:role')
  @Need({ branch: 'Sales', permission: 'kpi.view' })
  page(
    @CurrentActor() who: Actor,
    @Param(zod(KpiRoleParams)) params: KpiRoleParams,
    @Query(zod(KpiAssignmentQuery)) query: KpiAssignmentQuery,
  ) {
    return this.reader.page(who, params.period, params.role, query.unitId)
  }

  @Get(':period/assignments/:role/me')
  @Need({ branch: 'Sales', permission: 'kpi.view' })
  mine(@CurrentActor() who: Actor, @Param(zod(KpiRoleParams)) params: KpiRoleParams) {
    return this.reader.mine(who, params.period, params.role)
  }

  @Put(':period/assignments/:role/draft')
  @Need({ branch: 'Sales', permission: 'kpi.view' })
  draft(
    @CurrentActor() who: Actor,
    @Param(zod(KpiRoleParams)) params: KpiRoleParams,
    @Body(zod(KpiAssignmentDraftBody)) body: KpiAssignmentDraftBody,
  ) {
    return this.sets.draft(who, params.period, params.role, body)
  }

  @Post(':period/assignments/:role/send')
  @HttpCode(200)
  @Need({ branch: 'Sales', permission: 'kpi.view' })
  send(
    @CurrentActor() who: Actor,
    @Param(zod(KpiRoleParams)) params: KpiRoleParams,
    @Body(zod(KpiAssignmentSendBody)) body: KpiAssignmentSendBody,
  ) {
    return this.sets.send(who, params.period, params.role, body.unitId)
  }

  /** No body: every unanswered line of the role is confirmed at once. */
  @Post(':period/assignments/:role/confirm')
  @HttpCode(200)
  @Need({ branch: 'Sales', permission: 'kpi.view' })
  confirm(@CurrentActor() who: Actor, @Param(zod(KpiRoleParams)) params: KpiRoleParams) {
    return this.sets.confirm(who, params.period, params.role)
  }
}
