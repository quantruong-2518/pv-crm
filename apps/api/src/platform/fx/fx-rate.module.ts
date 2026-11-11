import { Module } from '@nestjs/common'
import { AuditModule } from '../audit/audit.module'
import { NotificationModule } from '../notification/notification.module'
import { FxRateController } from './fx-rate.controller'
import { FX_FEED, VietcombankFeed } from './fx-rate.feed'
import { FxRateRepository } from './fx-rate.repository'
import { FxRateService } from './fx-rate.service'
import { FxRateSweeper } from './fx-rate.sweeper'

/** `platform.fx_rate` (ADR 0149): the daily Vietcombank rate and its correction.
 *  Exports nothing: the money SQL (`branches/sales/money.ts`) reads the table
 *  directly. The feed sits behind `FX_FEED` so a test swaps it. */
@Module({
  imports: [AuditModule, NotificationModule],
  controllers: [FxRateController],
  providers: [
    FxRateService,
    FxRateRepository,
    FxRateSweeper,
    { provide: FX_FEED, useClass: VietcombankFeed },
  ],
})
export class FxRateModule {}
