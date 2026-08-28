import { Injectable, Logger } from '@nestjs/common'
import type { MailMessage, MailPort, MailSendResult } from './mail.contract'

/** Stands in for `ResendMailDriver` whenever `PV_EMAIL_ENABLED=false` — every
 *  developer machine by default, see `env.ts`.
 *
 *  No request leaves the process. A single log line is the only trace, which
 *  is exactly what lets someone watch the whole mail path — enqueue, worker
 *  claim, send — run end to end without ever risking a real inbox. Wiring
 *  which driver gets registered for `MAIL_PORT` is the app module's decision,
 *  not this file's. */
@Injectable()
export class ConsoleMailDriver implements MailPort {
  private readonly log = new Logger('mail')

  async send(message: MailMessage, idempotencyKey: string): Promise<MailSendResult> {
    /* `flow` is printed because it is the one thing about a rehearsed letter
       that cannot be read back off the log any other way — which account it
       would have gone out through on a machine that has the split configured. */
    this.log.log(
      `[console] ${message.flow} → ${message.to} · "${message.subject}" · html ${message.html.length}b`,
    )
    return { ok: true, providerEmailId: `console-${idempotencyKey}` }
  }
}
