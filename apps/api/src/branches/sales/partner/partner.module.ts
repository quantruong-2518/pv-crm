import { Module } from '@nestjs/common'
import { AuditModule } from '@api/platform/audit/audit.module'
import { EnginesModule } from '@api/platform/engines/engines.module'
import { PartnerController } from './partner.controller'
import { PartnerRepository } from './partner.repository'
import { PartnerService } from './partner.service'

/** The referrer book. Exports the service only: the lead write doors call
 *  `live` inside their own transaction, never the table. */
@Module({
  imports: [AuditModule, EnginesModule],
  controllers: [PartnerController],
  providers: [PartnerService, PartnerRepository],
  exports: [PartnerService],
})
export class PartnerModule {}
