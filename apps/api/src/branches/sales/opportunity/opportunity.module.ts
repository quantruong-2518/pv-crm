import { Module } from '@nestjs/common'
import { EnginesModule } from '@api/platform/engines/engines.module'
import { GraphModule } from '@api/platform/graph/graph.module'
import { MailModule } from '@api/platform/mail/mail.module'
import { ContractRepository } from '../contract/contract.repository'
import { TouchModule } from '../touch/touch.module'
import { OpportunityController } from './opportunity.controller'
import { OpportunityMailComposer } from './opportunity-mail.composer'
import { OpportunityRepository } from './opportunity.repository'
import { OpportunityService } from './opportunity.service'

/** Module 3 · Sổ cơ hội.
 *
 *  `imports` khai TƯỜNG MINH chứ không nhờ `@Global()`, cùng luật với
 *  `LeadModule`: đọc hai dòng này là biết module cơ hội hỏi ai.
 *
 *   · `EnginesModule` — E2 là lưới thứ hai của `book()`. Trục phạm vi đã cắt ở
 *     SQL rồi; engine ở đây để ngày ai đó thêm endpoint quên `scoped: true`
 *     vẫn còn một hàng rào.
 *   · `GraphModule` — đổi một lead thành cơ hội là ghi một object mới vào đồ
 *     thị E1. Khác `LeadModule` ở một điểm đáng nhớ: `lead.code` có khoá ngoại
 *     về `platform.object` nên Postgres ÉP dòng gương, còn `opportunity.code`
 *     thì chưa, nên ở đây dòng gương là kỷ luật của service. Quên nó thì
 *     ContextRail của đơn mới mở ra trống mà không có gì đỏ (luật 10).
 *   · `MailModule` — mở một cơ hội là hứa rằng có người sẽ được báo, và lời hứa
 *     đó là một dòng ghi trong CHÍNH transaction đã ghi cơ hội
 *     (`OpportunityService#notify`). Module này lấy từ đó đúng một token hẹp,
 *     `MAIL_ENQUEUE` — nửa GHI. Nó không lấy sổ gửi, không lấy cổng ra, không
 *     lấy hàng đợi: một nhánh được nói "có một lá thư phải gửi", không được nói
 *     "gửi ngay bây giờ". Cùng đường mà `LeadModule` đi.
 *
 *   · `TouchModule` — mọi lượt ghi của sổ này để lại một dòng trên thẻ hoạt
 *     động, và dòng đó phải cùng vào hoặc cùng không với lượt ghi sinh ra nó.
 *     Lấy `TouchService`, không lấy repository — cùng luật mà module này áp cho
 *     chính mình ở dòng `exports` bên dưới.
 *
 *  ------------------------------------------------------------------
 *  `ContractRepository` LÀ PROVIDER Ở ĐÂY, KHÔNG PHẢI MỘT MODULE ĐƯỢC NHẬP
 *  ------------------------------------------------------------------
 *  `sales.contract` không có module của riêng nó, và nó không cần: bảng đó
 *  không có màn, không có sổ, và cửa DUY NHẤT ghi vào nó là
 *  `POST /sales/ops/:code/contract` — một hành động trên một cơ hội. Dựng
 *  `ContractModule` chỉ để `OpportunityModule` nhập lại là thêm một tầng mà
 *  không thêm một ranh giới nào.
 *
 *  Ranh giới thật vẫn còn và nằm ở chỗ khác: `contract/` sở hữu bảng, khoá,
 *  mapper và sổ ràng buộc của nó; module này chỉ được cầm cái repository. Và
 *  module này VỐN ĐÃ đọc bảng đó — `OpportunityRepository.signed()` hỏi
 *  `contract` bằng `EXISTS` từ trước khi file này tồn tại — nên đường ghi đi
 *  cùng đường đọc là chỗ đúng của nó. Ngày có sổ hợp đồng thật, `ContractModule`
 *  ra đời với controller của nó và repository chuyển sang bên đó.
 *
 *  `exports` có `OpportunityService` và `OpportunityMailComposer`, không có
 *  repository: module khác được hỏi "cho tôi sổ cơ hội của người này", không
 *  được với thẳng vào bảng. */
@Module({
  imports: [EnginesModule, GraphModule, MailModule, TouchModule],
  controllers: [OpportunityController],
  providers: [
    OpportunityService,
    OpportunityRepository,
    ContractRepository,
    /* Một mục của đăng bạ `MAIL_COMPOSER`. Xuất ra dưới dạng CLASS chứ không
       dưới token: đăng bạ là một mảng do
       `QueueModule.forWorker({ composers: [...] })` ghép lại, vì Nest không gộp
       được hai provider cùng token ở hai module. `worker.ts` là file gọi tên
       class này cạnh hai composer kia. */
    OpportunityMailComposer,
  ],
  exports: [OpportunityService, OpportunityMailComposer],
})
export class OpportunityModule {}
