import { Module } from '@nestjs/common'
import { EnginesModule } from '@api/platform/engines/engines.module'
import { ContractController } from './contract.controller'
import { ContractRepository } from './contract.repository'
import { ContractService } from './contract.service'

/** Module 4 · the contract book.
 *
 *  ------------------------------------------------------------------
 *  THIS MODULE IS THE DAY `OpportunityModule` WROTE ABOUT
 *  ------------------------------------------------------------------
 *  `ContractRepository` has been a provider of `OpportunityModule` since the
 *  sign door was built, and that docblock said why it would stay one until
 *  there was a real contract book: no screen, no book, and one write door which
 *  was an action on a deal. It also named the exit — "the day there is a real
 *  contract book, `ContractModule` is born with its controller".
 *
 *  The repository is still a provider THERE too, and that duplication is
 *  deliberate rather than a leftover. Nest gives each module its own instance
 *  of a provider it declares; both instances hold nothing but the `DB` handle,
 *  so two of them are two objects, not two connections or two caches. Rewiring
 *  `OpportunityModule` to import this module instead would make the deal book
 *  depend on the contract book to answer "is this deal signed" — a dependency
 *  pointing the wrong way, since it is the sign door on the DEAL that writes
 *  the row.
 *
 *  `EnginesModule` for E2: SQL already cuts by scope, and the engine is the
 *  second net for the day an endpoint here forgets `scoped: true`.
 *
 *  No `GraphModule`. Writing the quote-to-contract edge belongs to the sign
 *  door in pass 4 of the design, and the edge-writing method itself has to be in
 *  `platform/graph` rather than in a branch — the warning
 *  `opportunity.service.ts` already carries. A read-only book has no business
 *  opening that road.
 *
 *  `exports` carries the service, not the repository: another module may ask
 *  "give me this person's contract book", not reach into the table. */
@Module({
  imports: [EnginesModule],
  controllers: [ContractController],
  providers: [ContractService, ContractRepository],
  exports: [ContractService],
})
export class ContractModule {}
