import { Module } from '@nestjs/common'
import { EnginesModule } from '@api/platform/engines/engines.module'
import { ContractController } from './contract.controller'
import { ContractRepository } from './contract.repository'
import { ContractService } from './contract.service'

/** Module 4 · The contract book.
 *
 *  `imports` is explicit rather than leaning on `@Global()`, the same rule the
 *  other Sales modules follow: reading this line is how you learn the module
 *  asks E2. `EnginesModule` is here for the second grid in `book()` — SQL has
 *  already cut by scope, so the engine's job is to still be standing the day a
 *  new door forgets to declare it.
 *
 *  `ContractRepository` is ALSO a provider of `OpportunityModule`, and that is
 *  deliberate for now: the sign door was written before this module existed
 *  and reaches for the repository directly. Two instances of a stateless class
 *  over one pool cost nothing; folding the sign door onto this module is a
 *  change to the opportunity side, not to this one.
 *
 *  `exports` carries the service only. Another module may ask "give me this
 *  person's contract book"; it does not get to reach into the table. */
@Module({
  imports: [EnginesModule],
  controllers: [ContractController],
  providers: [ContractService, ContractRepository],
  exports: [ContractService],
})
export class ContractModule {}
