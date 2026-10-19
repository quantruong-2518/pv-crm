import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import { KpiTeamBody, KpiTeamIdParams, KpiTeamRosterQuery } from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { CurrentActor } from '@api/platform/session/current-actor.decorator'
import { KpiTeamService } from './kpi-team.service'

/** `/sales/kpi/teams…` — who is on which team (ADR 0101).
 *
 *  The read rides `kpi.view` and the service cuts it to the caller's own team
 *  unless E2 grants `kpi.view-all`. The three writes are a manager's
 *  `kpi.set-target`; each answers the roster of the month it landed on, so the
 *  screen needs no second read. */
@Controller('sales/kpi')
export class KpiTeamController {
  constructor(private readonly teams: KpiTeamService) {}

  @Get('teams')
  @Need({ branch: 'Sales', permission: 'kpi.view' })
  read(@CurrentActor() who: Actor, @Query(zod(KpiTeamRosterQuery)) query: KpiTeamRosterQuery) {
    return this.teams.read(who, query.period)
  }

  /** 201: it creates a team. */
  @Post('teams')
  @Need({ branch: 'Sales', permission: 'kpi.set-target' })
  create(@CurrentActor() who: Actor, @Body(zod(KpiTeamBody)) body: KpiTeamBody) {
    return this.teams.create(who, body)
  }

  @Put('teams/:teamId')
  @Need({ branch: 'Sales', permission: 'kpi.set-target' })
  update(
    @CurrentActor() who: Actor,
    @Param(zod(KpiTeamIdParams)) params: KpiTeamIdParams,
    @Body(zod(KpiTeamBody)) body: KpiTeamBody,
  ) {
    return this.teams.update(who, params.teamId, body)
  }

  @Delete('teams/:teamId')
  @Need({ branch: 'Sales', permission: 'kpi.set-target' })
  remove(@CurrentActor() who: Actor, @Param(zod(KpiTeamIdParams)) params: KpiTeamIdParams) {
    return this.teams.remove(who, params.teamId)
  }
}
