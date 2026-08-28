import { Inject, Injectable } from '@nestjs/common'
import type { AccessControl, Actor } from '@pv/engines'
import {
  LeadBookResponse,
  LeadMailTimelineResponse,
  LeadProfile,
  type LeadBookQuery,
  type MaObject,
} from '@pv/contracts'
import { ACCESS } from '@api/platform/engines/tokens'
import { denied, notFound } from '@api/platform/http/problem'
import { toContract, toMailTimeline, toProfile, toRef } from './lead.mapper'
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
      rows: visible.map((v) => toContract(v)),
      total: page.total,
      hidden: page.hidden + hidden,
    })
  }

  /** Hồ sơ một lead. Ba cách hỏng, và chúng KHÔNG gộp được vào nhau.
   *
   *  ------------------------------------------------------------------
   *  404 IS "NO SUCH LEAD", 403 IS "NOT YOURS", AND THE SCREEN NEEDS BOTH
   *  ------------------------------------------------------------------
   *  The book answers a caller who is out of scope by showing fewer rows and
   *  reporting `hidden`. A profile has exactly one row, so there is nothing to
   *  thin out: it either hands the lead over or refuses. The refusal has to
   *  name the right reason, because the four reasons are four different next
   *  steps for the person reading the screen (`docs/tich-hop-be.md`):
   *
   *    404 `not-found`         mã gõ sai, hoặc lead chưa từng có
   *    403 `out-of-scope`      CÓ quyền `lead.xem`, dòng này không của mình
   *    403 `permission-denied` vai không có `lead.xem` — `AccessGuard` đã chặn
   *
   *  Collapsing the middle one into 404 is the tempting move ("don't confirm
   *  the row exists"), and it is wrong here: the caller already holds a code
   *  they got from OUR book or from a colleague, so 404 hides nothing and
   *  sends them hunting for a row that is sitting right there. Collapsing it
   *  into `permission-denied` is worse — it tells a Sale their role cannot read
   *  leads, when their role reads leads all day. The one answer that leads
   *  anywhere useful is "ask whoever holds it".
   *
   *  ------------------------------------------------------------------
   *  ONE FENCE HERE, NOT TWO — AND THAT IS DELIBERATE
   *  ------------------------------------------------------------------
   *  `book()` above runs `E2.visible()` as a second net behind the SQL filter.
   *  A second net on this path would be dead code, not safety: E2's scope axis
   *  still compares `ref.owner` against `actor.name` (debt #2), which is a
   *  WEAKER test than the `owner_id = actor.id` the query just performed — it
   *  can never refuse a row the id comparison let through. Adding a check that
   *  cannot fire is how a reader learns to trust a fence that is not holding
   *  anything. When E2 compares by id, this is the place to hang it. */
  async profile(who: Actor, code: MaObject): Promise<LeadProfile> {
    const found = await this.repo.byCode(who, code)
    if (!found) throw notFound('lead', code)

    if (!found.inScope) {
      throw denied('out-of-scope', `Lead ${code} không đứng tên bạn — hỏi người đang giữ nó.`)
    }

    /* Cùng lý do với `book()`: kiểm chính dữ liệu mình trả ra bằng hợp đồng.
       Một cột đổi kiểu, một trường quên map — cả hai lọt qua `tsc` nếu mapper
       sai theo, không lọt qua đây. Một dòng thì giá bằng không. */
    return LeadProfile.parse(toProfile(found))
  }

  /** Every batch this lead was posted in. `GET /sales/leads/:code/mail`.
   *
   *  ------------------------------------------------------------------
   *  THE SAME TWO REFUSALS AS THE PROFILE, AND FOR THE SAME REASONS
   *  ------------------------------------------------------------------
   *  This reads `byCode()` first and lets 404/403 happen there, rather than
   *  running the timeline query and letting an empty list stand in for both.
   *  An empty timeline is a REAL answer — most leads have never been mailed —
   *  so it cannot also mean "no such lead" or "not yours" without becoming the
   *  answer to three questions at once. The full argument is on `profile()`
   *  above; this endpoint inherits it because it is the same row, asked a
   *  narrower question.
   *
   *  It costs one extra query on a screen that is already loading the profile.
   *  The alternative — filtering the timeline by `owner_id` — would hand a
   *  Sale looking at somebody else's lead a blank card that reads "chưa gửi lá
   *  thư nào", and blank is exactly what a leak looks like when it is doing
   *  its job, so nobody would ever notice it was the wrong answer.
   *
   *  ------------------------------------------------------------------
   *  NO PAGING, DELIBERATELY
   *  ------------------------------------------------------------------
   *  `LeadMailTimelineResponse` is not `paged()`: the list is bounded by how
   *  many campaigns one lead has been in, and a timeline that hides its own
   *  tail behind "load more" lies about how often we have written to this
   *  person — which is the one question a timeline exists to answer before
   *  somebody writes to them again. */
  async mailTimeline(who: Actor, code: MaObject): Promise<LeadMailTimelineResponse> {
    const found = await this.repo.byCode(who, code)
    if (!found) throw notFound('lead', code)

    if (!found.inScope) {
      throw denied('out-of-scope', `Lead ${code} không đứng tên bạn — hỏi người đang giữ nó.`)
    }

    const rows = await this.repo.mailTimeline(code)

    return LeadMailTimelineResponse.parse({ rows: rows.map(toMailTimeline) })
  }
}
