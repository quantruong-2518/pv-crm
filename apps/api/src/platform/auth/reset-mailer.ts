import { Inject, Injectable, Logger } from '@nestjs/common'
import { ENV, type Env } from '../config/env'

/** THE SEAM WHERE THE PASSWORD LETTER WILL BE WRITTEN — and nothing more.
 *
 *  ------------------------------------------------------------------
 *  WHY A SEAM INSTEAD OF THE COMPOSER ITSELF
 *  ------------------------------------------------------------------
 *  The reset TICKET and the reset LETTER are two different pieces of work with
 *  two different owners. The ticket is authentication: a single-use row, a
 *  hashed token, a 60-minute window, and the rule that a reset kills every live
 *  session. The letter is presentation: a subject line, a body that renders in
 *  Outlook, a `platform.email_delivery` row and an `event_key` that stops it
 *  being sent twice.
 *
 *  Wiring `AuthService` directly to `MAIL_ENQUEUE` would fuse the two, and the
 *  cost of that is not abstract: the next agent would have to reopen — and
 *  re-reason about — the file that decides who may sign in, in order to change
 *  a paragraph of Vietnamese. This interface is one method wide precisely so
 *  that never has to happen.
 *
 *  ------------------------------------------------------------------
 *  WHAT THE NEXT AGENT IMPLEMENTS
 *  ------------------------------------------------------------------
 *  Write a class implementing `ResetMailer`, then rebind the token in
 *  `auth.module.ts`:
 *
 *      { provide: RESET_MAILER, useClass: PasswordResetMailer }
 *
 *  Nothing else in this module changes. Two things the implementation MUST
 *  respect, both of them load-bearing:
 *
 *   1 · `send` MUST NOT THROW for an ordinary failure. `forgotPassword`
 *       promises the caller a 204 whether or not the mailbox exists, so an
 *       exception escaping here would answer differently for a known address
 *       than for an unknown one — handing an outsider the exact fact the whole
 *       endpoint is built to withhold. Log it, park it, retry it; do not raise
 *       it. The mail pipeline is already built for this: a row in
 *       `platform.email_delivery` is the promise, and the relay is what keeps
 *       it (`mail.contract.ts`).
 *
 *   2 · The `token` is a CREDENTIAL. It sets a password. It must reach the
 *       mail body and nothing else — no log line, no audit note, no error
 *       message, no response body. `InviteView.link` in `@pv/contracts` states
 *       the one exception and its condition: a machine whose outbound door is
 *       shut (`PV_EMAIL_ENABLED=false`), where no letter can reach anybody. */
export type ResetTicketIssued = {
  /** `'reset'` — the person pressed "Quên mật khẩu" and is sitting there
   *  waiting. `'invite'` — a manager opened an account and its owner does not
   *  know it exists yet. Same ticket table, same set-password screen, two
   *  different greetings and two very different TTLs; see `auth.schema.ts`. */
  purpose: 'invite' | 'reset'
  actorId: string
  /** For the greeting. The letter says a name, not a mailbox. */
  name: string
  email: string
  /** The raw token. See rule 2 above. */
  token: string
  /** Ready-built, so the letter and any screen that is allowed to show it
   *  cannot disagree about the URL. Built by `resetLink` below. */
  link: string
  expiresAt: Date
}

export interface ResetMailer {
  send(issued: ResetTicketIssued): Promise<void>
}

export const RESET_MAILER = Symbol('pv.auth.reset-mailer')

/** Where a set-password link points.
 *
 *  `PV_APP_URL` and not `PV_API_PUBLIC_URL`: this link is followed by a PERSON
 *  in a browser and lands on a screen. That is the opposite call from the
 *  one-click unsubscribe link, which is fetched by a mail server with no
 *  browser at all and therefore has to hit the API — the distinction is spelled
 *  out on `PV_API_PUBLIC_URL` in `env.ts`, and getting it backwards here would
 *  send every recipient to a JSON body.
 *
 *  One path for both purposes, because there is one screen: `/dat-lai-mat-khau`
 *  in `apps/web/src/routes.tsx`. An invite and a reset differ in who asked, not
 *  in what the person then does. */
export function resetLink(env: Env, token: string): string {
  return `${env.PV_APP_URL.replace(/\/+$/, '')}/dat-lai-mat-khau?token=${encodeURIComponent(token)}`
}

/** The default binding: no letter leaves the machine.
 *
 *  Not a stub to be deleted — it is the correct behaviour for every machine
 *  that has no mail template yet, and it keeps the whole flow rehearsable. The
 *  ticket is real, the token is real, the screen at the other end works; the
 *  only missing piece is the envelope.
 *
 *  The link is printed ONLY when the outbound door is shut, and that condition
 *  is copied deliberately from `InviteView.link` in `@pv/contracts` rather than
 *  invented here. With the door open a printed link is a link in a log
 *  aggregator, a screenshot and a support chat — and this one sets a password.
 *  With the door shut no letter can reach anybody, so the console is the only
 *  way anyone gets in, and refusing to print it would just mean the feature
 *  cannot be tested at all. */
@Injectable()
export class LoggingResetMailer implements ResetMailer {
  private readonly log = new Logger('auth')

  constructor(@Inject(ENV) private readonly env: Env) {}

  send(issued: ResetTicketIssued): Promise<void> {
    if (this.env.PV_EMAIL_ENABLED) {
      /* Door open, no composer bound. Say so loudly and WITHOUT the link: the
         person is waiting for a mail that is not coming, and that is an
         operator's problem to see, not a secret to print. */
      this.log.warn(
        `Vé ${issued.purpose} cho ${issued.email} đã tạo nhưng chưa có RESET_MAILER thật — không thư nào được gửi.`,
      )
      return Promise.resolve()
    }

    this.log.log(`Vé ${issued.purpose} · ${issued.email} · ${issued.link}`)
    return Promise.resolve()
  }
}
