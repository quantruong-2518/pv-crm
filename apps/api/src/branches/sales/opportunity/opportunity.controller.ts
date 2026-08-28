import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import { MaObject, OpportunityCreate, OpportunityUpdate, PageQuery } from '@pv/contracts'
import { Need } from '@api/platform/access/need.decorator'
import { zod } from '@api/platform/http/zod.pipe'
import { CurrentActor } from '@api/platform/session/current-actor.decorator'
import { OpportunityService } from './opportunity.service'

/** `/sales/ops` — sổ cơ hội, module 3 của nhánh Sales.
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
 *  tiếp đời của nó ở `/sales/ops/:code` chứ không dưới lead. Một tài nguyên thì
 *  một gốc. */
@Controller('sales/ops')
export class OpportunityController {
  constructor(private readonly ops: OpportunityService) {}

  @Get()
  @Need({ branch: 'Sales', permission: 'cơ-hội.xem', scoped: true })
  book(@CurrentActor() who: Actor, @Query(zod(PageQuery)) q: PageQuery) {
    return this.ops.book(who, q)
  }

  /** Hồ sơ một đơn.
   *
   *  Khai SAU `@Get()` và cùng ba trục quyền y hệt. `MaObject` là hàng rào thứ
   *  nhất: mã sai dạng chết ở `ZodPipe` với một 400 gọi tên ô, không đi tới câu
   *  truy vấn. Hàng rào thứ hai — có đơn đó không, có phải của người này không
   *  — là việc của service, vì nó cần dữ liệu mới trả lời được. */
  @Get(':code')
  @Need({ branch: 'Sales', permission: 'cơ-hội.xem', scoped: true })
  profile(@CurrentActor() who: Actor, @Param('code', zod(MaObject)) code: MaObject) {
    return this.ops.profile(who, code)
  }

  /** Đổi một lead thành cơ hội. 201 kèm nguyên dòng sổ — màn chèn được ngay,
   *  không phải gọi lần thứ hai, và người điền thấy luôn mã hệ vừa cấp. */
  @Post()
  @Need({ branch: 'Sales', permission: 'cơ-hội.sửa' })
  create(@Body(zod(OpportunityCreate)) body: OpportunityCreate) {
    return this.ops.create(body)
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
}
