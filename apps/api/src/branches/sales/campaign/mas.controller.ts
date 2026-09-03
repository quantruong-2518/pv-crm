import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  MailRunId,
  MailRunListQuery,
  MailRunPatch,
  MailTemplateCode,
  MailTemplateCreate,
  MailTemplatePatch,
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
 *  | `GET   /sales/mail/runs/:id/recipients` | `chiến-dịch.xem` · scoped |
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

  /** Who this batch went to, and where each letter got to. The READ permission
   *  of the run list, because this is the detail of exactly one row of that
   *  list — nothing here that `GET /sales/mail/runs` has not already summed
   *  into a number.
   *
   *  Declared BEFORE `@Patch('runs/:id')` so both doors of one resource sit
   *  together, read first then write. `MailRunId` guards `:id` at the
   *  `ZodPipe`, same as the cancel door: an `:id` that is not a UUID dies as a
   *  400 naming the field rather than reaching `WHERE mail_run_id = $1::uuid`
   *  and dying as a driver 500. */
  @Get('runs/:id/recipients')
  @Need({ branch: 'Sales', permission: 'chiến-dịch.xem', scoped: true })
  recipients(@CurrentActor() who: Actor, @Param('id', zod(MailRunId)) id: MailRunId) {
    return this.mas.recipients(who, id)
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

  /** The library's two write doors — the EDIT permission, not the one that
   *  fires mail.
   *
   *  Editing a template sends no letter: `mail_run` snapshots subject and body
   *  when the batch is created, so a template is only a starting point. Asking
   *  for the fire permission here would make whoever writes the copy hold the
   *  right to mail everybody — exactly what splitting those two roles avoids.
   *
   *  Not `scoped`, for the same reason the read door above is not: a template
   *  is nobody's property, so there is no scope axis to cut on. There is no
   *  DELETE door either — retiring a template is `active: false`, because a
   *  batch already run still names it (see `campaign.schema.ts`). */
  @Post('templates')
  @Need({ branch: 'Sales', permission: 'chiến-dịch.sửa' })
  createTemplate(@Body(zod(MailTemplateCreate)) body: MailTemplateCreate) {
    return this.mas.createTemplate(body)
  }

  @Patch('templates/:code')
  @Need({ branch: 'Sales', permission: 'chiến-dịch.sửa' })
  patchTemplate(
    @Param('code', zod(MailTemplateCode)) code: MailTemplateCode,
    @Body(zod(MailTemplatePatch)) body: MailTemplatePatch,
  ) {
    return this.mas.patchTemplate(code, body)
  }
}
