import { Module } from '@nestjs/common'
import { EnginesModule } from '@api/platform/engines/engines.module'
import { GraphModule } from '@api/platform/graph/graph.module'
import { MailModule } from '@api/platform/mail/mail.module'
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
 *  `exports` có `OpportunityService` và `OpportunityMailComposer`, không có
 *  repository: module khác được hỏi "cho tôi sổ cơ hội của người này", không
 *  được với thẳng vào bảng. */
@Module({
  imports: [EnginesModule, GraphModule, MailModule],
  controllers: [OpportunityController],
  providers: [
    OpportunityService,
    OpportunityRepository,
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
