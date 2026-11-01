import { Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import { LeadAiJobParams } from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { CurrentActor } from '@api/platform/session/current-actor.decorator'
import { LeadAiJobService } from './lead-ai-job.service'

/** `sales/ai-jobs` — the AI task tray (ADR 0131). Every route declares the
 *  press's own need, word for word with the web: the rows are the caller's
 *  own, and Undo is an edit of the lead, so `lead.edit`, scoped. */
@Controller('sales/ai-jobs')
export class LeadAiJobController {
  constructor(private readonly jobs: LeadAiJobService) {}

  @Get()
  @Need({ branch: 'Sales', permission: 'lead.edit', scoped: true })
  list(@CurrentActor() who: Actor) {
    return this.jobs.list(who)
  }

  @Post('dismiss-finished')
  @HttpCode(204)
  @Need({ branch: 'Sales', permission: 'lead.edit', scoped: true })
  dismissFinished(@CurrentActor() who: Actor) {
    return this.jobs.dismissFinished(who)
  }

  /** 200: the job is updated, nothing new is created. */
  @Post(':id/undo')
  @HttpCode(200)
  @Need({ branch: 'Sales', permission: 'lead.edit', scoped: true })
  undo(@CurrentActor() who: Actor, @Param(zod(LeadAiJobParams)) params: LeadAiJobParams) {
    return this.jobs.undo(who, params.id)
  }

  @Delete(':id')
  @HttpCode(204)
  @Need({ branch: 'Sales', permission: 'lead.edit', scoped: true })
  dismiss(@CurrentActor() who: Actor, @Param(zod(LeadAiJobParams)) params: LeadAiJobParams) {
    return this.jobs.dismiss(who, params.id)
  }
}
