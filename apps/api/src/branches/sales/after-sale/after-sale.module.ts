import { Module } from '@nestjs/common'
import { EnginesModule } from '@api/platform/engines/engines.module'
import { SettingModule } from '@api/platform/setting/setting.module'
import { AfterSaleController } from './after-sale.controller'
import { AfterSaleRepository } from './after-sale.repository'
import { AfterSaleService } from './after-sale.service'

/** The bought-customer book. Its bell lives apart in the worker-only
 *  `AfterSaleReminderModule`; the temperature writer is provided bare by the
 *  next-step module, whose close-out is the only one to write a reading. */
@Module({
  imports: [EnginesModule, SettingModule],
  controllers: [AfterSaleController],
  providers: [AfterSaleService, AfterSaleRepository],
})
export class AfterSaleModule {}
