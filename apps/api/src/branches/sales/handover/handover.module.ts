import { Module } from '@nestjs/common'
import { EnginesModule } from '@api/platform/engines/engines.module'
import { GraphModule } from '@api/platform/graph/graph.module'
import { NotificationModule } from '@api/platform/notification/notification.module'
import { SessionModule } from '@api/platform/session/session.module'
import { LeadStateModule } from '../lead/lead-state'
import { TouchModule } from '../touch/touch.module'
import { HandoverRepository } from './handover.repository'
import { SalesWorkHandover } from './handover.service'

/** The leaver hand-over (ADR 0097 §7). No controller: the door is
 *  `PATCH /users/:id`, and `app.module.ts` binds `SalesWorkHandover` to the
 *  users module's `WORK_HANDOVER` port. Leaf imports only (`LeadStateModule`,
 *  `TouchModule`), so no cycle through `LeadModule`. */
@Module({
  imports: [
    EnginesModule,
    GraphModule,
    NotificationModule,
    SessionModule,
    LeadStateModule,
    TouchModule,
  ],
  providers: [HandoverRepository, SalesWorkHandover],
  exports: [SalesWorkHandover],
})
export class HandoverModule {}
