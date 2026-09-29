import { Module } from '@nestjs/common'
import { ApprovalModule } from '@api/platform/approval/approval.module'
import { EnginesModule } from '@api/platform/engines/engines.module'
import { NextStepRepository } from '../next-step/next-step.repository'
import { WorkstreamLanesRepository } from './workstream-lanes.repository'
import { WorkstreamController } from './workstream.controller'
import { WorkstreamRepository } from './workstream.repository'
import { WorkstreamService } from './workstream.service'

/** Module 5 · the journey book.
 *
 *  `imports` are declared rather than inherited, the rule `LeadModule` and
 *  `OpportunityModule` both follow: two lines say who this module asks.
 *
 *   · `EnginesModule` — E2 is the second grid of `book()`, hung on the anchor
 *     lead's ref because `ObjectKind` has no `'WS'`.
 *   · `ApprovalModule` — one question only: what is still waiting on the object
 *     the run stands on, which `pipelinePosition` needs for `waitingOn`. No
 *     applier is registered; reading the inbox and having something to apply
 *     are separate things.
 *
 *  `NextStepRepository` is PROVIDED, not imported via its module: that module
 *  imports `LeadModule`, which imports this one. It needs only `DB`. */

/** No `MailModule`, `TouchModule` or `ObjectMirror`: the lead doors open runs
 *  through `WorkstreamRepository` inside THEIR transaction, so the event stays
 *  with the lead row that caused it.
 *
 *  `exports` carries the repository for that reason only. This module must never
 *  import `LeadModule`, which imports it. */
@Module({
  imports: [ApprovalModule, EnginesModule],
  controllers: [WorkstreamController],
  providers: [
    WorkstreamService,
    WorkstreamRepository,
    WorkstreamLanesRepository,
    NextStepRepository,
  ],
  exports: [WorkstreamService, WorkstreamRepository],
})
export class WorkstreamModule {}
