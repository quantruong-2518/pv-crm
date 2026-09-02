import { Inject, Injectable, Logger } from '@nestjs/common'
import { brandAssetUrl, domainOf, ENV, type Env } from '@api/platform/config/env'
import type { MailComposer } from '@api/platform/queue/mail-composer'
import type { DeliveryToSend, MailMessage } from './mail.contract'
import { renderMasLetter, senderOf } from './mas-letter'
import { MailRunRepository } from './mail-run.repository'
import { sign } from './unsubscribe-token'

/** The one template this composer answers for. A version in the name because
 *  `email_delivery.template` is written into rows that outlive this code: the
 *  day the shell changes shape, `mas-v2` renders the new letters while every
 *  row already queued still finds the renderer it was written against. */
const TEMPLATE = 'mas-v1'

/** THE BODY OF A MASS MAIL, BUILT WITHOUT KNOWING WHOSE IT IS.
 *
 *  ------------------------------------------------------------------
 *  WHY THIS ONE LIVES IN `platform` WHEN `LeadMailComposer` DOES NOT
 *  ------------------------------------------------------------------
 *  The lead-intake composer sits in the Sales branch because composing that
 *  letter means READING `sales.lead` — and `platform/` may not. This one reads
 *  nothing of the sort. Everything it needs was written down before the batch
 *  was queued, in two places both of which are platform tables:
 *
 *   · `platform.mail_run`        the subject, the body, the CTA, the sending
 *                                address — snapshotted at creation, so editing
 *                                a template never rewrites a letter already
 *                                posted.
 *   · `email_delivery.merge`     this recipient's substitution values, written
 *                                across by the branch that was allowed to read
 *                                the lead.
 *
 *  So there is nothing branch-shaped left, and the composer belongs beside the
 *  ledger it reads. That is the whole point of the `merge` column: it moves the
 *  branch's knowledge to the platform's side of the line ONCE, at enqueue time,
 *  instead of dragging the platform across the line at every send.
 *
 *  ------------------------------------------------------------------
 *  `List-Unsubscribe` IS NOT OPTIONAL AND NOT A COURTESY
 *  ------------------------------------------------------------------
 *  Gmail and Yahoo both require one-click unsubscribe headers from anyone
 *  sending bulk mail, and enforce it by refusing or foldering the mail —
 *  meaning the cost of omitting them is not a complaint, it is a sending domain
 *  that quietly stops working for every OTHER mail this system sends,
 *  transactional ones included. Two headers, and both are needed: the `Post`
 *  header is what tells the receiver the URL will accept an unattended POST,
 *  and without it the first header is read as the old mailto-era hint.
 *
 *  React is never imported here — `@pv/mail-templates` exposes a plain
 *  `{subject, html, text}` function and that is the only door apps/api may use
 *  (eslint.config.js block 3b). */
@Injectable()
export class MasMailComposer implements MailComposer {
  private readonly log = new Logger('mail.composer.mas')

  constructor(
    private readonly runs: MailRunRepository,
    @Inject(ENV) private readonly env: Env,
  ) {}

  supports(template: string): boolean {
    return template === TEMPLATE
  }

