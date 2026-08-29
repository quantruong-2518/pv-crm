import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  LeadBookQuery,
  LeadCreate,
  LeadImportBody,
  LeadOwnerWrite,
  LeadPatch,
  MaObject,
  MeetingCreate,
  MeetingId,
  MeetingPatch,
} from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { CurrentActor } from '@api/platform/session/current-actor.decorator'
import { LeadService } from './lead.service'
import { LeadWriteService } from './lead-write.service'

/** `/sales/leads` — sổ lead, module 2 của nhánh Sales.
 *
 *  Controller mỏng có chủ ý: nhận, kiểm, gọi, trả. Không `if` nghiệp vụ, không
 *  SQL, không `req`/`res`. Mọi thứ đáng đọc của các endpoint này nằm ở mấy dòng
 *  khai báo — đường dẫn, quyền, hình dữ liệu vào.
 *
 *  ------------------------------------------------------------------
 *  TWO PERMISSIONS, AND THE THREE WRITE DOORS SHARE ONE
 *  ------------------------------------------------------------------
 *  Reading the book needs `lead.xem` and is `scoped: true` — a holder who only
 *  sees their own rows sees only their own rows. Reading ONE lead declares the
 *  same three axes, spelled identically, because it is the same question asked
 *  of one row; what differs is what the scope axis DOES with the answer, and
 *  that belongs to the service, not to the declaration. The three doors below need
 *  `lead.sửa`, including the preview: a dry run still reads the whole book to
 *  answer "does this mailbox already belong to somebody", and that answer is
 *  worth as much to someone fishing as the rows themselves.
 *
 *  ------------------------------------------------------------------
 *  `import/preview` IS DECLARED BEFORE `import`, AND IT IS NOT COSMETIC
 *  ------------------------------------------------------------------
 *  They are two different paths, so Fastify's router does not care. A reader
 *  does: the two differ by one word and only one of them writes, so the safe
 *  one is stated first and states its own emptiness in `@HttpCode(200)` —
 *  201 means "something was created", and this creates nothing at all. */
@Controller('sales/leads')
export class LeadController {
  constructor(
    private readonly leads: LeadService,
    private readonly write: LeadWriteService,
  ) {}

  @Get()
  @Need({ branch: 'Sales', permission: 'lead.xem', scoped: true })
  book(@CurrentActor() who: Actor, @Query(zod(LeadBookQuery)) q: LeadBookQuery) {
    return this.leads.book(who, q)
  }

  /** Thẻ điểm cả kỳ — bốn con số ĐẾM, màn tự chia thành tỉ lệ.
   *
   *  PHẢI đứng trước `@Get(':code')`, và đây là một luật của bộ định tuyến chứ
   *  không phải thẩm mỹ: Fastify khớp theo thứ tự khai, nên nếu `:code` khai
   *  trước thì chuỗi `scorecard` rơi vào nó và chết ở `zod(MaObject)` bằng một
   *  400 nói "Mã object sai dạng" — đúng về mặt kỹ thuật và vô nghĩa với người
   *  đọc log.
   *
   *  KHÔNG `scoped`: đây là điểm của cả phòng, không của riêng ai. Xem
   *  `LeadService.scorecard` cho lập luận đầy đủ. */
  @Get('scorecard')
  @Need({ branch: 'Sales', permission: 'lead.xem' })
  scorecard() {
    return this.leads.scorecard()
  }

  /** Nửa "không chiến dịch" của ô lọc Nguồn trên sổ — đọc docblock `LeadFacets`
   *  (`@pv/contracts`) trước khi đụng vào chỗ này.
   *
   *  PHẢI đứng trước `@Get(':code')`, cùng lý do `scorecard` đã ghi: chuỗi
   *  `facets` mà rơi vào `:code` thì chết ở `zod(MaObject)` bằng một 400 vô
   *  nghĩa với người đọc log.
   *
   *  `scoped: true`, cùng ba trục với `book()`: ô lọc phải chỉ chào những giá
   *  trị nằm TRONG sổ mà actor này đang thấy, không phải cả sổ của phòng. */
  @Get('facets')
  @Need({ branch: 'Sales', permission: 'lead.xem', scoped: true })
  facets(@CurrentActor() who: Actor) {
    return this.leads.facets(who)
  }

  /** Hồ sơ một lead — mọi thứ dòng sổ cố tình không chở.
   *
   *  Khai `@Get(':code')` SAU `@Get()`, và cùng ba trục quyền y hệt. Bộ định
   *  tuyến của Fastify ưu tiên đoạn tĩnh hơn đoạn tham số nên ngày có
   *  `GET /sales/leads/export` thì đường đó vẫn thắng `:code`; thứ tự khai ở
   *  đây là để người đọc thấy hai đường ĐỌC nằm cạnh nhau, trước ba cửa ghi.
   *
   *  `MaObject` là hàng rào thứ nhất: mã sai dạng chết ở `ZodPipe` với một 400
   *  gọi tên ô, không đi tới câu truy vấn. Hàng rào thứ hai — có lead đó không,
   *  có phải của người này không — là việc của service, vì nó cần dữ liệu. */
  @Get(':code')
  @Need({ branch: 'Sales', permission: 'lead.xem', scoped: true })
  profile(@CurrentActor() who: Actor, @Param('code', zod(MaObject)) code: MaObject) {
    return this.leads.profile(who, code)
  }

