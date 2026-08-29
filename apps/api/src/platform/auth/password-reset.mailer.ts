import { randomUUID } from 'node:crypto'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { renderPasswordReset } from '@pv/mail-templates'
import { brandAssetUrl, ENV, type Env } from '../config/env'
import { MAIL_PORT, type MailMessage, type MailPort } from '../mail/mail.contract'
import type { ResetMailer, ResetTicketIssued } from './reset-mailer'

/** THE SET-PASSWORD LETTER — composed and posted INLINE, off the ledger.
 *
 *  ==================================================================
 *  WHY THIS ONE LETTER DOES NOT GO THROUGH `platform.email_delivery`
 *  ==================================================================
 *  Every other mail in this system is a promise first and a send second: the
 *  branch writes a row inside its own transaction (`MAIL_ENQUEUE.enqueue`), the
 *  relay turns the row into a job, and a composer renders the body at send
 *  time. That pipeline buys retries, an idempotency key, a bounce history and a
 *  row a person can look at when something goes missing. It is the right
 *  default and this file is the ONE exception to it.
 *
 *  The reason is not taste, and it is not that the letter is small. A composer
 *  receives its per-recipient variables from the delivery row — `MailIntent`
 *  has exactly one field for them, `merge`, and `DeliveryToSend.merge` is where
 *  the worker reads them back. The only variable this letter has is the
 *  set-password URL, and that URL *is* the token. Queuing it would therefore
 *  write a LIVE CREDENTIAL, in clear, into `platform.email_delivery.merge` — a
 *  table that is kept for auditing, read by the health endpoint, dumped by
 *  every backup, and readable by anything holding the database role.
 *
 *  That would undo the single most deliberate decision in `auth.schema.ts`:
 *  `platform.password_reset` stores `sha256(token)` and never the token, so
 *  that a stolen database is not a set of live account-takeover links. Storing
 *  the plaintext one table over gives an attacker exactly what the hash was
 *  built to withhold, and gives it to them in a table nobody thinks of as
 *  sensitive. Read access to the ledger would become account takeover for every
 *  reset issued inside the retention window.
 *
 *  So the token never touches Postgres in a form anyone can use. It lives in
 *  process memory for the length of one `send()` call, goes into an HTTPS
 *  request body, and is gone.
 *
 *  ------------------------------------------------------------------
 *  WHAT THAT COSTS, STATED PLAINLY SO NOBODY "FIXES" IT LATER
 *  ------------------------------------------------------------------
 *   · No retry. A provider blip, a 500, a timeout — the letter is lost.
 *   · No ledger row, so no bounce/complaint history for this letter and
 *     nothing on `/healthz/email` about it.
 *   · No meaningful idempotency: a duplicated request sends a second letter.
 *
 *  All three are acceptable HERE and nowhere else, because this is the one
 *  letter whose recovery is free and instant: the person presses "Quên mật
 *  khẩu" again and a new ticket is issued. Compare a lead alert, which nobody
 *  can re-request because nobody knows it was owed — that is what the ledger
 *  exists for, and why moving this letter onto it would be trading a real
 *  security property for a retry the user can perform themselves.
 *
 *  A future letter carrying no secret (a "your password was changed" notice,
 *  say) belongs on the queue like everything else. The exception is the token,
 *  not the flow.
 *
 *  ------------------------------------------------------------------
 *  `send` MUST NOT THROW — AND THE FAILURE IT PREVENTS IS NOT "A 500"
 *  ------------------------------------------------------------------
 *  `/auth/forgot-password` answers 204 for every address on earth, so that an
 *  outsider cannot use it to learn which mailboxes hold accounts. An exception
 *  escaping this method would make a KNOWN mailbox answer differently from an
 *  unknown one — slower, or with an error — and hand back exactly the fact the
 *  endpoint spends its whole design withholding. `AuthService.issueTicket`
 *  already wraps the call in a try/catch as a belt; this file is the braces,
 *  and the two are not redundant: a mailer that throws would also break the
 *  `/users` invite path, which has no such catch of its own.
 *
 *  `MailPort.send` reports ordinary provider failure as `{ok: false}` rather
 *  than by throwing, so the failure path here is a branch, not a catch. The
 *  catch is for the rest — a render that blows up, a DNS failure inside the
 *  SDK, an `AbortSignal.timeout` firing.
 *
 *  ------------------------------------------------------------------
 *  NOTHING THIS FILE LOGS MAY CONTAIN THE TOKEN
 *  ------------------------------------------------------------------
 *  Logs go to a shipper, a dashboard, a screenshot and a support chat. The one
 *  exception is the door-shut case at the bottom of `send`, and its condition is
 *  copied from `InviteView.link` in `@pv/contracts` rather than invented here:
 *  when `PV_EMAIL_ENABLED=false` no letter can reach anybody at all, so the
 *  console is the only way the flow can be rehearsed, and refusing to print the
 *  link would mean the feature simply cannot be tested on a development box. */
