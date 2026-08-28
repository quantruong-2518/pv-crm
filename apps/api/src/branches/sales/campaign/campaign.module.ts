import { Module } from '@nestjs/common'
import { EnginesModule } from '@api/platform/engines/engines.module'
import { MailModule } from '@api/platform/mail/mail.module'
import { CampaignController } from './campaign.controller'
import { CampaignRepository } from './campaign.repository'
import { CampaignService } from './campaign.service'
import { MasController } from './mas.controller'
import { MasRepository } from './mas.repository'
import { MasService } from './mas.service'
import { SourceController } from './source.controller'
import { SourceRepository } from './source.repository'
import { SourceService } from './source.service'

/** Module 5 · Chiến dịch — hôm nay mới có nửa MAS mail của nó.
 *
 *  Tên module theo BẢNG (`sales.campaign`), tên file tính năng theo VIỆC
 *  (`mas.*`): một chiến dịch còn phải có sổ chiến dịch, tệp thành viên và chuỗi
 *  đợt gửi, cả ba đều sẽ là những bộ bốn file khác nằm cạnh bộ này. Đặt tên
 *  module là `MasModule` thì ngày thêm sổ chiến dịch phải hoặc đổi tên module,
 *  hoặc dựng module thứ hai cho cùng một schema.
 *
 *  ------------------------------------------------------------------
 *  `MailModule` VÀO ĐÂY VÌ HAI THỨ, VÀ CẢ HAI ĐỀU HẸP CÓ CHỦ Ý
 *  ------------------------------------------------------------------
 *   · `MAIL_ENQUEUE` — "có N lá thư đang nợ". Nhánh chỉ được hứa, không được
 *     gửi: token này không chở `claim`/`markAccepted`/`suppress`, nên không có
 *     đường nào từ một web request đi thẳng ra Resend.
 *   · `MailRunRepository` — `platform.mail_run` là dòng của nền, mà nó phải
 *     được ghi trong CÙNG transaction với N dòng `email_delivery` của nhánh.
 *     `create(tx, …)` chính là hình hẹp đó; xem docblock của `mail.module.ts`.
 *
 *  `EnginesModule` vào vì `MasService` hỏi E2 một câu mà `@Need` không khai
 *  được: quyền của cửa gửi phụ thuộc `campaignCode` trong thân yêu cầu. Khai
 *  tường minh chứ không nhờ `@Global()` — đọc dòng `imports` là biết module này
 *  có hỏi quyền, đúng thứ đồ thị module phải nói được.
 *
 *  `LeadModule` KHÔNG có mặt, và đó là chỗ trống có lý do: `MasRepository` đọc
 *  thẳng `sales.lead` vì nó cần một câu hỏi mà `LeadService` không xuất khẩu —
 *  "200 mã này, kèm trạng thái chặn của từng địa chỉ". Trong cùng một nhánh thì
 *  đọc thẳng bảng là bình thường (`lead.repository.ts` đọc `platform.actor` và
 *  `sales.contract` y hệt); luật "đi qua service xuất khẩu" là luật CHÉO NHÁNH.
 *
 *  `exports` để trống: chưa module nào cần hỏi nhánh này điều gì. Ngày sổ chiến
 *  dịch cần biết "lô này thuộc đợt mấy" thì thêm `MasService`, không mở bảng. */
@Module({
  imports: [EnginesModule, MailModule],
  controllers: [MasController, SourceController, CampaignController],
  providers: [
    MasService,
    MasRepository,
    SourceService,
    SourceRepository,
    /* Sổ chiến dịch (A3). `CampaignService` gọi thẳng `MasService.send()` và
       `MasService.cancel()` — `/start` và `/stop` tái dùng nguyên đường gửi và
       đường huỷ đã có, không viết lại; xem docblock đầu `campaign.service.ts`. */
    CampaignService,
    CampaignRepository,
  ],
})
export class CampaignModule {}
