import { Module } from '@nestjs/common'
import { EnginesModule } from '@api/platform/engines/engines.module'
import { SessionModule } from '@api/platform/session/session.module'
import { LeadModule } from '../lead/lead.module'
import { TouchModule } from '../touch/touch.module'
import { NextStepController } from './next-step.controller'
import { NextStepRepository } from './next-step.repository'
import { NextStepService } from './next-step.service'

/** The next-step book (flow G1–G3), leads only for now.
 *
 *  `LeadModule` for `LeadService.guard` — the lead scope fence, asked rather
 *  than copied. `TouchModule` because "done" writes its timeline row in the
 *  same transaction. `EnginesModule` for E2: naming a doer other than the holder
 *  needs `lead.assign`, and `SessionModule` builds that doer as an `Actor` to ask
 *  whether they can reach the lead. Nothing exported — other doors use `next-step.handover`. */
@Module({
  imports: [EnginesModule, SessionModule, LeadModule, TouchModule],
  controllers: [NextStepController],
  providers: [NextStepService, NextStepRepository],
})
export class NextStepModule {}
