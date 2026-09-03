import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  ContractSign,
  MaObject,
  OpportunityBookQuery,
  OpportunityCreate,
  OpportunityImportBody,
  OpportunityLiveDealQuery,
  OpportunityStageMove,
  OpportunityUpdate,
} from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { CurrentActor } from '@api/platform/session/current-actor.decorator'
import { OpportunityService } from './opportunity.service'

/** `/sales/opportunities` — sổ cơ hội, module 3 của nhánh Sales.
 *
 *  Controller mỏng có chủ ý: nhận, kiểm, gọi, trả. Không `if` nghiệp vụ, không
 *  SQL, không `req`/`res` — mọi thứ đáng đọc nằm ở mấy dòng khai báo.
 *
 *  ------------------------------------------------------------------
 *  HAI QUYỀN, VÀ CỬA GHI KHÔNG DÙNG `cơ-hội.chốt`
 *  ------------------------------------------------------------------
 *  Đọc sổ và đọc một đơn cùng đòi `cơ-hội.xem`, cùng `scoped: true` — người chỉ
 *  thấy đơn của mình thì thấy đúng đơn của mình, và khác biệt giữa hai endpoint
 *  nằm ở chỗ service LÀM GÌ với phán quyết đó, không nằm ở dòng khai.
 *
 *  Cửa ghi đòi `cơ-hội.sửa`, KHÔNG phải `cơ-hội.chốt`. Ba quyền của sổ này chia
 *  theo mức độ không lùi được: xem là đọc, sửa là mở một đơn và động vào nó,
 *  chốt là ký — và ký là thứ đi ra khỏi phòng kinh doanh. Đổi một lead thành cơ
 *  hội thì rút lại được bằng cách đóng đơn; nó thuộc nhóm giữa. Gộp nó vào
 *  `cơ-hội.chốt` nghĩa là muốn cho một BD mở đơn thì phải cho họ luôn quyền ký.
 *
 *  ------------------------------------------------------------------
 *  `POST` NHẬN `leadCode` TRONG THÂN, KHÔNG PHẢI TRONG ĐƯỜNG DẪN
 *  ------------------------------------------------------------------
 *  `POST /sales/leads/:code/opportunities` đọc cũng xuôi, và nó nói sai một
 *  điều: nó dựng cơ hội thành tài nguyên CON của lead. Quan hệ thật nằm ở cột
 *  `lead_code` của chính bảng cơ hội, một lead sinh được nhiều đơn, và đơn sống
 *  tiếp đời của nó ở `/sales/opportunities/:code` chứ không dưới lead. Một tài
 *  nguyên thì một gốc. */
@Controller('sales/opportunities')
export class OpportunityController {
  constructor(private readonly ops: OpportunityService) {}

  @Get()
  @Need({ branch: 'Sales', permission: 'cơ-hội.xem', scoped: true })
  book(@CurrentActor() who: Actor, @Query(zod(OpportunityBookQuery)) q: OpportunityBookQuery) {
    return this.ops.book(who, q)
  }

  /** Thẻ điểm cả sổ — sáu con số ĐẾM, màn tự chia thành tỉ lệ và tự in tiền.
   *
   *  PHẢI đứng trước `@Get(':code')`, và đây là một luật của bộ định tuyến chứ
   *  không phải thẩm mỹ: Fastify khớp theo thứ tự khai, nên nếu `:code` khai
   *  trước thì chuỗi `scorecard` rơi vào nó và chết ở `zod(MaObject)` bằng một
   *  400 nói "Mã object sai dạng" — đúng về mặt kỹ thuật và vô nghĩa với người
   *  đọc log. Sổ lead đã vấp đúng chỗ này và ghi lại ở `lead.controller.ts`.
   *
   *  KHÔNG `scoped`: đây là điểm của cả phòng, không của riêng ai. Xem
   *  `OpportunityService.scorecard` cho lập luận đầy đủ, và nó là lập luận đã
   *  chốt cho sổ lead chứ không phải một lựa chọn mới ở đây. */
  @Get('scorecard')
  @Need({ branch: 'Sales', permission: 'cơ-hội.xem' })
  scorecard() {
    return this.ops.scorecard()
  }

  /** The same open pipeline the scorecard totals, split across the five
   *  columns — what the overview draws its bar chart from.
   *
   *  Before `@Get(':code')` and NOT `scoped`, both for the reasons already
   *  written on `scorecard` right above: one board, one set of figures. */
  @Get('histogram')
  @Need({ branch: 'Sales', permission: 'cơ-hội.xem' })
  histogram() {
    return this.ops.histogram()
  }