  /** Sổ mail của một lead — mỗi mốc là một LÔ đã gửi tới người này.
   *
   *  Đứng ở nhánh Lead chứ không nhánh Campaign, và đó là quyết định chứ không
   *  phải chỗ trống: `GET /sales/mail/runs` trả về LÔ, mọi con số của nó nói về
   *  cả tệp người nhận; đường này trả lời "mình đã viết cho NGƯỜI NÀY mấy lần",
   *  nên nó đứng cạnh hồ sơ của người đó và ăn cùng ba trục quyền.
   *
   *  `lead.xem` chứ không `chiến-dịch.xem`, cùng lý do: đây là dữ liệu của một
   *  lead, và một Sale mở hồ sơ khách của mình không cần quyền của phòng
   *  marketing để biết khách đã nhận thư nào. */
  @Get(':code/mail')
  @Need({ branch: 'Sales', permission: 'lead.xem', scoped: true })
  mail(@CurrentActor() who: Actor, @Param('code', zod(MaObject)) code: MaObject) {
    return this.leads.mailTimeline(who, code)
  }

  /** Dòng thời gian của một lead — `sales.touch`.
   *
   *  Đường thứ hai bên cạnh `:code/mail`, không thay nó: cái kia trả lời "mình
   *  đã viết cho người này mấy lần", cái này trả lời "chuyện gì đã xảy ra với
   *  khách này". Lý do đầy đủ ở `LeadService.touches`.
   *
   *  `lead.xem` chứ không `ghi-vết.xem` — cùng lý lẽ mà `:code/mail` đã dùng:
   *  đây là dữ liệu CỦA MỘT LEAD, và một Sale mở hồ sơ khách của mình không cần
   *  quyền của quản trị để đọc lịch sử chính khách đó. `ghi-vết.xem` là để đọc
   *  `platform.audit`, một câu hỏi khác của một người khác. */
  @Get(':code/touches')
  @Need({ branch: 'Sales', permission: 'lead.xem', scoped: true })
  touches(@CurrentActor() who: Actor, @Param('code', zod(MaObject)) code: MaObject) {
    return this.leads.touches(who, code)
  }

  // ── Cuộc họp · bốn cửa dưới `:code` ─────────────────────────────────────
  //
  // Cả bốn nằm dưới `:code` chứ không dưới một `@Controller('sales/meetings')`
  // riêng, và lý do là trục phạm vi: `@Need` là metadata TĨNH, nên một cửa
  // `/sales/meetings/:id` phải đọc dữ liệu rồi mới biết cắt theo phạm vi của
  // ai — tức quyền quyết định sau khi đã đọc. Có `:code` trên đường thì trục ấy
  // có mặt trước, và `MeetingService.mine()` chỉ còn phải xác nhận buổi họp
  // đúng là của lead đó (404 nếu không, không phải 403: người gọi không được
  // biết buổi họp ấy có tồn tại ở lead nào khác hay không).
  //
  // Đọc đòi `lead.xem`, ghi đòi `lead.sửa` — cùng cặp mà hồ sơ lead đang dùng.
  // Ghi một buổi họp vào lead của người khác LÀ sửa hồ sơ người khác, nên trục
  // phạm vi bật ở cả bốn.

  @Get(':code/meetings')
  @Need({ branch: 'Sales', permission: 'lead.xem', scoped: true })
  meetings(@CurrentActor() who: Actor, @Param('code', zod(MaObject)) code: MaObject) {
    return this.leads.meetingList(who, code)
  }

  /** 201 kèm nguyên dòng buổi họp — kể cả cờ `isFirst`, thứ người gọi KHÔNG tự
   *  suy được: nó là thuộc tính của cả tập, và một buổi ghi bù có thể vừa cướp
   *  ngôi của buổi đang giữ. */
  @Post(':code/meetings')
  @Need({ branch: 'Sales', permission: 'lead.sửa', scoped: true })
  meetingAdd(
    @CurrentActor() who: Actor,
    @Param('code', zod(MaObject)) code: MaObject,
    @Body(zod(MeetingCreate)) body: MeetingCreate,
  ) {
    return this.leads.meetingAdd(who, code, body)
  }

  @Patch(':code/meetings/:id')
  @Need({ branch: 'Sales', permission: 'lead.sửa', scoped: true })
  meetingEdit(
    @CurrentActor() who: Actor,
    @Param('code', zod(MaObject)) code: MaObject,
    @Param('id', zod(MeetingId)) id: MeetingId,
    @Body(zod(MeetingPatch)) body: MeetingPatch,
  ) {
    return this.leads.meetingEdit(who, code, id, body)
  }

