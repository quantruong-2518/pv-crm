import { Module } from '@nestjs/common'
import { TouchRepository } from './touch.repository'
import { TouchService } from './touch.service'

/** Dòng thời gian của nhánh Sales — một facility, không phải một module màn.
 *
 *  KHÔNG có controller, và đó là điểm đáng đọc nhất của file này. Hai đường đọc
 *  lần chạm sống trên `LeadController` và `OpportunityController`:
 *
 *      GET /sales/leads/:code/touches     `lead.xem`   · scoped
 *      GET /sales/ops/:code/touches       `cơ-hội.xem` · scoped
 *
 *  Một `@Controller('sales/touches')` với `?subject=` sẽ gọn hơn và sai: hai
 *  đường đó đòi HAI quyền khác nhau, mà `@Need` là metadata tĩnh trên một
 *  phương thức — một route không khai được "lead.xem nếu mã bắt đầu bằng LD,
 *  cơ-hội.xem nếu bắt đầu bằng OP". Nhét cả hai vào một cửa nghĩa là chọn một
 *  quyền cho cả hai, và cách nào cũng hỏng: chọn `lead.xem` thì presales — vai
 *  làm việc trên cơ hội mà không có quyền lead — mất dòng thời gian của chính
 *  đơn mình đang làm; chọn `cơ-hội.xem` thì marketing mất dòng thời gian của
 *  lead mình vừa mang về.
 *
 *  Đường đọc vì thế đứng cạnh chính dòng nó nói tới, ăn đúng ba trục quyền của
 *  dòng đó, và đi qua `byCode` của service sở tại để nhận đủ 404 lẫn 403 —
 *  cùng hình mà `GET /sales/leads/:code/mail` đã dựng.
 *
 *  `exports` có `TouchService`, không có repository: hai module kia được hỏi
 *  "ghi giúp tôi một lần chạm", không được với thẳng vào bảng. Cùng luật mà
 *  `OpportunityModule` áp cho chính nó. */
@Module({
  providers: [TouchService, TouchRepository],
  exports: [TouchService],
})
export class TouchModule {}
