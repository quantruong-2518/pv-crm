import { Inject, Injectable } from '@nestjs/common'
import { renderOpportunityLost, renderOpportunityOpened } from '@pv/mail-templates'
import { brandAssetUrl, ENV, type Env } from '@api/platform/config/env'
import type { DeliveryToSend, MailMessage } from '@api/platform/mail/mail.contract'
import type { MailComposer } from '@api/platform/queue/mail-composer'
import { STAGE_LABEL, STATE_LABEL } from './opportunity.labels'
import { OpportunityRepository } from './opportunity.repository'

/** THÂN CỦA HAI MAIL SỔ CƠ HỘI, DỰNG Ở NƠI CƠ HỘI SỐNG.
 *
 *  Cùng lý do `lead-mail.composer.ts` nằm trong nhánh: dựng thân mail này phải
 *  đọc `sales.opportunity`, `sales.opportunity_owner` và `sales.lead`, mà
 *  `platform/` không được nhập `branches/`. Nên đường nối chạy ngược: worker
 *  hỏi qua `MAIL_COMPOSER` và không bao giờ biết nhánh nào trả lời.
 *
 *  ------------------------------------------------------------------
 *  MỘT COMPOSER, HAI TEMPLATE — VÌ CHÚNG ĐỌC CÙNG MỘT DÒNG
 *  ------------------------------------------------------------------
 *  `supports` nhận cả hai tên. Tách làm hai class thì cả hai vẫn phải nhập
 *  `OpportunityRepository`, gọi đúng một hàm `forMail`, và dịch đúng một bộ
 *  nhãn — tức hai file cùng biết một thứ, đúng hình mà đăng bạ composer được
 *  dựng ra để tránh. Chỗ CHIA là `compose`, và nó chia bằng một câu `if` đọc
 *  chính trạng thái đã lưu, không bằng tên template: đơn thua thì gửi thư
 *  thua, kể cả khi có ai đó xếp nhầm hàng.
 *
 *  ------------------------------------------------------------------
 *  NHÃN TIẾNG VIỆT ĐÃ RỜI KHỎI FILE NÀY
 *  ------------------------------------------------------------------
 *  `@pv/contracts` cố tình chỉ giữ KHOÁ ('gui-quotation'), không giữ nhãn —
 *  nhãn là việc của tầng hiển thị. Hai bảng nhãn từng nằm ngay đây; nay chúng ở
 *  `opportunity.labels.ts`, vì dòng thời gian (`sales.touch`) cũng phải dựng
 *  câu "đơn vừa sang cột Chờ ký" và một bản chép thứ hai trong cùng một thư mục
 *  là bản sẽ bị quên. Bản của MÀN (`ops-fields.tsx`) vẫn còn và vẫn là khoản nợ
 *  đã ghi ở `docs/ban-giao-co-hoi.md`. */

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
      row.state === 'close-lost'
        ? await renderOpportunityLost({
            opCode: row.code,
            leadCode: row.leadCode,
            account,
            name: row.name,
            amount: row.amount,
            currency: row.currency,
            ...(row.lostReason ? { lossReason: row.lostReason } : {}),
            ...(row.lostNote ? { lossNote: row.lostNote } : {}),
            saleOwners,
            bdOwners,
            /* `closed_at` không thể null ở nhánh này — `opportunity_lost_state_closed`
               chặn một đơn `close-lost` chưa đóng. Vẫn lùi về `created_at` chứ
               không dùng `!`: một CHECK là hàng rào của bảng, không phải giấy
               phép để tầng trên bỏ nhánh còn lại. */
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
            stateLabel: STATE_LABEL[row.state],
            ...(row.stage ? { stageLabel: STAGE_LABEL[row.stage] } : {}),
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
      to: delivery.recipient,
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
}
