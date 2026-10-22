import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  KpiAbsenceCreate,
  KpiAbsenceParams,
  KpiAbsenceUpdate,
  KpiStandInCandidatesQuery,
} from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { CurrentActor } from '@api/platform/session/current-actor.decorator'
import { KpiAbsenceService } from './kpi-absence.service'

/** `/sales/kpi/absences…` — who is away from KPI work and who stands in (ADR 0117).
 *
 *  Five doors, all `kpi.view`: everyone may declare their own absence. Whether
 *  the caller may act for someone else (`kpi.set-target`) and every rule about
 *  days and stand-ins are the service's. The static `stand-ins` path is
 *  declared before `:absenceId`. */
@Controller('sales/kpi/absences')
export class KpiAbsenceController {
  constructor(private readonly absences: KpiAbsenceService) {}

  @Get()
  @Need({ branch: 'Sales', permission: 'kpi.view' })
  list(@CurrentActor() who: Actor) {
    return this.absences.list(who)
  }

  @Get('stand-ins')
  @Need({ branch: 'Sales', permission: 'kpi.view' })
  candidates(
    @CurrentActor() who: Actor,
    @Query(zod(KpiStandInCandidatesQuery)) query: KpiStandInCandidatesQuery,
  ) {
    return this.absences.candidates(who, query)
  }

  /** 201: it files an absence. */
  @Post()
  @Need({ branch: 'Sales', permission: 'kpi.view' })
  create(@CurrentActor() who: Actor, @Body(zod(KpiAbsenceCreate)) body: KpiAbsenceCreate) {
    return this.absences.create(who, body)
  }

  @Patch(':absenceId')
  @Need({ branch: 'Sales', permission: 'kpi.view' })
  update(
    @CurrentActor() who: Actor,
    @Param(zod(KpiAbsenceParams)) params: KpiAbsenceParams,
    @Body(zod(KpiAbsenceUpdate)) body: KpiAbsenceUpdate,
  ) {
    return this.absences.update(who, params.absenceId, body)
  }

  /** 200, not 201: it stamps an existing row. */
  @Post(':absenceId/cancel')
  @HttpCode(200)
  @Need({ branch: 'Sales', permission: 'kpi.view' })
  cancel(@CurrentActor() who: Actor, @Param(zod(KpiAbsenceParams)) params: KpiAbsenceParams) {
    return this.absences.cancel(who, params.absenceId)
  }
}
