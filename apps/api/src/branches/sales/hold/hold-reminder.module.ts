import { Module } from '@nestjs/common'
import { NotificationModule } from '@api/platform/notification/notification.module'
import { HoldReminderRepository } from './hold-reminder.repository'
import { HoldReminderSweeper } from './hold-reminder.sweeper'

/** The hold reminder sweep, apart from the hold doors: only the worker
 *  imports it (`worker.ts`), so the HTTP process never builds a sweeper it
 *  would not tick. No controller. */
@Module({
  imports: [NotificationModule],
  providers: [HoldReminderRepository, HoldReminderSweeper],
  exports: [HoldReminderSweeper],
})
export class HoldReminderModule {}