  async compose(delivery: DeliveryToSend): Promise<MailMessage> {
    /* Both failures below are the same kind: a row that cannot be composed
       must stop, loudly, and be looked at. `mail.consumer.ts` settles the
       ledger before the throw escapes, so the row is retried and eventually
       parked — never sent with a default body. A mass mail with the wrong body
       cannot be recalled. */
    if (!delivery.mailRunId) {
      throw new Error(`Delivery ${delivery.id} mang template ${TEMPLATE} nhưng không có mail_run.`)
    }

    const run = await this.runs.byId(delivery.mailRunId)
    if (!run) {
      throw new Error(`Không tìm thấy mail_run ${delivery.mailRunId} của delivery ${delivery.id}.`)
    }

    const unsubscribeUrl = this.unsubscribeUrl(delivery.id)
    const {
      subject: finalSubject,
      html,
      text,
      missing,
    } = await renderMasLetter({
      subject: run.subject,
      body: run.body,
      cta: run.ctaLabel && run.ctaUrl ? { label: run.ctaLabel, url: run.ctaUrl } : undefined,
      merge: delivery.merge ?? {},
      unsubscribeUrl,
      sender: senderOf(run.fromAddress, this.env.PV_MAS_SENDER_POSTAL),
      assetBaseUrl: brandAssetUrl(this.env),
    })

    if (missing.length > 0) {
      /* One line, keys only. The recipient's address never reaches a log: this
         line is about a template that names a variable the batch did not
         supply, and printing who it happened to would put a mailing list into
         the log stream one entry at a time. `delivery.id` is enough to find
         the row.

         The compose panel now warns about the same keys BEFORE the send
         (`POST /sales/mail/preview` returns them), so reaching this line means
         the warning was ignored or the run was built by something other than
         the panel. It stays: a log is the only witness left at this point. */
      this.log.warn(
        `Thiếu biến trộn ${missing.join(', ')} ở delivery ${delivery.id} · run ${run.id}.`,
      )
    }

    return {
      /* `mas`, and this one line is what keeps a bad batch from taking the
         transactional pipeline down with it — see `MailFlow`. */
      flow: 'mas',
      from: header(run.fromAddress),
      to: delivery.recipient,
      replyTo: this.replyToFor(run.replyTo, delivery.id),
      subject: finalSubject,
      html,
      text,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    }
  }

  /** Where the unsubscribe link points — the API's own origin, not the web
   *  app's.
   *
   *  One-click unsubscribe is an unattended `POST` sent by Gmail's or Yahoo's
   *  infrastructure, with no session and no browser, and it has to land on
   *  `UnsubscribeController` (`POST|GET /mail/unsubscribe/:token`). Pointing it
   *  at `PV_APP_URL` is correct only where the API is proxied under the app
   *  origin — and where it is not, every unsubscribe fails silently, which is
   *  worse than having no link at all: the recipient believes they opted out
   *  and reports the next letter as spam instead.
   *
   *  So `PV_API_PUBLIC_URL` first, and the fallback to `PV_APP_URL` is for the
   *  proxied-under-one-origin case and for a dev machine. It is not a guess
   *  production can slip into: `env.ts` refuses to boot with
   *  `PV_MAS_ENABLED=true` and no `PV_API_PUBLIC_URL`. */
  private unsubscribeUrl(deliveryId: string): string {
    const origin = this.env.PV_API_PUBLIC_URL || this.env.PV_APP_URL
    const base = origin.replace(/\/+$/, '')
    return `${base}/mail/unsubscribe/${sign(deliveryId, this.env.PV_UNSUBSCRIBE_SECRET)}`
  }

  /** Per-delivery plus-address when reply tracking is on, the run's static
   *  snapshot otherwise. Both are `Reply-To`, not `From` — a lead answering
   *  looks the same either way; the plus-address is only how THIS system
   *  tells two replies apart once `mail-webhook.controller.ts` reads one back.
   *
   *  Falls back to the static address when `PV_EMAIL_MAS_FROM` carries no
   *  domain to build on — `env.ts` already refuses to boot with
   *  `PV_MAS_ENABLED=true` and that variable empty, but a send should not
   *  crash over reply tracking specifically; it should just not get it. */
  private replyToFor(staticReplyTo: string | null, deliveryId: string): string | undefined {
    if (this.env.PV_MAS_REPLY_TRACKING_ENABLED) {
      const domain = domainOf(this.env.PV_EMAIL_MAS_FROM)
      if (domain) return `reply+${deliveryId}@${domain}`
    }
    return staticReplyTo ? header(staticReplyTo) : undefined
  }
}

/** A mail header ends at the first newline; anything after one would become a
 *  header of its own. Same guard, same reason, as `lead-mail.composer.ts` —
 *  duplicated because these two files are on opposite sides of the
 *  platform/branch line and may not share a helper. */
function header(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim()
}
