import { Inject, Injectable } from '@nestjs/common'
import { renderLeadIntakeInternal } from '@pv/mail-templates'
import { ENV, type Env } from '@api/platform/config/env'
import type { DeliveryToSend, MailMessage } from '@api/platform/mail/mail.contract'
import type { MailComposer } from '@api/platform/queue/mail-composer'
import { LeadIntakeRepository } from './lead-intake.repository'

/** THE BODY OF A LEAD MAIL, BUILT WHERE THE LEAD LIVES.
 *
 *  ------------------------------------------------------------------
 *  WHY THIS SITS IN THE BRANCH AND NOT IN `platform/mail`
 *  ------------------------------------------------------------------
 *  Composing this mail means reading `sales.lead` and `sales.lead_intake`, and
 *  `platform/` may not import `branches/` — the rule that keeps the platform
 *  from growing branch knowledge. So the seam runs the other way: the worker
 *  asks for a `MailMessage` through `MAIL_COMPOSER` and never learns which
 *  branch answered, while the branch that owns the tables owns the body.
 *
 *  ------------------------------------------------------------------
 *  ONE TOKEN, ONE COMPOSER — AND THE DAY THAT STOPPED BEING TRUE
 *  ------------------------------------------------------------------
 *  This file used to be the only provider under `MAIL_COMPOSER` and threw on
 *  any template but its own, with a note saying the second sender would turn
 *  the token into a registry keyed by `delivery.template`. MAS was that second
 *  sender. The throw moved to `MailConsumer.composerFor()` — the one place that
 *  can tell "no composer claims this" from "not mine" — and what is left here
 *  is `supports()`, a pure predicate naming the single template this file
 *  renders.
 *
 *  The rule the old throw protected is unchanged and now enforced one level up:
 *  an unclaimed template must FAIL rather than fall through to a default body,
 *  because a mail sent with the wrong body cannot be recalled, while a job that
 *  fails is retried, parked, and eventually looked at by a person.
 *
 *  Nothing here knows Resend, and nothing here knows React — the template
 *  package renders, this file only supplies data and the envelope. */
@Injectable()
export class LeadMailComposer implements MailComposer {
  constructor(
    private readonly intake: LeadIntakeRepository,
    @Inject(ENV) private readonly env: Env,
  ) {}

  supports(template: string): boolean {
    return template === 'lead-intake-internal'
  }

  async compose(delivery: DeliveryToSend): Promise<MailMessage> {
    const profile = await this.intake.profileFor(delivery.aggregateId)
    if (!profile) {
      throw new Error(`Lead ${delivery.aggregateId} không có lượt nộp nào để báo.`)
    }

    const { subject, html, text } = await renderLeadIntakeInternal({
      leadCode: profile.leadCode,
      company: profile.company,
      contactName: profile.contactName,
      email: profile.email,
      phone: profile.phone ?? undefined,
      pain: profile.pain ?? undefined,
      landingPage: profile.landingPage,
      receivedAt: profile.receivedAt.toISOString(),
      leadUrl: `${this.env.PV_APP_URL.replace(/\/+$/, '')}/sales/leads/${profile.leadCode}`,
      utm: {
        source: profile.utmSource ?? undefined,
        medium: profile.utmMedium ?? undefined,
        campaign: profile.utmCampaign ?? undefined,
        content: profile.utmContent ?? undefined,
        term: profile.utmTerm ?? undefined,
      },
    })

    return {
      /* A lead alert is one letter one submission caused — `transactional`, so
         it keeps riding `RESEND_API_KEY` on the day MAS moves onto a second
         account. See `MailFlow`. */
      flow: 'transactional',
      from: this.env.PV_EMAIL_FROM,
      to: delivery.recipient,
      /* Reply-To is the LEAD's mailbox, so a salesperson answering the alert
         is already writing to the customer. `From` stays on the verified
         sending domain — putting the lead's address there would be a forgery
         every receiving server is built to reject. Stripped of CR/LF because
         this value reaches a mail header. */
      replyTo: header(profile.email) || this.env.PV_EMAIL_REPLY_TO || undefined,
      subject,
      html,
      text,
    }
  }
}

/** A mail header ends at the first newline. Anything a submitter typed after
 *  one would become a header of its own — that is header injection, and the
 *  cheapest place to stop it is on the way in. */
function header(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim()
}
