import { Inject, Injectable, Logger } from '@nestjs/common'
import { MY_WORK_SECTION_LABEL, MyWorkSection } from '@pv/contracts'
import { renderAssistantBrief } from '@pv/mail-templates'
import { brandAssetUrl, ENV, type Env } from '../config/env'
import { MAIL_PORT, type MailPort } from '../mail/mail.contract'

/** What the letter may carry: counts and nothing else, so no name, code or AI text can
 *  reach a mailbox (ADR 0154 §5). `key` is the bell's event key, so a rerun that
 *  somehow got past the bell check is collapsed by the provider. */
export type BriefLetter = {
  to: string
  counts: Partial<Record<MyWorkSection, number>>
  /** Some section was cut, so the total is a floor. */
  atLeast: boolean
  key: string
}

/** The morning brief letter, posted inline like the password letters: the brief is
 *  born and sent in one pass, so it has no ledger row to retry from. A lost letter
 *  leaves the bell line, which is the same news. */
@Injectable()
export class AssistantBriefMailer {
  private readonly log = new Logger('AssistantBrief')

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(MAIL_PORT) private readonly mail: MailPort,
  ) {}

  /** Never rejects: a failed letter must not stop the next person's brief. */
  async send({ to, counts, atLeast, key }: BriefLetter): Promise<void> {
    try {
      const rows = MyWorkSection.options
        .map((section) => ({ label: MY_WORK_SECTION_LABEL[section], count: counts[section] ?? 0 }))
        .filter((row) => row.count > 0)
      const { subject, html, text } = await renderAssistantBrief({
        rows,
        atLeast,
        total: rows.reduce((sum, row) => sum + row.count, 0),
        openUrl: `${this.env.PV_APP_URL.replace(/\/+$/, '')}/`,
        assetBaseUrl: brandAssetUrl(this.env),
      })
      /* `PV_EMAIL_FROM`, not the auth sender: that one is for letters carrying a password link. */
      const result = await this.mail.send(
        {
          flow: 'transactional',
          from: this.env.PV_EMAIL_FROM,
          to: [to.replace(/[\r\n]+/g, ' ').trim()],
          replyTo: this.env.PV_EMAIL_REPLY_TO.replace(/[\r\n]+/g, ' ').trim() || undefined,
          subject,
          html,
          text,
        },
        key,
      )
      if (!result.ok) {
        this.log.error(`Brief letter not sent: ${result.kind} · ${result.code} · ${result.summary}`)
      }
    } catch (error: unknown) {
      this.log.error(
        `Brief letter not built or sent: ${error instanceof Error ? error.name : 'unknown'}`,
      )
    }
  }
}
