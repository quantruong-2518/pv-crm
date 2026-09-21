import { Module } from '@nestjs/common'
import { AuditModule } from '@api/platform/audit/audit.module'
import { LeadOriginController, LeadSourceStatsController } from './lead-origin.controller'
import { LeadOriginRepository } from './lead-origin.repository'
import { LeadOriginService } from './lead-origin.service'

/** Level 2 of a lead's origin. Exports the service only: the lead write doors
 *  call `resolveOrigin` inside their own transaction, never the tables. */
@Module({
  imports: [AuditModule],
  controllers: [LeadOriginController, LeadSourceStatsController],
  providers: [LeadOriginService, LeadOriginRepository],
  exports: [LeadOriginService],
})
export class LeadOriginModule {}