  /** 204: xoá xong thì không còn gì để trả, và một thân rỗng kèm 200 là hai
   *  cách nói cùng một chuyện. */
  @Delete(':code/meetings/:id')
  @HttpCode(204)
  @Need({ branch: 'Sales', permission: 'lead.sửa', scoped: true })
  meetingDrop(
    @CurrentActor() who: Actor,
    @Param('code', zod(MaObject)) code: MaObject,
    @Param('id', zod(MeetingId)) id: MeetingId,
  ) {
    return this.leads.meetingDrop(who, code, id)
  }

  /** Giao lead cho một người, hoặc trả về kho chung. Trả nguyên dòng sổ.
   *
   *  ------------------------------------------------------------------
   *  KHAI `lead.sửa`, KHÔNG KHAI `lead.giao` — VÀ KHÔNG BẬT `scoped`
   *  ------------------------------------------------------------------
   *  Hai chỗ lệch với phần còn lại của file này, cùng một lý do: luật của cửa
   *  này ĐỌC dữ liệu mới quyết được, mà `@Need` là metadata TĨNH.
   *
   *   · `lead.giao` là quyền GIAO CHO NGƯỜI KHÁC, và Sale không có nó. Khai ở
   *     đây thì Sale mất luôn quyền tự nhận một lead chưa ai giữ — việc chẳng
   *     lấy của ai cái gì. Nên cổng tĩnh dừng ở `lead.sửa`, còn phép so
   *     "giao hay nhận" nằm ở `LeadWriteService.setOwner`, chỗ đã cầm trên tay
   *     `owner_id` hiện tại.
   *   · `scoped: true` cắt theo `owner_id = mình`, mà lead trong kho chung có
   *     `owner_id IS NULL` — bật lên là không ai nhận được gì từ kho chung.
   *
   *  Thân bài nói TRỌN trạng thái mới của `owner_id` — trường bắt buộc và
   *  nullable — nên gọi lại lần hai để lead y nguyên chỗ lần một đặt nó. Đó là
   *  ngữ nghĩa của `PUT` trên động từ `PATCH`, và động từ mới là phần cố ý:
   *  `apps/web/src/app/api/client.ts` mới chở ba động từ ghi, thêm động từ thứ
   *  tư mà quên `enableCors` trong `main.ts` là mọi lượt gọi chết ở preflight
   *  không để lại dòng log nào — chính cái bẫy file đó đã ghi lại. */
  @Patch(':code/owner')
  @Need({ branch: 'Sales', permission: 'lead.sửa' })
  setOwner(
    @CurrentActor() who: Actor,
    @Param('code', zod(MaObject)) code: MaObject,
    @Body(zod(LeadOwnerWrite)) body: LeadOwnerWrite,
  ) {
    return this.write.setOwner(who, code, body)
  }

  /** Correct one lead's profile — the save button of the detail screen's card.
   *
   *  Declared AFTER `:code/owner` and `:code/meetings/:id` so a reader meets the
   *  narrow paths before the wide one. The router does not need that order — it
   *  already prefers a static segment over a parameter, the same reason written
   *  out on `@Get(':code')`.
   *
   *  `scoped: true` here while the two write doors beside it declare no scope
   *  axis at all, and the difference is real rather than an omission: `setOwner`
   *  ignores the axis on purpose because it CHANGES who holds the lead, while
   *  this door changes nobody's custody — so "you may correct exactly the leads
   *  you may open" holds for the whole call. The comparison itself lives in
   *  `LeadWriteService.patch`, which has `inScope` in hand, exactly as
   *  `@Get(':code')` declares the axis and leaves the verdict to its service. */
  @Patch(':code')
  @Need({ branch: 'Sales', permission: 'lead.sửa', scoped: true })
  patch(
    @CurrentActor() who: Actor,
    @Param('code', zod(MaObject)) code: MaObject,
    @Body(zod(LeadPatch)) body: LeadPatch,
  ) {
    return this.write.patch(who, code, body)
  }

  /** Một lead, gõ tay. 201 kèm nguyên dòng sổ — màn chèn được ngay, không phải
   *  gọi lần thứ hai, và người gõ thấy luôn giá trị đã được chuẩn hoá. */
  @Post()
  @Need({ branch: 'Sales', permission: 'lead.sửa' })
  create(@CurrentActor() who: Actor, @Body(zod(LeadCreate)) body: LeadCreate) {
    return this.write.create(who, body)
  }

  /** Chạy thử. KHÔNG ghi gì — kể cả một con số của dãy mã. */
  @Post('import/preview')
  @HttpCode(200)
  @Need({ branch: 'Sales', permission: 'lead.sửa' })
  preview(@Body(zod(LeadImportBody)) body: LeadImportBody) {
    return this.write.preview(body)
  }

  /** Nạp thật. Cả lô vào hết hoặc không dòng nào vào. */
  @Post('import')
  @Need({ branch: 'Sales', permission: 'lead.sửa' })
  import(@CurrentActor() who: Actor, @Body(zod(LeadImportBody)) body: LeadImportBody) {
    return this.write.commit(who, body)
  }
}
