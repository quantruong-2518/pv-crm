import { Controller, Get, Param } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import { ContractCode, ObjectCode } from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { CurrentActor } from '@api/platform/session/current-actor.decorator'
import { MailTimelineService } from './mail-timeline.service'

/** The letters on a subject's activity line (G8) — one route per book, since
 *  each book has its own read permission (ADR 0004). They live here, beside
 *  the mail feature, rather than on the three book controllers: the query is
 *  one, and only the permission and the scope probe differ per book. */
@Controller('sales')
export class MailTimelineController {
  constructor(private readonly timeline: MailTimelineService) {}

  @Get('leads/:code/letters')
  @Need({ branch: 'Sales', permission: 'lead.view', scoped: true })
  lead(@CurrentActor() who: Actor, @Param('code', zod(ObjectCode)) code: ObjectCode) {
    return this.timeline.of(who, 'lead', code)
  }

  @Get('opportunities/:code/letters')
  @Need({ branch: 'Sales', permission: 'opportunity.view', scoped: true })
  opportunity(@CurrentActor() who: Actor, @Param('code', zod(ObjectCode)) code: ObjectCode) {
    return this.timeline.of(who, 'opportunity', code)
  }

  @Get('contracts/:code/letters')
  @Need({ branch: 'Sales', permission: 'contract.view', scoped: true })
  contract(@CurrentActor() who: Actor, @Param('code', zod(ContractCode)) code: ContractCode) {
    return this.timeline.of(who, 'contract', code)
  }
}
