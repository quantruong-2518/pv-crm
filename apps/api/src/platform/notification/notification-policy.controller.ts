import { Body, Controller, Get, Param, Put } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import { NotificationPolicyBody, NotificationPolicyParams } from '@pv/contracts'
import { Need } from '../access/need.decorator'
import { zod } from '../http/zod.pipe'
import { CurrentActor } from '../session/current-actor.decorator'
import { NotificationPolicyService } from './notification-policy.service'

/** `/admin/notifications` — who hears which kind (ADR 0093 §2, contract
 *  `NOTIFICATION_POLICY_PATH`). `setting.manage` on both doors and no branch,
 *  for `/platform/settings`' reason: nobody browses this list, it is opened to
 *  change something, and the bell belongs to no product line. */
@Controller('admin/notifications')
export class NotificationPolicyController {
  constructor(private readonly policies: NotificationPolicyService) {}

  @Get()
  @Need({ permission: 'setting.manage' })
  list() {
    return this.policies.list()
  }

  @Put(':kind')
  @Need({ permission: 'setting.manage' })
  set(
    @CurrentActor() who: Actor,
    @Param(zod(NotificationPolicyParams)) p: NotificationPolicyParams,
    @Body(zod(NotificationPolicyBody)) body: NotificationPolicyBody,
  ) {
    return this.policies.set(who, p.kind, body)
  }
}
