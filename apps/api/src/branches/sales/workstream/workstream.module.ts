import { Module } from '@nestjs/common'
import { ApprovalModule } from '@api/platform/approval/approval.module'
import { EnginesModule } from '@api/platform/engines/engines.module'
import { GraphModule } from '@api/platform/graph/graph.module'
import { OpportunityGateRepository } from '../opportunity/opportunity-gate.repository'
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
 *   · `GraphModule` — the READ half of E1. This module registers no object and
 *     draws no edge: `sales.workstream` has no `platform.object` mirror row, on
 *     purpose (see the table's docblock), so the chain is walked from the
 *     lead. */

/** `OpportunityGateRepository` is a provider here, not an import: the deal
 *  lanes print the stage-gate checklist, and that read has one home. Same move
 *  `OpportunityModule` makes with `ContractRepository`.
 *
 *  No `MailModule`, `TouchModule` or `ObjectMirror`: the lead doors open runs
 *  through `WorkstreamRepository` inside THEIR transaction, so the event stays
 *  with the lead row that caused it.
 *
 *  `exports` carries the repository for that reason only. This module must never
 *  import `LeadModule`, which imports it. */
@Module({
  imports: [ApprovalModule, EnginesModule, GraphModule],
  controllers: [WorkstreamController],
  providers: [
    WorkstreamService,
    WorkstreamRepository,
    WorkstreamLanesRepository,
    OpportunityGateRepository,
  ],
  exports: [WorkstreamService, WorkstreamRepository],
})
export class WorkstreamModule {}
