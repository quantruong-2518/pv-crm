import { Module } from '@nestjs/common'
import { RolesModule } from '../roles/roles.module'
import { NotificationController } from './notification.controller'
import { NotificationHub } from './notification.hub'
import { NotificationRepository } from './notification.repository'
import { NotificationService } from './notification.service'
import { NotificationSweeper } from './notification.sweeper'

/** The in-app bell (ADR 0085). Exports the HUB and nothing else: an emitter
 *  reports what happened through `announce`, and never learns what the rows
 *  look like. `RolesModule` for one question — which roles hold a permission
 *  today — so a role audience reads the same matrix the access guard does.
 *
 *  Listed in `app.module.ts` because it carries `/notifications`; a module
 *  that emits imports it again by name, the way `ApprovalModule` is. */
@Module({
  imports: [RolesModule],
  controllers: [NotificationController],
  providers: [NotificationRepository, NotificationHub, NotificationService, NotificationSweeper],
  exports: [NotificationHub],
})
export class NotificationModule {}
