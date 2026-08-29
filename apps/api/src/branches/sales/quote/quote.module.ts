import { Module } from '@nestjs/common'
import { EnginesModule } from '@api/platform/engines/engines.module'
import { GraphModule } from '@api/platform/graph/graph.module'
import { OpportunityModule } from '../opportunity/opportunity.module'
import { QuoteController } from './quote.controller'
import { QuoteRepository } from './quote.repository'
import { QuoteService } from './quote.service'

/** Module 4 · the quotation book.
 *
 *  `imports` are spelled out rather than leaning on `@Global()`, the same law
 *  the other Sales modules follow: reading these three lines tells you who this
 *  module asks.
 *
 *   · `EnginesModule` — E2 is the second net over `book()`. SQL has already cut
 *     by scope; the engine is here for the day somebody adds an endpoint and
 *     forgets `scoped: true`.
 *   · `GraphModule` — this is the first module in `apps/api` to write
 *     `platform.edge`. It takes both write halves: `ObjectMirror` for the node
 *     and `EdgeWriter` for the link. A quote with a node and no edge is a rail
 *     that shows the paper without showing which deal it came out of.
 *   · `OpportunityModule` — three things a quote cannot answer about itself, and
 *     all three belong to the deal: may this reader touch it (the create door
 *     has no `ref` to be scoped on), does its E1 mirror row exist yet, and does
 *     sending move it onto the quotation step.
 *
 *  ------------------------------------------------------------------
 *  IT TAKES THE SERVICE, NEVER THE DEAL REPOSITORY
 *  ------------------------------------------------------------------
 *  `OpportunityModule` exports `OpportunityService` and deliberately not its
 *  repository — another module may ASK, it may not reach into the table. That
 *  matters most on the send path: the three columns it moves on `sales.
 *  opportunity` carry rules spelled out in that module and nowhere else, chiefly
 *  that the stage clock only moves when the stage does. A second write path into
 *  those columns would be a second copy of that rule.
 *
 *  The dependency runs one way. `OpportunityModule` does not import this one,
 *  and must not: the deal profile reads quotes through the book's own door like
 *  any other caller. */
@Module({
  imports: [EnginesModule, GraphModule, OpportunityModule],
  controllers: [QuoteController],
  providers: [QuoteService, QuoteRepository],
  exports: [QuoteService],
})
export class QuoteModule {}
