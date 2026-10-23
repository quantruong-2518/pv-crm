import { Module } from '@nestjs/common'
import { NotificationModule } from '@api/platform/notification/notification.module'
import { SettingModule } from '@api/platform/setting/setting.module'
import { AfterSaleRepository } from './after-sale.repository'
import { AfterSaleReminderSweeper } from './after-sale-reminder.sweeper'

/** The re-care sweep, apart from the book: only the worker imports it
 *  (`worker.ts`), so the HTTP process never builds a sweeper it would not
 *  tick — `HoldReminderModule`'s shape. No controller. */
@Module({
  imports: [NotificationModule, SettingModule],
  providers: [AfterSaleRepository, AfterSaleReminderSweeper],
  exports: [AfterSaleReminderSweeper],
})
export class AfterSaleReminderModule {}
