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
 *  ONE TOKEN, ONE COMPOSER — AND THE DAY THAT STOPS BEING TRUE
 *  ------------------------------------------------------------------
 *  Today Sales is the only branch that sends anything, so a single provider
 *  under `MAIL_COMPOSER` is honest. The second branch that needs a template
 *  turns this into a registry keyed by `delivery.template`. Until then an
 *  unknown template must THROW rather than fall through to a default body: a
 *  mail sent with the wrong body cannot be recalled, and a job that fails is
 *  retried, parked, and eventually looked at by a person.
 *
 *  Nothing here knows Resend, and nothing here knows React — the template
 *  package renders, this file only supplies data and the envelope. */
@Injectable()
export class LeadMailComposer implements MailComposer {
  constructor(
    private readonly intake: LeadIntakeRepository,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async compose(delivery: DeliveryToSend): Promise<MailMessage> {
    if (delivery.template !== 'lead-intake-internal') {
      throw new Error(`Không có bộ dựng thân mail cho template "${delivery.template}".`)
    }

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
