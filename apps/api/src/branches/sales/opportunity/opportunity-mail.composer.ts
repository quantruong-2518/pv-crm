import { Inject, Injectable } from '@nestjs/common'
import { renderOpportunityLost, renderOpportunityOpened } from '@pv/mail-templates'
import { brandAssetUrl, ENV, type Env } from '@api/platform/config/env'
import type { DeliveryToSend, MailMessage } from '@api/platform/mail/mail.contract'
import type { MailComposer } from '@api/platform/queue/mail-composer'
import {
  OPPORTUNITY_STAGE_LABEL,
  OPPORTUNITY_STATE_LABEL,
  OPPORTUNITY_STOP_REASON_OTHER,
} from '@pv/contracts'
import { OpportunityRepository } from './opportunity.repository'

/** The bodies of the two internal deal mails, built where the deal lives:
 *  they read `sales.opportunity`, its owners and `sales.lead`, and `platform/`
 *  may not import `branches/` — so the worker asks through `MAIL_COMPOSER`.
 *
 *  One composer for both templates because both read the same row through
 *  `forMail`. The split is in `compose`, on the STORED state rather than the
 *  template name: a lost deal gets the lost letter even if somebody queued the
 *  other one. Labels come from `@pv/contracts`, never a copy here; the stop
 *  reason is resolved to its catalogue label before rendering. */

@Injectable()
export class OpportunityMailComposer implements MailComposer {
  constructor(
    private readonly repo: OpportunityRepository,
    @Inject(ENV) private readonly env: Env,
  ) {}

  supports(template: string): boolean {
    return template === 'opportunity-opened' || template === 'opportunity-lost'
  }

  async compose(delivery: DeliveryToSend): Promise<MailMessage> {
    const deal = await this.repo.forMail(delivery.aggregateId)
    if (!deal) {
      throw new Error(`Cơ hội ${delivery.aggregateId} không còn trong sổ để báo.`)
    }

    const { row, account, owners } = deal
    const saleOwners = owners.filter((o) => o.role === 'SALE').map((o) => o.name)
    const bdOwners = owners.filter((o) => o.role === 'BD').map((o) => o.name)
    const opUrl = `${this.env.PV_APP_URL.replace(/\/+$/, '')}/sales/opportunities/${row.code}`

    const { subject, html, text } =
      row.state === 'lost'
        ? await renderOpportunityLost({
            opCode: row.code,
            leadCode: row.leadCode,
            account,
            name: row.name,
            amount: row.amount,
            currency: row.currency,
            ...(await this.reasonOf(row.stopReason)),
            ...(row.stoppedAtStage
              ? { stoppedAt: OPPORTUNITY_STAGE_LABEL[row.stoppedAtStage] }
              : {}),
            ...(row.stopNote ? { stopNote: row.stopNote } : {}),
            saleOwners,
            bdOwners,
            /* `opportunity_lost_closed` keeps `closed_at` set on a lost deal;
               `created_at` rather than `!`, since a CHECK is the table's fence,
               not a licence for this layer to drop the other branch. */
            closedAt: (row.closedAt ?? row.createdAt).toISOString(),
            daysOpen: deal.daysOpen,
            opUrl,
            assetBaseUrl: brandAssetUrl(this.env),
          })
        : await renderOpportunityOpened({
            opCode: row.code,
            leadCode: row.leadCode,
            account,
            name: row.name,
            stateLabel: OPPORTUNITY_STATE_LABEL[row.state],
            ...(row.stage ? { stageLabel: OPPORTUNITY_STAGE_LABEL[row.stage] } : {}),
            amount: row.amount,
            currency: row.currency,
            expectedClose: row.expectedClose,
            saleOwners,
            bdOwners,
            ...(row.description ? { description: row.description } : {}),
            openedAt: row.createdAt.toISOString(),
            opUrl,
            assetBaseUrl: brandAssetUrl(this.env),
          })

    return {
      /* An internal alert about one deal — `transactional`, so it keeps riding
         `RESEND_API_KEY` on the day MAS moves onto its own account. See
         `MailFlow`. */
      flow: 'transactional',
      from: this.env.PV_EMAIL_FROM,
      to: [delivery.recipient],
      /* KHÁC mail lead intake: `replyTo` KHÔNG phải hộp thư khách.
         Thư này đi tới người gật đơn, và trả lời nó là trả lời trong nội bộ —
         mở sẵn một đường thư thẳng tới khách hàng ngay dưới một dòng "vì sao
         thua" là cách để một câu nội bộ đi nhầm ra ngoài. */
      ...(this.env.PV_EMAIL_REPLY_TO ? { replyTo: this.env.PV_EMAIL_REPLY_TO } : {}),
      subject,
      html,
      text,
    }
  }

  /** The stored reason is a catalogue id; the reader gets its label, and
   *  `other` reads "Khác" — its sentence is the note printed under it. */
  private async reasonOf(id: string | null): Promise<{ stopReason?: string }> {
    if (id === null) return {}
    if (id === OPPORTUNITY_STOP_REASON_OTHER) return { stopReason: 'Khác' }
    return { stopReason: (await this.repo.lossReasonName(id)) ?? id }
  }
}
