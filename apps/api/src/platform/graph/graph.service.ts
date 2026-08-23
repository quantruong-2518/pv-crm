import { Inject, Injectable } from '@nestjs/common'
import { createObjectGraph, type AccessControl, type Actor, type ObjectRef } from '@pv/engines'
import { ACCESS } from '../engines/tokens'
import { GraphRepository } from './graph.repository'

/** E1 · đồ thị object, ở phía máy chủ.
 *
 *  Ba dòng của `story()` là toàn bộ lời hứa "engine dùng lại được ở backend"
 *  được kiểm chứng: nạp bằng CTE, rồi gọi ĐÚNG hàm mà `apps/web` đang gọi,
 *  không sửa một ký tự nào trong `packages/engines`.
 *
 *  Lưu ý: KHÔNG có singleton `ObjectGraph` sống suốt tiến trình. Đồ thị được
 *  dựng cho từng lần hỏi, trên đúng vùng lân cận vừa nạp — đó là lý do
 *  `platform/engines/tokens.ts` không có token cho E1. */
@Injectable()
export class GraphService {
  constructor(
    private readonly repo: GraphRepository,
    @Inject(ACCESS) private readonly access: AccessControl,
  ) {}

  async story(code: string): Promise<ObjectRef[]> {
    const { objects, edges } = await this.repo.neighbourhood(code)
    return createObjectGraph(objects, edges).story(code)
  }

  /** Chuỗi đã lọc theo quyền của người đang xem.
   *
   *  ContextRail hiện chuỗi này, và chuỗi đó đi XUYÊN nhánh — một Sale mở hồ
   *  sơ lead có thể chạm tới work order của nhánh Factory mà công ty chưa mua.
   *
   *  Lọc bằng `access.visible()` của E2, KHÔNG tự viết lại phép so. Bản nháp
   *  trước của hàm này tự lọc bằng `who.branches.includes(...)` — đọc thì
   *  giống, nhưng nó bỏ mất trục phạm vi (`ownOnly`) và nó là một bản fork của
   *  ma trận quyền. Fork ở đây nghĩa là hai đầu dây kiểm quyền theo hai luật
   *  khác nhau, tức đúng thứ cả kiến trúc này dựng ra để chặn. */
  async storyFor(who: Actor, code: string): Promise<{ chain: ObjectRef[]; hidden: number }> {
    const chain = await this.story(code)

    /* E2 nhận `{ ref }[]`, `story()` trả `ObjectRef[]` — chênh đúng một lớp vỏ.
       Bọc ở chỗ gọi, không nới chữ ký của engine cho tiện một chỗ. */
    const { visible, hidden } = this.access.visible(
      who,
      chain.map((ref) => ({ ref })),
    )
    return { chain: visible.map((v) => v.ref), hidden }
  }
}
