import { Inject, Injectable } from '@nestjs/common'
import type { AccessControl, Actor } from '@pv/engines'
import { LeadBookResponse, type LeadBookQuery } from '@pv/contracts'
import { ACCESS } from '@api/platform/engines/tokens'
import { toContract, toRef } from './lead.mapper'
import { LeadRepository } from './lead.repository'

/** Sổ lead — nơi DUY NHẤT biết cả repository lẫn engine.
 *
 *  ------------------------------------------------------------------
 *  LUẬT CHỊU LỰC CỦA CẢ apps/api NẰM Ở BA DÒNG CỦA HÀM `book`
 *  ------------------------------------------------------------------
 *  · repository `async`  — vào ra dữ liệu;
 *  · engine `sync`       — quyết định, không chạm database, không chạm HTTP;
 *  · service            — chỗ duy nhất nối hai thứ đó.
 *
 *  Giữ đúng ranh giới này là điều kiện để E1/E2 chạy được ở CẢ HAI đầu. Nếu
 *  engine tự đi truy vấn thì `check()` và `story()` phải trả `Promise`, và mọi
 *  màn bên `apps/web` gãy theo — mất đúng thứ đang là tài sản lớn nhất của
 *  repo. Engine nhận dữ liệu đã nạp, luôn luôn. */
@Injectable()
export class LeadService {
  constructor(
    private readonly repo: LeadRepository,
    @Inject(ACCESS) private readonly access: AccessControl,
  ) {}

  async book(who: Actor, q: LeadBookQuery): Promise<LeadBookResponse> {
    const page = await this.repo.book(who, q, true)

    /* Lưới thứ hai. SQL đã cắt theo phạm vi rồi, nên bình thường E2 không cắt
       thêm gì — và đó là điều đúng: hai hàng rào đọc CÙNG một trục, hàng rào
       trong chỉ có việc khi hàng rào ngoài bị viết sai. Bỏ nó đi thì ngày ai
       đó thêm một endpoint quên `scoped: true`, không còn gì đỡ. */
    const items = page.rows.map((r) => ({ ...r, ref: toRef(r.row, r.ownerName) }))
    const { visible, hidden } = this.access.visible(who, items)

    /* Kiểm chính dữ liệu MÌNH trả ra bằng hợp đồng.
       Một cột đổi kiểu trong bảng, một trường quên map — cả hai lọt qua `tsc`
       nếu mapper cũng sai theo, nhưng không lọt qua đây. Giá phải trả bị chặn
       trên bởi `size` tối đa 200 dòng. */
    return LeadBookResponse.parse({
      rows: visible.map((v) => toContract(v.row)),
      total: page.total,
      hidden: page.hidden + hidden,
    })
  }
}
