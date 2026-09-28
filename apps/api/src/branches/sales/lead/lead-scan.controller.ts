import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  LeadAttachmentsParams,
  LeadScanCreateBody,
  LeadScanParams,
  LeadScanStartBody,
  ObjectCode,
  ScanBatchCode,
} from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { CurrentActor } from '@api/platform/session/current-actor.decorator'
import { LeadScanService } from './lead-scan.service'

/** The scan door — contract and flow in `@pv/contracts` `lead-scan.ts`.
 *
 *  The four batch doors are NOT `scoped`: the scope axis cuts leads by
 *  `owner_id`, and a batch has no owner column to cut — it has a creator,
 *  and `LeadScanService.mine` answers 404 to anyone else. `:code/attachments`
 *  is a lead read and carries the lead reads' three axes. */
@Controller('sales/leads')
export class LeadScanController {
  constructor(private readonly scans: LeadScanService) {}

  @Post('scan')
  @Need({ branch: 'Sales', permission: 'lead.edit' })
  create(@CurrentActor() who: Actor, @Body(zod(LeadScanCreateBody)) body: LeadScanCreateBody) {
    return this.scans.create(who, body)
  }

  @Post('scan/:code/start')
  @HttpCode(202)
  @Need({ branch: 'Sales', permission: 'lead.edit' })
  start(
    @CurrentActor() who: Actor,
    @Param('code', zod(ScanBatchCode)) code: LeadScanParams['code'],
    @Body(zod(LeadScanStartBody)) body: LeadScanStartBody,
  ) {
    return this.scans.start(who, code, body)
  }

  @Get('scan/:code')
  @Need({ branch: 'Sales', permission: 'lead.edit' })
  status(
    @CurrentActor() who: Actor,
    @Param('code', zod(ScanBatchCode)) code: LeadScanParams['code'],
  ) {
    return this.scans.status(who, code)
  }

  @Post('scan/:code/commit')
  @HttpCode(202)
  @Need({ branch: 'Sales', permission: 'lead.edit' })
  commit(
    @CurrentActor() who: Actor,
    @Param('code', zod(ScanBatchCode)) code: LeadScanParams['code'],
  ) {
    return this.scans.commit(who, code)
  }

  @Get(':code/attachments')
  @Need({ branch: 'Sales', permission: 'lead.view', scoped: true })
  attachments(
    @CurrentActor() who: Actor,
    @Param('code', zod(ObjectCode)) code: LeadAttachmentsParams['code'],
  ) {
    return this.scans.attachments(who, code)
  }
}
