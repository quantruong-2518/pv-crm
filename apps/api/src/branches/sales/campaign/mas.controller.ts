import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  MailRunId,
  MailRunListQuery,
  MailRunPatch,
  MasPreflightRequest,
  MasPreviewRequest,
  MasSendRequest,
} from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { CurrentActor } from '@api/platform/session/current-actor.decorator'
import { MasService } from './mas.service'

/** `/sales/mail` — MAS mail, cửa HTTP của nhánh Sales.
 *
 *  Controller mỏng đúng như `lead.controller.ts`: nhận, kiểm, gọi, trả. Không
 *  `if` nghiệp vụ, không SQL, không `req`/`res`. Mọi thứ đáng đọc của sáu
 *  endpoint này nằm ở mấy dòng khai báo — đường dẫn, quyền, hình dữ liệu vào.
 *
 *  ------------------------------------------------------------------
 *  BA QUYỀN, VÀ CỬA GỬI KHAI QUYỀN THẤP HƠN NÓ THẬT SỰ ĐÒI
 *  ------------------------------------------------------------------
 *  | Đường                        | `@Need`                        |
 *  | ---------------------------- | ------------------------------ |
 *  | `POST  /sales/mail/preflight`| `lead.gửi-mail` · scoped       |
 *  | `POST  /sales/mail/preview`  | `lead.gửi-mail` · scoped       |
 *  | `POST  /sales/mail/runs`     | `lead.gửi-mail` · scoped (†)   |
 *  | `GET   /sales/mail/runs`     | `chiến-dịch.xem` · scoped      |
 *  | `PATCH /sales/mail/runs/:id` | `chiến-dịch.bắn` · scoped (‡)  |
 *  | `GET   /sales/mail/templates`| `chiến-dịch.xem`               |
 *
 *  (‡) HUỶ ĐÒI QUYỀN CAO HƠN GỬI, và đó không phải sơ suất. Một lô Quick MAS đi
 *  hết trong vài chục giây, nên thứ người ta thật sự huỷ được là một lô ĐÃ HẸN
 *  GIỜ hoặc một đợt của chiến dịch — cả hai đều là việc của người bắn chiến
 *  dịch, không phải của người gửi cho lead mình giữ. Trục phạm vi vẫn bật:
 *  `MasService.cancel` so `mail_run.created_by`, nên một người `ownOnly` dừng
 *  được lô của chính mình chứ không dừng được lô của người khác.
 *
 *  (†) Một `@Need` chỉ khai được MỘT quyền tĩnh, mà cửa gửi đòi quyền nào lại
 *  phụ thuộc `campaignCode` trong THÂN yêu cầu — thứ decorator chạy trước khi
 *  có. Nên ở đây khai quyền THẤP hơn (`lead.gửi-mail`) và `MasService.send`
 *  nâng lên `chiến-dịch.bắn` khi có `campaignCode`; đọc docblock của hàm đó cho
 *  lập luận đầy đủ, kể cả vì sao thứ tự ấy hỏng theo hướng đóng.
 *
 *  ------------------------------------------------------------------
 *  HAI CỬA ĐỌC KHAI `@HttpCode(200)`, VÀ ĐÓ KHÔNG PHẢI TRANG TRÍ
 *  ------------------------------------------------------------------
 *  Cùng lý do với `POST /sales/leads/import/preview`: 201 nghĩa là "có thứ vừa
 *  được tạo", mà `preflight` và `preview` không tạo gì — kể cả một con số của
 *  dãy mã. Cả hai là `POST` chỉ vì thứ chúng nhận không nhét vừa một query
 *  string: một bên là 200 mã lead, bên kia là thân thư 20.000 ký tự.
 *
 *  Danh sách mẫu mail nằm ở controller này chứ không ở một module riêng: nó là
 *  ô chọn của chính panel soạn mail, và `sales.mail_template` cố tình không
 *  được đường gửi đọc (`mail_run` chụp lại nội dung lúc tạo). Một module chỉ để
 *  đọc một bảng phẳng là một module không nói thêm điều gì. */
@Controller('sales/mail')
export class MasController {
  constructor(private readonly mas: MasService) {}

  /** Chạy thử. KHÔNG ghi gì. */
  @Post('preflight')
  @HttpCode(200)
  @Need({ branch: 'Sales', permission: 'lead.gửi-mail', scoped: true })
  preflight(@CurrentActor() who: Actor, @Body(zod(MasPreflightRequest)) body: MasPreflightRequest) {
    return this.mas.preflight(who, body)
  }

  /** Render the letter so a person can look at it. Writes nothing, sends
   *  nothing.
   *
   *  The permission is the SEND one and not the read one, and the scope axis is
   *  on: this door renders a letter for ONE named lead, so previewing somebody
   *  else's lead means reading that lead's name and company. It never needs the
   *  campaign permission the send can escalate to — a campaign batch is still
   *  previewed one letter at a time. */
  @Post('preview')
  @HttpCode(200)
  @Need({ branch: 'Sales', permission: 'lead.gửi-mail', scoped: true })
  preview(@CurrentActor() who: Actor, @Body(zod(MasPreviewRequest)) body: MasPreviewRequest) {
    return this.mas.preview(who, body)
  }

  /** Mở một lô và đưa vào hàng đợi. 201 kèm `mailRunId` — panel đổi sang "đã
   *  xếp hàng" và trỏ được vào lô vừa tạo. KHÔNG có thư nào rời máy trong lời
   *  gọi này; worker quét sau, xem `MasSendResponse`. */
  @Post('runs')
  @Need({ branch: 'Sales', permission: 'lead.gửi-mail', scoped: true })
  send(@CurrentActor() who: Actor, @Body(zod(MasSendRequest)) body: MasSendRequest) {
    return this.mas.send(who, body)
  }

  /** Sổ các lô đã gửi. `chiến-dịch.xem` chứ không `lead.xem`: một dòng ở đây là
   *  một LÔ, và con số của nó nói về cả tệp người nhận chứ không về lead nào. */
  @Get('runs')
  @Need({ branch: 'Sales', permission: 'chiến-dịch.xem', scoped: true })
  runs(@CurrentActor() who: Actor, @Query(zod(MailRunListQuery)) q: MailRunListQuery) {
    return this.mas.list(who, q)
  }

  /** Dừng một lô. Khai SAU `@Get('runs')` để hai đường của cùng một tài nguyên
   *  nằm cạnh nhau, đọc trước rồi ghi.
   *
   *  `MailRunId` gác ở `ZodPipe`: một `:id` không phải UUID chết bằng 400 gọi
   *  tên ô, không đi tới câu `WHERE id = $1::uuid` để chết bằng 500 của driver.
   *  Có lô đó không, có phải của người này không, còn dừng được không — ba câu
   *  cần dữ liệu, nên là việc của service. */
  @Patch('runs/:id')
  @Need({ branch: 'Sales', permission: 'chiến-dịch.bắn', scoped: true })
  cancel(
    @CurrentActor() who: Actor,
    @Param('id', zod(MailRunId)) id: MailRunId,
    @Body(zod(MailRunPatch)) body: MailRunPatch,
  ) {
    return this.mas.cancel(who, id, body)
  }

  /** Danh mục mẫu. Không `scoped`: mẫu là tài sản chung của phòng, không đứng
   *  tên ai — không có trục phạm vi nào để cắt. */
  @Get('templates')
  @Need({ branch: 'Sales', permission: 'chiến-dịch.xem' })
  templates() {
    return this.mas.templates()
  }
}