  /** Chốt chặn trùng đơn — "lead này đã có đơn CÒN SỐNG chưa".
   *
   *  PHẢI đứng trước `@Get(':code')` vì cùng lý do `scorecard` ghi ở trên:
   *  Fastify khớp theo thứ tự khai, nên khai sau thì chuỗi `live-deal` rơi vào
   *  `:code` và chết ở `zod(MaObject)` bằng một 400 vô nghĩa.
   *
   *  KHÔNG `scoped`, và đó là TOÀN BỘ lý do cửa này tồn tại thay vì hồ sơ lead
   *  đi lọc cái sổ: một chốt chặn cắt theo phạm vi sẽ giấu đi đúng cái đơn nó
   *  cần tìm, rồi trả lời "chưa ai đổi lead này" cho người thứ hai và mời họ mở
   *  đơn trùng. Đánh đổi được trả bằng hình dữ liệu hẹp nhất có thể — một mã
   *  đơn hoặc `null`, không tên người, không tiền. Lập luận đầy đủ ở
   *  `OpportunityService.liveDeal` và ở `OpportunityLiveDeal` của hợp đồng.
   *
   *  `leadCode` đi trong query chứ không trong đường dẫn: tài nguyên của cửa
   *  này là cơ hội, lead chỉ là câu hỏi — cùng lý do `POST` nhận `leadCode`
   *  trong thân request (xem docblock đầu controller). */
  @Get('live-deal')
  @Need({ branch: 'Sales', permission: 'cơ-hội.xem' })
  liveDeal(@Query(zod(OpportunityLiveDealQuery)) q: OpportunityLiveDealQuery) {
    return this.ops.liveDeal(q.leadCode)
  }

  /** Hồ sơ một đơn.
   *
   *  Khai SAU `@Get()` và `@Get('scorecard')`, cùng ba trục quyền y hệt cửa sổ. `MaObject` là hàng rào thứ
   *  nhất: mã sai dạng chết ở `ZodPipe` với một 400 gọi tên ô, không đi tới câu
   *  truy vấn. Hàng rào thứ hai — có đơn đó không, có phải của người này không
   *  — là việc của service, vì nó cần dữ liệu mới trả lời được. */
  @Get(':code')
  @Need({ branch: 'Sales', permission: 'cơ-hội.xem', scoped: true })
  profile(@CurrentActor() who: Actor, @Param('code', zod(MaObject)) code: MaObject) {
    return this.ops.profile(who, code)
  }

  /** Dòng thời gian của một đơn — `sales.touch`.
   *
   *  Đứng ở đây chứ không ở một `@Controller('sales/touches')` dùng chung, và
   *  đó là quyết định chứ không phải chỗ trống: đường lần chạm của lead đòi
   *  `lead.xem`, đường này đòi `cơ-hội.xem`, mà `@Need` là metadata TĨNH trên
   *  một phương thức — không route nào khai được "quyền này nếu mã bắt đầu
   *  bằng LD, quyền kia nếu bắt đầu bằng OP". Lý do đầy đủ ở `touch.module.ts`.
   *
   *  `cơ-hội.xem` chứ không `ghi-vết.xem`: quyền kia là để đọc `platform.audit`
   *  — ai đã gọi đường nào — và đó là câu hỏi của người quản trị. Câu hỏi ở đây
   *  là "đơn của tôi đã đi qua những gì", và người bán mở hồ sơ đơn mình đứng
   *  tên không cần quyền của quản trị để đọc lịch sử chính đơn đó. */
  @Get(':code/touches')
  @Need({ branch: 'Sales', permission: 'cơ-hội.xem', scoped: true })
  touches(@CurrentActor() who: Actor, @Param('code', zod(MaObject)) code: MaObject) {
    return this.ops.touches(who, code)
  }

  /** Đổi một lead thành cơ hội. 201 kèm nguyên dòng sổ — màn chèn được ngay,
   *  không phải gọi lần thứ hai, và người điền thấy luôn mã hệ vừa cấp.
   *
   *  Nhận `@CurrentActor()` kể từ khi có `sales.touch`: dòng đầu tiên của một
   *  đơn phải ghi được ai mở nó. Docblock của `OpportunityService.create` nói
   *  đầy đủ vì sao tham số này từng KHÔNG có mặt và điều gì đã đổi. */
  @Post()
  @Need({ branch: 'Sales', permission: 'cơ-hội.sửa' })
  create(@CurrentActor() who: Actor, @Body(zod(OpportunityCreate)) body: OpportunityCreate) {
    return this.ops.create(who, body)
  }

  /** Chạy thử một lô nạp. KHÔNG ghi gì — kể cả một con số của dãy mã.
   *
   *  `@HttpCode(200)` vì 201 sẽ nói dối rằng có thứ gì đó vừa được tạo.
   *
   *  Đòi `cơ-hội.sửa` y như cửa nạp thật, và bản chạy thử KHÔNG được rẻ hơn:
   *  nó đọc cả sổ lead để trả lời "công ty này có trong sổ không" và "khách này
   *  đã có đơn đang mở chưa", mà hai câu trả lời đó đáng giá với người đang dò
   *  đúng bằng chính những dòng dữ liệu. Cùng lý lẽ mà lô nạp lead đã ghi. */
  @Post('import/preview')
  @HttpCode(200)
  @Need({ branch: 'Sales', permission: 'cơ-hội.sửa' })
  importPreview(@Body(zod(OpportunityImportBody)) body: OpportunityImportBody) {
    return this.ops.importPreview(body)
  }

