import { Module } from '@nestjs/common'
import { ApprovalModule } from '@api/platform/approval/approval.module'
import { EnginesModule } from '@api/platform/engines/engines.module'
import { GraphModule } from '@api/platform/graph/graph.module'
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
 *   · `GraphModule` — the READ half of E1. This module registers no object and
 *     draws no edge: `sales.workstream` has no `platform.object` mirror row, on
 *     purpose (see the table's docblock), so the chain is walked from the
 *     lead. */

/** No `MailModule`, no `TouchModule` and no `ObjectMirror`: nothing here
 *  writes. The day a door opens or closes a run, it takes those on then.
 *
 *  `exports` carries the service only — another module may ask "give me this
 *  person's runs", never reach into the table. */
@Module({
  imports: [ApprovalModule, EnginesModule, GraphModule],
  controllers: [WorkstreamController],
  providers: [WorkstreamService, WorkstreamRepository],
  exports: [WorkstreamService],
})
export class WorkstreamModule {}
