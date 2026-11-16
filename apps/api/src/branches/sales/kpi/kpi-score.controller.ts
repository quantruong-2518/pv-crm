import { Controller, Get, Param } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import { KpiContributionsParams } from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { CurrentActor } from '@api/platform/session/current-actor.decorator'
import { KpiOneOnOneService } from './kpi-one-on-one.service'

/** `GET /sales/kpi/:period/people/:actorId/score` (ADR 0158 §3). `kpi.view`; who may
 *  read a given person is the same question every person page asks (`readsPerson`). */
@Controller('sales/kpi')
export class KpiScoreController {
  constructor(private readonly service: KpiOneOnOneService) {}

  @Get(':period/people/:actorId/score')
  @Need({ branch: 'Sales', permission: 'kpi.view' })
  score(@CurrentActor() who: Actor, @Param(zod(KpiContributionsParams)) p: KpiContributionsParams) {
    return this.service.score(who, p.period, p.actorId)
  }
}