  /** Nạp thật. Cả lô vào hết hoặc không đơn nào vào. */
  @Post('import')
  @Need({ branch: 'Sales', permission: 'cơ-hội.sửa' })
  import(
    @CurrentActor() who: Actor,
    @Body(zod(OpportunityImportBody)) body: OpportunityImportBody,
  ) {
    return this.ops.importCommit(who, body)
  }

  /** Ký — cửa DUY NHẤT làm một đơn thành `close-won`.
   *
   *  ------------------------------------------------------------------
   *  QUYỀN LÀ `cơ-hội.chốt`, VÀ ĐÂY LÀ ĐƯỜNG ĐẦU TIÊN DÙNG NÓ
   *  ------------------------------------------------------------------
   *  Quyền đó đã có trong E2 từ đầu, đã có test khoá ở `actors.test.ts`, và tới
   *  hôm nay chưa gác đường nào. Docblock ở đầu controller này đã vạch sẵn
   *  ranh giới: xem là đọc, sửa là mở một đơn và động vào nó, chốt là ký — và
   *  ký là thứ đi ra khỏi phòng kinh doanh. Đây là đường ranh giới đó được vẽ
   *  cho.
   *
   *  Hệ quả cụ thể: `presales` mở và sửa được đơn nhưng KHÔNG bấm được nút này,
   *  còn `sale` thì được. Đó đúng là hàng của hai vai trong `e2-access.ts`, và
   *  nếu nó sai thì chỗ sửa là ma trận vai, không phải dòng dưới đây.
   *
   *  `scoped: true` — ký được đơn của mình. Người `ownOnly` bấm nút này trên
   *  đơn người khác nhận 403 gọi tên phạm vi, không phải một 404 giả vờ đơn
   *  không tồn tại; service phân biệt được vì `byCode` chở `inScope` về cùng dữ
   *  liệu.
   *
   *  Tài nguyên con của đơn (`:code/contract`) chứ không phải `/sales/contracts`
   *  cấp một: một hợp đồng KHÔNG tồn tại độc lập — khoá ngoại ghép của nó neo
   *  vào đúng một cặp `(cơ hội, lead)`, và đường dẫn nói lại đúng điều đó. Ngày
   *  có màn đọc sổ hợp đồng thì `GET /sales/contracts` là một tài nguyên khác,
   *  với gốc của nó. */
  @Post(':code/contract')
  @Need({ branch: 'Sales', permission: 'cơ-hội.chốt', scoped: true })
  sign(
    @CurrentActor() who: Actor,
    @Param('code', zod(MaObject)) code: MaObject,
    @Body(zod(ContractSign)) body: ContractSign,
  ) {
    return this.ops.sign(who, code, body)
  }

  /** Lưu phiếu ở hồ sơ cơ hội.
   *
   *  `PATCH` chứ không `PUT`, và thân request vẫn chở CẢ bộ ô sửa được: động
   *  từ nói về TÀI NGUYÊN — cửa này sửa một phần của cơ hội, `lead_code` và mã
   *  thì không đụng tới — còn thân request nói về cái FORM. `PUT` ở đây sẽ hứa
   *  rằng gửi thiếu ô nào là xoá ô đó, mà cửa này không làm thế.
   *
   *  Cùng quyền với cửa tạo. Người mở được đơn thì sửa được đơn — tách hai
   *  quyền ra chỉ tạo ra một vai mở được đơn rồi không sửa nổi chính nó. */
  @Patch(':code')
  @Need({ branch: 'Sales', permission: 'cơ-hội.sửa', scoped: true })
  update(
    @CurrentActor() who: Actor,
    @Param('code', zod(MaObject)) code: MaObject,
    @Body(zod(OpportunityUpdate)) body: OpportunityUpdate,
  ) {
    return this.ops.update(who, code, body)
  }

  /** Drag a deal to another column — a board gesture, not a form save.
   *
   *  Same write permission as the door above, and the same scope axis. Two doors
   *  because they say two different things, not because they need two levels of
   *  trust — see the docblock on `OpportunityStageMove`.
   *
   *  Declaration order settles nothing here: `:code/stage` has a static segment
   *  after the dynamic one, so it cannot collide with bare `:code`, exactly as
   *  `:code/contract` already does. */
  @Patch(':code/stage')
  @Need({ branch: 'Sales', permission: 'cơ-hội.sửa', scoped: true })
  moveStage(
    @CurrentActor() who: Actor,
    @Param('code', zod(MaObject)) code: MaObject,
    @Body(zod(OpportunityStageMove)) body: OpportunityStageMove,
  ) {
    return this.ops.moveStage(who, code, body)
  }

  /** Which columns the deal has passed through, and how long it stood in each. */
  @Get(':code/stage-history')
  @Need({ branch: 'Sales', permission: 'cơ-hội.xem', scoped: true })
  stageHistory(@CurrentActor() who: Actor, @Param('code', zod(MaObject)) code: MaObject) {
    return this.ops.stageHistory(who, code)
  }
}
