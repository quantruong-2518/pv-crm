import { Module } from '@nestjs/common'
import { EnginesModule } from '@api/platform/engines/engines.module'
import { MailModule } from '@api/platform/mail/mail.module'
import { LeadModule } from '../lead/lead.module'
import { MeetingModule } from '../meeting/meeting.module'
import { OpportunityModule } from '../opportunity/opportunity.module'
import { OpportunityRepository } from '../opportunity/opportunity.repository'
import { HoldController } from './hold.controller'
import { HoldRepository } from './hold.repository'
import { HoldService } from './hold.service'

/** Holds (ADR 0097 §3). It imports the lead and deal modules for their
 *  doors and profiles, meetings for a park's cancel; nothing imports it — every other module reads holds
 *  through the module-free `hold.sql.ts`. `OpportunityRepository` is provided
 *  bare, `CampaignModule`'s way: a stateless SQL class the deal module keeps private. */
@Module({
  imports: [EnginesModule, MailModule, LeadModule, MeetingModule, OpportunityModule],
  controllers: [HoldController],
  providers: [HoldService, HoldRepository, OpportunityRepository],
})
export class HoldModule {}
