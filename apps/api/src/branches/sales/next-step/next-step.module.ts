import { Module } from '@nestjs/common'
import { EnginesModule } from '@api/platform/engines/engines.module'
import { SessionModule } from '@api/platform/session/session.module'
import { SalesConfigModule } from '../config/config.module'
import { LeadModule } from '../lead/lead.module'
import { TouchModule } from '../touch/touch.module'
import { NextStepDebriefHook } from './comm-debrief.hook'
import { NextStepController } from './next-step.controller'
import { OpportunityStepController } from './next-step-opportunity.controller'
import { OpportunityStepRepository } from './next-step-opportunity.repository'
import { OpportunityStepService } from './next-step-opportunity.service'
import { NextStepRepository } from './next-step.repository'
import { NextStepService } from './next-step.service'

/** The next-step book (flow G1–G3): leads, and deals since ADR 0069 §10.
 *
 *  `LeadModule` for `LeadService.guard` — the lead scope fence, asked rather
 *  than copied. `TouchModule` because "done" writes its timeline row in the
 *  same transaction. `EnginesModule` for E2: naming a doer other than the holder
 *  needs `lead.assign`, and `SessionModule` builds that doer as an `Actor` to ask
 *  whether they can reach the lead. The deal door reads the opportunity tables
 *  itself, so it imports no `OpportunityModule`. Other doors use `next-step.handover`;
 *  the one export is comms' close-out hook, bound in `app.module.ts` (ADR 0074 §7),
 *  which asks `SalesConfigModule` for the evaluation lists. */
@Module({
  imports: [EnginesModule, SessionModule, LeadModule, TouchModule, SalesConfigModule],
  controllers: [NextStepController, OpportunityStepController],
  providers: [
    NextStepService,
    NextStepRepository,
    OpportunityStepService,
    OpportunityStepRepository,
    NextStepDebriefHook,
  ],
  exports: [NextStepDebriefHook],
})
export class NextStepModule {}
