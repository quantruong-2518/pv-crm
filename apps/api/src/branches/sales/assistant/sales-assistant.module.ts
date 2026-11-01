import { Module } from '@nestjs/common'
import { EnginesModule } from '@api/platform/engines/engines.module'
import { ContractModule } from '../contract/contract.module'
import { LeadModule } from '../lead/lead.module'
import { OpportunityModule } from '../opportunity/opportunity.module'
import { SearchModule } from '../search/search.module'
import { SalesAssistantTools } from './sales-assistant-tools'

/** Hands the branch's tools to the assistant, which `app.module.ts` wires up. */
@Module({
  imports: [EnginesModule, LeadModule, OpportunityModule, ContractModule, SearchModule],
  providers: [SalesAssistantTools],
  exports: [SalesAssistantTools],
})
export class SalesAssistantModule {}