@Injectable()
export class PasswordResetMailer implements ResetMailer {
  private readonly log = new Logger('auth')

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(MAIL_PORT) private readonly mail: MailPort,
  ) {}

  async send(issued: ResetTicketIssued): Promise<void> {
    try {
      const { subject, html, text } = await renderPasswordReset({
        purpose: issued.purpose,
        name: issued.name,
        email: issued.email,
        link: issued.link,
        /* Gốc ảnh nhận diện. Đi qua props chứ không phải hằng số của gói
           template vì nó là sự thật của bản triển khai — dev, staging và Fly
           có ba gốc khác nhau, và gói template không được biết cái nào. */
        assetBaseUrl: brandAssetUrl(this.env),
        expiresAt: issued.expiresAt.toISOString(),
      })

      const message: MailMessage = {
        /* One person asked, one person is waiting — `transactional`, which is
           what keeps this letter on `RESEND_API_KEY` and not on the MAS
           account. The split exists because Resend enforces bounce ceilings per
           ACCOUNT: a bad campaign must not be able to take the password mail
           down with it. See `MailFlow`. */
        flow: 'transactional',
        /* The auth sender when the deployment named one, otherwise the ordinary
           transactional sender. A password letter arriving from `leads@` is
           phishing-shaped, and the lesson it teaches — that a set-password mail
           can come from any address — is exactly the one a real attacker needs
           the reader to have learned. `env.ts` explains the split in full. */
        from: this.env.PV_AUTH_EMAIL_FROM || this.env.PV_EMAIL_FROM,
        /* Stripped even though it came out of `platform.actor.email`. The rule
           is to sanitize by ORIGIN and not by route: that column is filled from
           the `/users` admin form, so it is still a string a person typed, only
           one that took a detour through a table. A newline here would end the
           `To:` header and turn everything after it into headers of its own —
           the same defence `lead-mail.composer.ts` applies for the same
           reason. */
        to: header(issued.email),
        /* Kept when the deployment configured one. This letter says "không cần
           trả lời", but the person most worth hearing from is the one replying
           "I never asked for this" — that reply should reach a human rather
           than bounce off a no-reply address. */
        replyTo: header(this.env.PV_EMAIL_REPLY_TO) || undefined,
        subject,
        html,
        text,
      }

      /* A FRESH key every time, and never one derived from the actor or the
         ticket. Resend collapses two sends sharing a key onto the first one for
         24 hours: a stable `auth-reset/<actorId>` would mean the SECOND
         "Quên mật khẩu" of the day silently never arrives, which is the exact
         failure mode a person hits when the first letter went to spam. There is
         no ledger row to retry against, so the key has no second job here — it
         only has to be unique. It must also stay unrelated to the token: the
         driver prints it on every failure (`[resend] key=…`), and a key derived
         from the credential would put the credential in the log. */
      const result = await this.mail.send(message, `auth-reset/${randomUUID()}`)

      if (!result.ok) {
        /* No re-raise and no retry: see the header. The person is told nothing
           either way — `/auth/forgot-password` has already answered 204 — so
           this line is the only trace an operator gets, and it needs the code
           to be worth reading. Purpose and mailbox, never the link. */
        this.log.error(
          `Không gửi được thư ${issued.purpose} tới ${issued.email}: ` +
            `${result.kind} · ${result.code} · ${result.summary}`,
        )
      }
    } catch (error: unknown) {
      this.log.error(
        `Không dựng/gửi được thư ${issued.purpose} tới ${issued.email}: ` +
          `${error instanceof Error ? error.message : String(error)}`,
      )
    }

    /* Door shut: `ConsoleMailDriver` has just logged that a letter WOULD have
       gone out, and no request left the machine. That is the ordinary state of
       a development box, so it is `log` and not `warn` — nothing is wrong.
       Without this line the whole flow becomes unrehearsable the moment
       `RESET_MAILER` stops being `LoggingResetMailer`: the ticket is real and
       the screen at the other end works, but nobody can reach it.

       Deliberately OUTSIDE the try: a render that failed still leaves a valid
       ticket in the database, and on a machine that cannot send, this link is
       the only way to use it. */
    if (!this.env.PV_EMAIL_ENABLED) {
      this.log.log(`Vé ${issued.purpose} · ${issued.email} · ${issued.link}`)
    }
  }
}

/** A mail header ends at the first newline; anything after one becomes a header
 *  of its own. Same guard, same wording, as `lead-mail.composer.ts` — the two
 *  are separate copies because they sit either side of the platform/branch line
 *  and neither may import the other. */
function header(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim()
}
