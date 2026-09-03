import { Inject, Injectable } from '@nestjs/common'
import type { AccessControl, Actor } from '@pv/engines'
import {
  LeadBookResponse,
  LeadFacets,
  LeadMailEventsResponse,
  LeadMailTimelineResponse,
  LeadProfile,
  LeadScorecard,
  type ContactCreate,
  type ContactListResponse,
  type ContactPatch,
  type ContactRow,
  type LeadAccountAttach,
  type LeadBookQuery,
  type MaObject,
  type MailRunId,
  type MeetingCreate,
  type MeetingListResponse,
  type MeetingPatch,
  type MeetingRow,
  type TouchTimelineResponse,
} from '@pv/contracts'
import { ACCESS } from '@api/platform/engines/tokens'
import { denied, notFound } from '@api/platform/http/problem'
import { AccountService } from '../account/account.service'
import { ContactService } from '../contact/contact.service'
import { MeetingService } from '../meeting/meeting.service'
import { TouchService } from '../touch/touch.service'
import { toContract, toMailEvent, toMailTimeline, toProfile, toRef } from './lead.mapper'
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
    private readonly touch: TouchService,
    private readonly meetings: MeetingService,
    private readonly contacts: ContactService,
    private readonly accounts: AccountService,
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

  /** Nửa "không chiến dịch" của ô lọc Nguồn — `GET /sales/leads/facets`. Đọc
   *  docblock `LeadFacets` (`@pv/contracts`) trước khi đụng vào chỗ này.
   *
   *  KHÔNG chạy `access.visible()` lần hai như `book()`: lưới đó xét TỪNG lead
   *  qua `ref.owner`, còn đây là một danh sách đã DISTINCT — không còn một
   *  lead nào để gắn `ref` mà xét lại. Hàng rào duy nhất là `scopeOf()` trong
   *  SQL, đúng hàng rào `book()` dùng để cắt xuống cùng một tập lead. */
  async facets(who: Actor): Promise<LeadFacets> {
    return LeadFacets.parse({ sourceKinds: await this.repo.sourceKindFacets(who) })
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

  /** `GET /sales/leads/:code/mail/:runId/events` — the detail panel behind one
   *  row of `mailTimeline`. Same guard, same two refusals, same reasoning as
   *  `mailTimeline` above; an empty list here is a real answer too (nobody has
   *  opened, clicked or replied to this run yet), so it cannot also stand in
   *  for "no such lead" or "not yours". */
  async mailEvents(who: Actor, code: MaObject, runId: MailRunId): Promise<LeadMailEventsResponse> {
    const found = await this.repo.byCode(who, code)
    if (!found) throw notFound('lead', code)

    if (!found.inScope) {
      throw denied('out-of-scope', `Lead ${code} không đứng tên bạn — hỏi người đang giữ nó.`)
    }

    const rows = await this.repo.mailEvents(code, runId)
    return LeadMailEventsResponse.parse({ rows: rows.map(toMailEvent) })
  }

  /** `GET /sales/leads/:code/touches` — what has happened to this customer.
   *
   *  ------------------------------------------------------------------
   *  A SECOND TIMELINE BESIDE `mailTimeline`, NOT A REPLACEMENT FOR IT
   *  ------------------------------------------------------------------
   *  The two answer different questions and neither subsumes the other. The
   *  mail timeline is one row per BATCH the lead was written into, carrying
   *  open and click counts that only `platform.mail_event` knows. This one is
   *  one row per THING SOMEBODY DID — the lead entered the book, it was
   *  promoted, a contract was signed — facts no delivery ledger can hold.
   *
   *  Writing a `cham` touch per delivery would put the same fact in two tables
   *  that then disagree the first moment a queued letter fails to send: the
   *  ledger would know, the timeline would not. Two streams, two questions, and
   *  a screen free to draw them side by side.
   *
   *  Same two refusals, in the same order, for the reason spelled out on
   *  `mailTimeline` above: an empty list is a REAL answer here — most leads
   *  have exactly one row — so it cannot also mean "no such lead" or "not
   *  yours" without answering three questions at once. */
  async touches(who: Actor, code: MaObject): Promise<TouchTimelineResponse> {
    const found = await this.repo.byCode(who, code)
    if (!found) throw notFound('lead', code)

    if (!found.inScope) {
      throw denied('out-of-scope', `Lead ${code} không đứng tên bạn — hỏi người đang giữ nó.`)
    }

    return this.touch.timeline(code)
  }

  // ── Cuộc họp · bốn cửa, một hàng rào ────────────────────────────────────
  //
  // Cả bốn mở đầu bằng đúng `guard()` bên dưới, và đó là lý do `MeetingService`
  // không biết gì về quyền: câu "lead này có thật không, có đứng tên bạn không"
  // được hỏi MỘT lần, ở đây, đúng như `touches` và `mailTimeline` đã làm.
  //
  // Hai cửa ghi đòi `lead.sửa`, khai trên controller. Trục phạm vi vẫn bật ở cả
  // bốn: ghi một buổi họp vào lead của người khác là sửa hồ sơ của người khác.

  async meetingList(who: Actor, code: MaObject): Promise<MeetingListResponse> {
    await this.guard(who, code)
    return this.meetings.timeline(code)
  }

  async meetingAdd(who: Actor, code: MaObject, body: MeetingCreate): Promise<MeetingRow> {
    await this.guard(who, code)
    return this.meetings.record(who, code, body)
  }

  async meetingEdit(
    who: Actor,
    code: MaObject,
    id: string,
    body: MeetingPatch,
  ): Promise<MeetingRow> {
    await this.guard(who, code)
    return this.meetings.amend(code, id, body)
  }

  async meetingDrop(who: Actor, code: MaObject, id: string): Promise<void> {
    await this.guard(who, code)
    await this.meetings.drop(code, id)
  }

  // ── Contacts · five doors, TWO shapes of path ───────────────────────────
  //
  // The first two go through the lead's `:code` and reuse `guard()` exactly as
  // the meeting doors do. The other three address a `CT-…` code, so the scope
  // axis has to be resolved one hop further: read the contact to learn which
  // lead it hangs off, THEN guard. That price is deliberate and is written down
  // at `packages/contracts/src/sales/contact.ts` — a contact is a first-class
  // object with a code people read out loud, so it gets a path of its own.
  //
  // NO new permission: a contact is part of a lead's profile, so reading one
  // takes the lead READ permission and touching one takes the lead WRITE one.

  async contactList(who: Actor, code: MaObject): Promise<ContactListResponse> {
    await this.guard(who, code)
    return this.contacts.list(code)
  }

  async contactAdd(who: Actor, code: MaObject, body: ContactCreate): Promise<ContactRow> {
    await this.guard(who, code)
    return this.contacts.add(who, code, body)
  }

  async contactEdit(who: Actor, code: MaObject, body: ContactPatch): Promise<ContactRow> {
    const leadCode = await this.guardByContact(who, code)
    return this.contacts.edit(leadCode, code, body)
  }

  async contactDrop(who: Actor, code: MaObject): Promise<void> {
    const leadCode = await this.guardByContact(who, code)
    await this.contacts.drop(leadCode, code)
  }

  async contactPrimary(who: Actor, code: MaObject): Promise<ContactRow> {
    const leadCode = await this.guardByContact(who, code)
    return this.contacts.setPrimary(leadCode, code)
  }

  /** Attach a lead to a company, or detach it.
   *  `PATCH /sales/leads/:code/account`.
   *
   *  The lead WRITE permission rather than the company one, and the scope axis
   *  is ON: what changes is a lead row — no company row is touched. Somebody
   *  who may edit their own lead may also say which company it belongs to;
   *  demanding the company-book permission here would send a Sale to ask for a
   *  department-wide grant in order to fix one cell on their own profile. */
  async attachAccount(who: Actor, code: MaObject, body: LeadAccountAttach): Promise<void> {
    await this.guard(who, code)
    await this.accounts.attachLead(code, body.accountCode)
  }

  /** Thẻ điểm Sổ lead. `GET /sales/leads/scorecard`.
   *
   *  KHÔNG cắt theo phạm vi, và đó là quyết định chứ không phải sót: thẻ điểm
   *  là điểm của CẢ KỲ, tức của cả phòng. Cắt nó theo lead ai đang giữ thì mỗi
   *  người mở màn thấy một con số khác nhau dưới cùng một dòng chữ "Thẻ điểm
   *  10/08 → 28/08" — và không con số nào trong đó là con số người ta định
   *  hỏi. Cửa vẫn đòi `lead.xem`; ai không được vào sổ thì cũng không thấy thẻ.
   *
   *  Bốn con số ĐẾM, không phải tỉ lệ — xem `LeadScorecard`. */
  async scorecard(): Promise<LeadScorecard> {
    return LeadScorecard.parse(await this.repo.scorecard())
  }

  /** Lead có thật, và người này được đọc nó. Hai câu, một chỗ.
   *
   *  Rút ra thành hàm sau khi cửa thứ tư lặp lại đúng sáu dòng này — bốn bản
   *  sao của một câu 403 là bốn chỗ để câu đó trôi khỏi nhau. `profile`,
   *  `mailTimeline` và `touches` giữ nguyên bản của chúng: đổi cả ba trong
   *  cùng lượt này là trộn một đợt dựng tính năng với một đợt dọn dẹp, và
   *  người review sẽ phải đọc cả hai cùng lúc. */
  private async guard(who: Actor, code: MaObject): Promise<void> {
    const found = await this.repo.byCode(who, code)
    if (!found) throw notFound('lead', code)

    if (!found.inScope) {
      throw denied('out-of-scope', `Lead ${code} không đứng tên bạn — hỏi người đang giữ nó.`)
    }
  }

  /** The same fence, entered from a CONTACT code.
   *
   *  The three `CT-…` doors carry no lead code on the path, so `@Need` cannot
   *  see the scope axis and the service has to resolve it: read the contact to
   *  learn which lead it belongs to, then guard that lead.
   *
   *  A code that DOES NOT EXIST and a code belonging to somebody else's lead
   *  both come back as the same 404, and that is not laziness: `guard()` above
   *  throws 403 for an out-of-scope lead because by then the caller has typed
   *  the lead code themselves — they already know it exists. Here they do not,
   *  so telling the two apart would tell the caller that `CT-0412` is real on a
   *  lead they may not read, leaking exactly what the scope axis is hiding.
   *
   *  Returns the lead code because all three callers need it immediately after:
   *  `ContactService` takes `leadCode` and re-checks it, and that second check
   *  is what keeps that service correct even if a fourth door ever forgets to
   *  call this fence. */
  private async guardByContact(who: Actor, code: MaObject): Promise<MaObject> {
    const leadCode = await this.contacts.leadOf(code)
    if (leadCode === null) throw notFound('người liên hệ', code)

    const found = await this.repo.byCode(who, leadCode)
    if (!found || !found.inScope) throw notFound('người liên hệ', code)

    return leadCode
  }
}
