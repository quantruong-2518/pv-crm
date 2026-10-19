import { Body, Controller, Get, HttpCode, Param, Post, Put } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  KpiAllocationDraftBody,
  KpiAllocationSubmitBody,
  KpiCounterResolveBody,
  KpiTeamCounterParams,
  KpiTeamParams,
} from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { CurrentActor } from '@api/platform/session/current-actor.decorator'
import { KpiTeamViewService } from './kpi-team-view.service'

/** `/sales/kpi/:period/teams/:teamId…` — the team page and the lead's doors.
 *
 *  Every door is `kpi.view`: a team lead holds no more. Whether the caller
 *  leads THIS team in the roster of the month is a fact about the caller,
 *  checked in the service. Draft and send are separate routes from the room
 *  tier's because their permission differs (ADR 0004). */
@Controller('sales/kpi')
export class KpiTeamViewController {
  constructor(private readonly view: KpiTeamViewService) {}

  @Get(':period/teams/:teamId')
  @Need({ branch: 'Sales', permission: 'kpi.view' })
  read(@CurrentActor() who: Actor, @Param(zod(KpiTeamParams)) params: KpiTeamParams) {
    return this.view.view(who, params.period, params.teamId)
  }

  @Put(':period/teams/:teamId/allocations/draft')
  @Need({ branch: 'Sales', permission: 'kpi.view' })
  draft(
    @CurrentActor() who: Actor,
    @Param(zod(KpiTeamParams)) params: KpiTeamParams,
    @Body(zod(KpiAllocationDraftBody)) body: KpiAllocationDraftBody,
  ) {
    return this.view.draft(who, params.period, params.teamId, body)
  }

  @Post(':period/teams/:teamId/allocations/submit')
  @HttpCode(200)
  @Need({ branch: 'Sales', permission: 'kpi.view' })
  submit(
    @CurrentActor() who: Actor,
    @Param(zod(KpiTeamParams)) params: KpiTeamParams,
    @Body(zod(KpiAllocationSubmitBody)) body: KpiAllocationSubmitBody,
  ) {
    return this.view.submit(who, params.period, params.teamId, body)
  }

  @Post(':period/teams/:teamId/counters/:counterId/resolve')
  @HttpCode(200)
  @Need({ branch: 'Sales', permission: 'kpi.view' })
  resolve(
    @CurrentActor() who: Actor,
    @Param(zod(KpiTeamCounterParams)) params: KpiTeamCounterParams,
    @Body(zod(KpiCounterResolveBody)) body: KpiCounterResolveBody,
  ) {
    return this.view.resolve(who, params.period, params.teamId, params.counterId, body)
  }
}
