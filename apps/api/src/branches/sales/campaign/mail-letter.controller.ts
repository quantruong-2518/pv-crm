import { Body, Controller, HttpCode, Post } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  MailGroupPreflightRequest,
  MailGroupPreviewRequest,
  MailGroupSendRequest,
} from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { CurrentActor } from '@api/platform/session/current-actor.decorator'
import { MailLetterService } from './mail-letter.service'

/** `/sales/mail/letters` — the group letter of a detail door (G1).
 *
 *  All three declare `lead.send-email`, scoped: the verdict needs the
 *  subject's lead, which only the body names, so `MailLetterService` proves
 *  the axis on it. The two dry runs answer 200 for the reason `MasController`
 *  gives — they create nothing. */
@Controller('sales/mail/letters')
export class MailLetterController {
  constructor(private readonly letters: MailLetterService) {}

  @Post('preflight')
  @HttpCode(200)
  @Need({ branch: 'Sales', permission: 'lead.send-email', scoped: true })
  preflight(
    @CurrentActor() who: Actor,
    @Body(zod(MailGroupPreflightRequest)) body: MailGroupPreflightRequest,
  ) {
    return this.letters.preflight(who, body)
  }

  @Post('preview')
  @HttpCode(200)
  @Need({ branch: 'Sales', permission: 'lead.send-email', scoped: true })
  preview(
    @CurrentActor() who: Actor,
    @Body(zod(MailGroupPreviewRequest)) body: MailGroupPreviewRequest,
  ) {
    return this.letters.preview(who, body)
  }

  /** File the run and queue the ONE letter; 201 with its run id. */
  @Post()
  @Need({ branch: 'Sales', permission: 'lead.send-email', scoped: true })
  send(@CurrentActor() who: Actor, @Body(zod(MailGroupSendRequest)) body: MailGroupSendRequest) {
    return this.letters.send(who, body)
  }
}
