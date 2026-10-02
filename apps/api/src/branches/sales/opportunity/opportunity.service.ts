import { Inject, Injectable } from '@nestjs/common'
import {
  AUDIENCE_INTERNAL,
  OPPORTUNITY_OPENED,
  pipelinePosition,
  plan,
  type AccessControl,
  type Actor,
  type RoleId,
  type Decidable,
  type ObjectRef,
} from '@pv/engines'
import {
  OpportunityBookResponse,
  OpportunityCreateResponse,
  OpportunityFacetsResponse,
  OpportunityProfileResponse,
  OpportunityStopReasons,
  OpportunityHistogram,
  OpportunityImportCommitResponse,
  OpportunityImportPreviewResponse,
  OpportunityLiveDeal,
  OpportunityScorecard,
  OpportunityStageHistory,
  OpportunityUpdateResponse,
  PipelinePositionView,
  StageKey,
  type ObjectCode,
  type OpportunityBookQuery,
  type OpportunityCreate,
  type OpportunityFacetsQuery,
  type OpportunityImportBody,
  type OpportunityUpdate,
  type TouchTimelineResponse,
} from '@pv/contracts'
import { ENV, type Env } from '@api/platform/config/env'
import type { Db } from '@api/platform/db/db.module'
import { ACCESS } from '@api/platform/engines/tokens'
import { conflict, denied, notFound } from '@api/platform/http/problem'
import { toChainLink } from '@api/platform/graph/graph.mapper'
import { GraphService } from '@api/platform/graph/graph.service'
import { ObjectMirror } from '@api/platform/graph/object-mirror'
import { ApprovalService } from '@api/platform/approval/approval.service'
import { MAIL_ENQUEUE, type MailEnqueue } from '@api/platform/mail/mail.contract'
import { ContractRepository, type ContractRead } from '../contract/contract.repository'
import { byOf, TouchService, type TouchEntry } from '../touch/touch.service'
import { WorkstreamRepository } from '../workstream/workstream.repository'
import { LEAD_GONE_WORDS, LeadStateWriter } from '../lead/lead-state'
import {
  editDetailsVerdict,
  editTermsVerdict,
  OpportunityActs,
  touchesTerms,
} from './opportunity-acts'
import { dealAtOf } from './opportunity-lifecycle'
import {
  pendingSignOf,
  profileContractsOf,
  signedTotalOf,
  stageSpansOf,
} from './opportunity-profile'
import { OpportunityFacetsRepository } from './opportunity-facets.repository'
import { OpportunityFacts } from './opportunity-facts'
import { checkBatch, fold, type ImportCheck } from './opportunity-import.check'
import { editTrail } from './opportunity-trail'
import { foreignLead, holds, OpportunityOpening } from './opportunity-opening.service'
import {
  actorRoles,
  assertHeld,
  assertSaleLaneKept,
  assertSellers,
  recordSaleLane,
  saleLaneChange,
} from './opportunity-owners'
import {
  fromCreate,
  fromUpdate,
  hasSellerOf,
  holderOf,
  daysInStageOf,
  NOTE,
  ownerRowsOf,
  productRowsOf,
  refOf,
  scopeRefOf,
  stageEventOf,
  toRef,
  toStageEvent,
  type RefOwner,
} from './opportunity.mapper'
import { OpportunityRepository, type OpportunityRead } from './opportunity.repository'
import type { OpportunityRowDb } from './opportunity.schema'
import { phasesOf, stageConfigOf } from '../ladder'

/** Module 3 · Sổ cơ hội — chỗ duy nhất biết cả repository lẫn engine.
 *
 *  Ba tầng, đúng ranh giới mà `lead.service.ts` dựng và vì đúng lý do đó:
 *  repository `async`, engine `sync`, service là chỗ duy nhất nối hai thứ.
 *  Engine nhận dữ liệu ĐÃ NẠP, luôn luôn — đó là điều kiện để E1/E2 chạy được
 *  ở cả máy chủ lẫn trình duyệt.
 *
 *  ------------------------------------------------------------------
 *  ĐỔI MỘT LEAD THÀNH CƠ HỘI LÀ MỘT ĐƠN VỊ CÔNG VIỆC, KHÔNG PHẢI BA
 *  ------------------------------------------------------------------
 *  Ba thứ phải cùng vào hoặc cùng không: dòng gương ở `platform.object`, dòng
 *  ở `sales.opportunity`, và các dòng ở `sales.opportunity_owner`. Nửa vời thì
 *  không có cách nào gỡ bằng tay — một đơn không người đứng tên trông y hệt một
 *  đơn ai đó cố tình để trống, còn một đơn không dòng gương thì mở ContextRail
 *  ra trống trơn mà không có gì đỏ (luật 10 gãy trong im lặng).
 *
 *  Thứ tự trong transaction: gương TRƯỚC. `sales.lead.code` có khoá ngoại về
 *  `platform.object` nên ở module lead Postgres ép thứ tự đó; `opportunity.code`
 *  thì CHƯA có khoá ngoại ấy, nên ở đây thứ tự là kỷ luật chứ không phải hàng
 *  rào. Ghi ra để người thêm cửa ghi thứ hai không phải đoán.
 *
 *  ------------------------------------------------------------------
 *  MÃ ĐƯỢC CẤP TRƯỚC KHI MỞ TRANSACTION
 *  ------------------------------------------------------------------
 *  `nextCode()` chạy trên pool. Hỏi nó trong lúc transaction của mình đang giữ
 *  một kết nối là một request chiếm hai kết nối — lý do đầy đủ ở chính hàm đó. */
@Injectable()
export class OpportunityService {
  constructor(
    private readonly repo: OpportunityRepository,
    private readonly contracts: ContractRepository,
    private readonly workstreams: WorkstreamRepository,
    private readonly touch: TouchService,
    private readonly mirror: ObjectMirror,
    /* E1's read half, beside the write half above — the pair `GraphModule`
       exports together so a branch that registers objects also walks them. */
    private readonly graph: GraphService,
    /* E3's durable half, asked one question by this module: what is still
       waiting on a deal. Applying `contract-sign` is `OpportunitySign`'s job. */
    private readonly approvals: ApprovalService,
    @Inject(ACCESS) private readonly access: AccessControl,
    @Inject(MAIL_ENQUEUE) private readonly mail: MailEnqueue,
    @Inject(ENV) private readonly env: Env,
    /* A deal opened on a lead converts it (ADR 0058), in the deal's own tx. */
    private readonly leadStates: LeadStateWriter,
    private readonly opening: OpportunityOpening,
    private readonly facts: OpportunityFacts,
    private readonly acts: OpportunityActs,
    private readonly facetsRepo: OpportunityFacetsRepository,
  ) {}

  async book(who: Actor, q: OpportunityBookQuery): Promise<OpportunityBookResponse> {
    const page = await this.repo.book(who, q, true)

    /* Lưới thứ hai. SQL đã cắt theo phạm vi, nên bình thường E2 không cắt thêm
       gì — và đó là điều đúng: hai hàng rào đọc CÙNG một trục, hàng rào trong
       chỉ có việc khi hàng rào ngoài bị viết sai. Bỏ nó đi thì ngày ai đó thêm
       một endpoint quên `scoped: true`, không còn gì đỡ.

       ------------------------------------------------------------------
       `ref.owner` LÀ CHÍNH NGƯỜI ĐANG HỎI, KHI HỌ CÓ ĐỨNG TÊN
       ------------------------------------------------------------------
       Hai hàng rào chỉ đỡ được cho nhau khi chúng hỏi CÙNG MỘT CÂU, và bản
       trước thì không: `scopeOf` của repository hỏi "actor có nằm trong
       `opportunity_owner` của đơn này không" (cả `SALE` lẫn `BD`), còn E2 so
       `ref.owner !== actor.name` trên MỘT cái tên. Cái tên đó là `owners[0]`,
       mà `ownersOf` sắp theo `role` rồi `name` — `'BD' < 'SALE'` nên người BD
       luôn đứng đầu danh sách.

       Hệ quả: một Sale `ownOnly` đứng đơn có ghi thêm BD thì dòng của họ qua
       được `WHERE` của SQL rồi bị `visible` cắt ngay sau đó, vì `ref.owner` là
       tên người BD. Trang mười dòng ra chín, `hidden` cộng thêm 1 và màn in
       "1 bị ẩn theo quyền của bạn" cho đơn của CHÍNH người đọc, còn `total`
       vẫn đếm nó nên trang cuối hụt dòng. Mở thẳng `GET /:code` thì lại vào
       được vì cửa đó đi bằng vị từ SQL — hai định nghĩa "đơn của tôi" cùng
       chạy và nói ngược nhau.

       Cách chữa nhỏ nhất là để `ref.owner` chở người đang hỏi khi họ có mặt
       trong `owners`: E2 vẫn kiểm đúng một cái tên (hình của `ObjectRef` không
       đổi, và ContextRail vẫn đọc được nó), nhưng câu nó hỏi trở thành đúng
       câu SQL đã hỏi. Ngoài ra mới rơi về `owners[0]` — dòng tóm tắt cho một
       người ngoài đọc, đúng như `refOf` khai. */
    const items = page.rows.map((r) => ({
      ...r,
      ref: scopeRefOf(r.row, r.owners, who),
    }))
    const { visible, hidden } = this.access.visible(who, items)

    /* TWO READS FOR THE WHOLE PAGE, and that is what makes a position per row
       affordable. The ladder is one query; who each deal is waiting on is one
       `IN (…)` over the codes that SURVIVED the scope cut, so a row this reader
       may not see does not even have its approvals fetched.

       They run side by side and only after `visible`, for those two reasons in
       that order. */
    const codes = visible.map((v) => v.row.code)
    const [stageRows, waiting, rows, bookFacts] = await Promise.all([
      this.repo.stageRows(),
      this.approvals.pendingOnMany(codes),
      this.facts.rows(visible),
      this.facts.bookFacts(codes),
    ])

    /* Kiểm chính dữ liệu MÌNH trả ra bằng hợp đồng. Một cột đổi kiểu, một
       trường quên map — cả hai lọt qua `tsc` nếu mapper sai theo, không lọt qua
       đây. Phí bị chặn trên bởi `size` tối đa 200 dòng. */
    return OpportunityBookResponse.parse({
      rows: visible.map((v, i) => {
        const pending = waiting.get(v.row.code) ?? []
        const row = rows[i]
        return {
          ...row,
          ...(row ? bookFacts(row, pending) : {}),
          canAssign: this.acts.canAssign(
            who,
            v,
            pending.some((a) => a.kind === 'contract-sign'),
          ),
          position: positionOf(v.row, stageRows, pending),
        }
      }),
      total: page.total,
      hidden: page.hidden + hidden,
    })
  }

  /** `GET /sales/opportunities/facets` — the book's filter choices, scoped and
   *  filtered like the book itself (`OpportunityFacets`). */
  async facets(who: Actor, q: OpportunityFacetsQuery): Promise<OpportunityFacetsResponse> {
    return OpportunityFacetsResponse.parse(await this.facetsRepo.facets(who, q))
  }

  /** `GET /sales/opportunities/stop-reasons` — the stop drawer's catalogue. */
  async stopReasons(): Promise<OpportunityStopReasons> {
    return OpportunityStopReasons.parse({ rows: await this.facts.stopReasons() })
  }

  /** Thẻ điểm Sổ cơ hội. `GET /sales/opportunities/scorecard`.
   *
   *  KHÔNG nhận `Actor`, KHÔNG cắt theo phạm vi — và đó là quyết định đã chốt ở
   *  sổ lead, chép sang đây vì nhất quán giữa hai sổ của cùng một phòng quan
   *  trọng hơn việc chọn lại: thẻ điểm là điểm của CẢ KỲ, tức của cả phòng. Cắt
   *  nó theo đơn ai đang đứng tên thì mỗi người mở màn thấy một con số khác
   *  nhau dưới cùng một dòng chữ, và không con số nào trong đó là con số người
   *  ta định hỏi — "pipeline đang mở bao nhiêu tiền" không có phiên bản riêng
   *  cho từng người. Cửa vẫn đòi `opportunity.view`; ai không được vào sổ thì cũng
   *  không thấy thẻ. Lập luận đầy đủ ở `LeadService.scorecard`.
   *
   *  Hệ quả phải nói ra: con số ở đây KHÔNG khớp `total` của sổ mà một người
   *  `ownOnly` đang nhìn, vì sổ của họ đã bị trục phạm vi cắt. Hai con số trả
   *  lời hai câu khác nhau, và màn in chúng dưới hai nhãn khác nhau. */
  async scorecard(): Promise<OpportunityScorecard> {
    return OpportunityScorecard.parse(await this.repo.scorecard())
  }

  /** The board weighed column by column — `GET /sales/opportunities/histogram`.
   *
   *  Same open pipeline the scorecard totals, split rather than re-counted, and
   *  unscoped for the same reason: one board, one set of figures. */
  async histogram(): Promise<OpportunityHistogram> {
    return OpportunityHistogram.parse({ buckets: await this.repo.histogram() })
  }

  /** Every open deal of a lead — `GET /sales/opportunities/live-deal`.
   *
   *  Cut per deal by E2 with the ref `book()` builds, because the lead profile
   *  is scoped by the LEAD's owner while each deal is scoped by its own: a
   *  colleague's deal is counted in `hidden`, its code never listed.
   *
   *  "Open" is the repository's `live()` predicate (not lost, not signed), the
   *  same one the import door uses, so the two cannot drift. Oldest first. */
  async liveDeal(who: Actor, leadCode: ObjectCode): Promise<OpportunityLiveDeal> {
    const deals = await this.repo.liveDealsWithOwners(leadCode)
    const items = deals.map((d) => ({
      code: d.row.code,
      ref: scopeRefOf(d.row, d.owners, who),
    }))
    const { visible, hidden } = this.access.visible(who, items)
    return OpportunityLiveDeal.parse({ codes: visible.map((v) => v.code), hidden })
  }

  /** Một đơn theo mã. Hai cách hỏng, và cả hai trả về CÙNG một 404.
   *
   *  Bản trước tách 404 "không có đơn này" khỏi 403 "đơn không phải của bạn",
   *  vì hai câu dẫn tới hai việc khác nhau. Lý lẽ đó đúng ở chỗ khác nhưng sai
   *  ở một cửa đánh địa chỉ BẰNG MÃ: hai câu trả lời khác nhau là một cách
   *  đếm. Ai có phiên cũng đi dọc được không gian mã và đọc ra phòng đang giữ
   *  những đơn nào — trục phạm vi đáng giá thấp hơn danh sách khách.
   *
   *  Phạm vi ở mức TỔNG vẫn nói ra, và cố ý: sổ bớt dòng rồi báo `hidden`, nên
   *  người đọc biết còn bao nhiêu đơn ngoài tầm với và đi xin đổi chủ. Cái họ
   *  không được biết là MÃ NÀO. Đếm thì có, mã thì không.
   *
   *  Ba cửa dưới (`update`, `touches`, `sign`) gộp theo cùng lý do. Sửa mỗi
   *  cửa đọc mà để `PATCH` trả 403 thì lỗ đếm vẫn còn nguyên, chỉ ồn hơn. */
  async profile(who: Actor, code: ObjectCode): Promise<OpportunityProfileResponse> {
    const found = await this.repo.byCode(who, code)
    if (!found || !found.inScope) throw notFound('cơ hội', code)

    /* Independent reads, profile-only (see `OpportunityProfileResponse`).
       `storyFor`, not `story`: E2 cuts the chain to what this reader may open,
       and `hidden` is dropped because a count of what was cut is itself a leak. */
    const [stageRows, approvals, story, row, contacts, events, signedRows] = await Promise.all([
      this.repo.stageRows(),
      this.approvals.pendingOn(code),
      this.graph.storyFor(who, code),
      this.facts.row(found),
      this.facts.contacts(found),
      this.repo.stageEventsOf(code),
      found.signed ? this.contracts.byOpportunity(code, found.row.leadCode) : [],
    ])

    const sign = approvals.find((a) => a.kind === 'contract-sign')
    const contracts = profileContractsOf(signedRows)
    return OpportunityProfileResponse.parse({
      ...row,
      position: positionOf(found.row, stageRows, approvals),
      pendingSign: pendingSignOf(sign),
      contacts,
      ...(await this.acts.of(who, found, sign !== undefined)),
      stages: stageSpansOf(found.row, events, stageRows, new Date()),
      contracts,
      signedTotal: signedTotalOf(found.row, contracts),
      chain: story.chain.map(toChainLink),
    })
  }

  /** `POST /sales/opportunities` — đổi một lead thành cơ hội.
   *
   *  Lead được đọc TRƯỚC khi ghi vì hai lý do khác nhau, và chỉ một trong hai
   *  là hàng rào: câu trả lời là một dòng sổ đầy đủ, mà dòng sổ in TÊN khách
   *  chứ không in mã; và một mã lead không có thật đáng nhận 404 gọi tên nó
   *  chứ không phải 500 của khoá ngoại. Tên người đứng đơn đọc cùng lúc, vì
   *  `platform.object` chở nhãn còn bảng nối chở id.
   *
   *  Không kiểm "actor này có thật không" ở đây: khoá ngoại của bảng nối làm
   *  việc đó cho MỌI cửa, kể cả cửa ai đó viết sau này và quên đoạn kiểm. Nửa
   *  hàng rào ở tầng service là thứ ru ngủ người đọc tiếp theo.
   *
   *  ------------------------------------------------------------------
   *  `who` ĐÃ QUAY LẠI, VÀ NÓ QUAY LẠI ĐÚNG NHƯ ĐÃ HẸN
   *  ------------------------------------------------------------------
   *  Bản trước của hàm này KHÔNG nhận `Actor`, và docblock lúc đó nói rõ lý do:
   *  ai bấm nút đã là một dòng `platform.audit`, nên nhận thêm một tham số chỉ
   *  để không dùng là mời người sau ghi bản thứ hai của cùng một sự thật. Nó
   *  cũng nói trước điều kiện để tham số quay lại — "lúc đó tham số quay lại,
   *  kèm CHỖ ĐỂ CẤT NÓ".
   *
   *  Chỗ đó nay có: `sales.touch.actor_id`. Và hai bảng không phải hai bản của
   *  một sự thật — `audit` ghi AI GỌI ĐƯỜNG NÀO (vết bảo mật, khoá theo một
   *  `action` của HTTP), `touch` ghi CHUYỆN GÌ ĐÃ XẢY RA VỚI KHÁCH NÀY (một
   *  dòng người bán đọc trên thẻ hoạt động). Xoá một dòng audit là mất dấu vết
   *  truy cập; xoá một dòng touch là mất một mẩu lịch sử bán hàng. */
  async create(who: Actor, body: OpportunityCreate): Promise<OpportunityCreateResponse> {
    const handle = this.repo.readonlyHandle

    const pic = [...body.saleOwners, ...body.bdOwners]
    const acceptor = this.acceptorAtCreate(who)
    const [lead, names, roles] = await Promise.all([
      this.repo.leadCompany(handle, body.leadCode),
      this.repo.actorNames(handle, pic),
      actorRoles(handle, pic),
    ])
    if (lead === null) throw notFound('lead', body.leadCode)
    if (!holds(who, lead.ownerId)) throw foreignLead(body.leadCode)
    if (lead.exited)
      throw conflict(`Lead đang ở trạng thái ${LEAD_GONE_WORDS} — không tạo được cơ hội`)

    /* ONE instant for the whole write. `new Date()` used to sit inline in the
       `fromCreate` call, which was enough while one place needed it; the column
       history row now needs that same instant, and two `new Date()` a few
       milliseconds apart are two answers to "when did this deal enter the
       column". */
    const now = new Date()
    const write = fromCreate(body, now, lead.workstreamCode, acceptor?.id ?? null)
    const owner = holderOfIds(body, names, roles, acceptor)
    await assertSellers(handle, body.saleOwners)
    assertHeld(owner)
    const code = await this.repo.nextCode()

    const row = await this.repo.run(async (tx) => {
      const accounts = await this.assertLeadsLive(tx, who, [body.leadCode])
      const ref = refOf(code, write, { label: write.values.name, owner })
      await this.mirror.put(tx, ref)
      /* The lead BEGAT this deal, so the arrow runs lead → deal. Written here
         rather than left to the seed because a rail that only exists in seeded
         data is a rail that breaks the first time somebody opens a deal they
         made themselves. Both mirror rows are in place: the lead's is
         guaranteed by `lead.code`'s foreign key, the deal's by the line above. */
      await this.mirror.link(tx, { from: body.leadCode, to: code, kind: 'spawned' })
      const written = await this.repo.insertOpportunity(tx, {
        ...write.values,
        code,
        accountCode: accounts.get(body.leadCode) ?? null,
      })
      await this.repo.insertOwners(tx, ownerRowsOf(code, write))
      await this.repo.insertProducts(tx, productRowsOf(code, write))
      await this.opening.writeContacts(tx, who, code, body.leadCode, body.contacts)

      /* THE FIRST HISTORY ROW — `from: null`, i.e. the deal entering the board.
         Written at the create door rather than waiting for the first column
         move, because a funnel missing its ENTRY step counts nothing: every
         conversion rate has "deals that entered the first column" as its
         denominator. Unconditional since ADR 0064: a new deal always stands in
         a column — `new`, or `assigned` when its creator accepted it at birth. */
      await this.repo.insertStageEvent(
        tx,
        stageEventOf({
          code,
          from: null,
          to: written.stage,
          stageSince: null,
          at: now,
          by: { id: who.id, name: who.name },
          note: NOTE.opened(body.leadCode),
        }),
      )

      /* HAI dòng thời gian, không một. Đơn mới cần dòng đầu tiên của chính nó
         ("mở đơn từ lead nào"), còn hồ sơ lead cần biết khách này đã lên
         pipeline — và hai câu đó đọc khác nhau vì chúng trả lời cho hai người
         đang mở hai màn khác nhau. Gộp thành một dòng trên lead thì hồ sơ đơn
         mở ra trống trơn ngay ngày nó ra đời. */
      await this.touch.record(tx, [
        {
          subjectCode: code,
          subjectKind: 'opportunity',
          kind: 'entered-pipeline',
          ...byOf(who),
          note: NOTE.opened(body.leadCode),
        },
        {
          subjectCode: body.leadCode,
          subjectKind: 'lead',
          kind: 'entered-pipeline',
          ...byOf(who),
          note: NOTE.promoted(code, write.values.name),
        },
        ...acceptTouches(code, acceptor, now),
      ])

      /* Never the lost letter from this door: a deal is opened onto the board,
         and the only way off it short of signing is the stop door (ADR 0069). */
      await this.notify(tx, ref, false)
      await this.leadStates.converted(tx, [body.leadCode])
      if (written.workstreamCode) await this.workstreams.syncClosed(tx, [written.workstreamCode])
      return written
    })

    /* `contractCodes: []` is known, not guessed: this deal was born a moment ago
       and no door has signed it. Who opened it lives in the touch and stage-event
       rows above; this door writes no `platform.audit` row. */
    /* Labels looked up AFTER the write, outside the transaction: the body only
       carries ids, and the answer has to print names. One extra read per write
       is the right price — building labels from the draft would show the screen
       a name the server guessed rather than the one the catalog holds. */
    const productNames = (await this.repo.productsOf(handle, [code])).get(code) ?? []

    return OpportunityCreateResponse.parse(
      await this.facts.row({
        row,
        account: lead.company,
        owners: [
          ...body.saleOwners.map((id) => ({
            id,
            name: names.get(id) ?? id,
            role: 'SALE' as const,
          })),
          ...body.bdOwners.map((id) => ({ id, name: names.get(id) ?? id, role: 'BD' as const })),
        ],
        contractCodes: [],
        holder: owner,
        acceptedBy: acceptor,
        hasSeller: sellerAmong(body.saleOwners, roles),
        daysInStage: daysInStageOf(row, row.createdAt),
        /* Labels read from the catalog after the write rather than rebuilt from
           the ids in the body: the body only carries ids, and the answer has to
           print names. */
        products: productNames,
      }),
    )
  }

  /** `PATCH /sales/opportunities/:code` — lưu phiếu ở hồ sơ cơ hội.
   *
   *  ------------------------------------------------------------------
   *  READ THROUGH `byCode` FIRST, THEN WRITE
   *  ------------------------------------------------------------------
   *  An `UPDATE … WHERE code = $1` with a scope clause would stop the right
   *  people too, but it can only say "no row updated". Reading first lets the
   *  door give each refusal its own answer (409 lost, 403 sign terms, …).
   *  Missing and out-of-scope stay ONE 404 on purpose — see `profile`.
   *
   *  ------------------------------------------------------------------
   *  THIS DOOR DOES NOT MOVE THE DEAL
   *  ------------------------------------------------------------------
   *  `state`, `stage`, the column clock, `closed_at` and the fail log are not in
   *  `OpportunityEdit` (ADR 0064), and since ADR 0071 neither is `assigned`: it
   *  is a head's accept, not a side effect of who is typed into the owners. At
   *  `new` either lane may be emptied here; past it the SALE lane has one door,
   *  `sale-owners` (`assertSaleLaneKept`). The sign door is what asks for a Sale. */
  async update(
    who: Actor,
    code: ObjectCode,
    body: OpportunityUpdate,
  ): Promise<OpportunityUpdateResponse> {
    const found = await this.repo.byCode(who, code)
    if (!found || !found.inScope) throw notFound('cơ hội', code)
    const details = editDetailsVerdict(found.row)
    if (!details.ok) throw conflict(details.reason)
    const pendingSign = await this.pendingSign(code)
    const terms = editTermsVerdict(dealAtOf(found, pendingSign))
    if (!terms.ok && touchesTerms(found, body)) throw conflict(terms.reason)
    /* SALE owners are the sign request's commission holders: frozen while it
       waits, and on a signed deal they need the sign door's permission. */
    if (saleLaneMoved(found, body)) {
      if (pendingSign) throw frozenForSign()
      if (found.signed) {
        const ref = scopeRefOf(found.row, found.owners, who)
        const verdict = this.access.check(who, { permission: 'opportunity.close', ref })
        if (!verdict.ok) throw denied(verdict.reason, verdict.note)
      }
    }

    const pic = [...body.saleOwners, ...body.bdOwners]
    const [names, roles, signedContracts] = await Promise.all([
      this.repo.actorNames(this.repo.readonlyHandle, pic),
      actorRoles(this.repo.readonlyHandle, pic),
      found.signed ? this.contracts.byOpportunity(code, found.row.leadCode) : [],
    ])

    const write = fromUpdate(body)
    const { row, owner, acceptedBy } = await this.repo.run(async (tx) => {
      await this.assertLockedAsRead(tx, code, found, pendingSign)
      const { now, owner } = await this.ownersUnderLock(tx, code, body, names, roles)
      const written = await this.repo.updateOpportunity(tx, code, write.values)
      await this.repo.replaceOwners(tx, code, ownerRowsOf(code, write))
      await recordSaleLane(tx, this.touch, saleLaneChange(now, body.saleOwners, names, owner, who))
      await this.repo.replaceProducts(tx, code, productRowsOf(code, write))
      const products = (await this.repo.productsOf(tx, [code])).get(code) ?? []
      await this.touch.record(tx, editTrail({ found, body, names, products, who }))
      for (const signed of signedContracts) await this.syncContract(tx, found, body, signed, owner)

      /* Dòng gương cập nhật theo — `put` là upsert, và nó đọc từ dòng ĐÃ GHI.
         Không cập nhật thì ContextRail vẫn in tên đơn cũ sau khi người dùng đã
         sửa, và không có gì đỏ để chỉ ra điều đó. */
      await this.mirror.put(tx, toRef(written, owner))
      return { row: written, owner, acceptedBy: now.acceptedBy }
    })

    const productNames =
      (await this.repo.productsOf(this.repo.readonlyHandle, [code])).get(code) ?? []

    return OpportunityUpdateResponse.parse(
      await this.facts.row({
        row,
        account: found.account,
        owners: [
          ...body.saleOwners.map((id) => ({
            id,
            name: names.get(id) ?? id,
            role: 'SALE' as const,
          })),
          ...body.bdOwners.map((id) => ({ id, name: names.get(id) ?? id, role: 'BD' as const })),
        ],
        /* "Đã thắng" không đổi được bằng cửa này — nó là câu hỏi về bảng
           `contract`, và lượt sửa vừa rồi không chạm bảng đó. Chở lại đúng câu
           trả lời đã đọc cùng dòng, thay vì hỏi lần thứ hai. */
        contractCodes: found.contractCodes,
        holder: owner,
        acceptedBy,
        hasSeller: sellerAmong(body.saleOwners, roles),
        daysInStage: daysInStageOf(row, new Date()),
        products: productNames,
      }),
    )
  }

  /** `GET /sales/opportunities/:code/stage-history` — which columns a deal has
   *  been through.
   *
   *  SEPARATE from `touches`, even though the two tell one story. The activity
   *  card reads `sales.touch` and prints a sentence a person reads; this table
   *  returns from-column, to-column and days spent, which is the shape you can
   *  average. Full reasoning is in the docblock of `opportunity_stage_event`. */
  async stageHistory(who: Actor, code: ObjectCode): Promise<OpportunityStageHistory> {
    const found = await this.repo.byCode(who, code)
    if (!found || !found.inScope) throw notFound('cơ hội', code)

    const rows = await this.repo.stageEventsOf(code)
    return OpportunityStageHistory.parse({ rows: rows.map(toStageEvent) })
  }

  /** `GET /sales/opportunities/:code/touches` — dòng thời gian của một đơn.
   *
   *  Đi qua `byCode` trước rồi mới hỏi bảng lần chạm, và một danh sách rỗng
   *  KHÔNG được dùng thay cho hai câu từ chối: rỗng là câu trả lời THẬT — một
   *  đơn vừa mở có đúng một dòng, một đơn nạp từ tệp có đúng một dòng — nên nó
   *  không được kiêm nghĩa "không có đơn này, hoặc không phải của bạn".
   *  Cùng lý lẽ mà `LeadService.mailTimeline` đã viết ra đầy đủ, và cùng cái
   *  giá: một câu truy vấn thừa trên một màn vốn đang tải sẵn hồ sơ. */
  async touches(who: Actor, code: ObjectCode): Promise<TouchTimelineResponse> {
    const found = await this.repo.byCode(who, code)
    if (!found || !found.inScope) throw notFound('cơ hội', code)

    return this.touch.timeline(code)
  }

  // ── nạp từ tệp ───────────────────────────────────────────────────────────

  /** Chạy thử. KHÔNG ghi gì — kể cả một con số của dãy mã. */
  async importPreview(
    who: Actor,
    body: OpportunityImportBody,
  ): Promise<OpportunityImportPreviewResponse> {
    const { report } = await this.check(this.repo.readonlyHandle, who, body)
    return OpportunityImportPreviewResponse.parse(report)
  }

  /** Nạp thật. Cả lô vào hết hoặc không đơn nào vào.
   *
   *  Nửa lô đã ghi rồi máy chủ chết là trạng thái không ai gỡ được bằng tay —
   *  người ta sẽ nạp lại cả tệp, và lần này nửa đầu thành trùng. Một
   *  transaction, và bản báo cáo là thứ nói cho biết những gì KHÔNG vào. */
  async importCommit(
    who: Actor,
    body: OpportunityImportBody,
  ): Promise<OpportunityImportCommitResponse> {
    const handle = this.repo.readonlyHandle
    const { report, writes, workstreamByLead } = await this.check(handle, who, body)

    /* Mã cấp TRƯỚC khi mở transaction, một câu cho cả lô — lý do đầy đủ ở
       `nextCodes`. Dãy trả theo thứ tự tăng nên thứ tự của tệp cũng là thứ tự
       của mã, không cần sắp lại như lô nạp lead phải làm. */
    const codes = await this.repo.nextCodes(writes.length)
    const now = new Date()
    const acceptor = this.acceptorAtCreate(who)

    const everyone = writes.flatMap((w) => [...w.saleOwners, ...w.bdOwners])
    const [names, roles] = await Promise.all([
      this.repo.actorNames(handle, everyone),
      actorRoles(handle, everyone),
    ])

    /* Dòng, dòng gương, bảng nối và lần chạm dựng CÙNG một lượt, từ cùng một
       bản nháp và cùng một mã — bốn thứ không lệch nhau bằng một chỉ số được. */
    const ready = writes.map((write, i) => {
      const code = codes[i] ?? ''
      /* The typed door's column rule, through the same function: `new`, or
         `assigned` when the importer may accept (ADR 0071). The file carries
         no stage column, so this is the only way an imported deal gets one. */
      const draft = fromCreate(
        write,
        now,
        workstreamByLead.get(write.leadCode) ?? null,
        acceptor?.id ?? null,
      )
      return {
        code,
        row: { ...draft.values, code },
        ref: refOf(code, draft, {
          label: draft.values.name,
          owner: holderOfIds(write, names, roles, acceptor),
        }),
        owners: ownerRowsOf(code, draft),
        /* THE "ENTERED THE BOARD" ROW — the same row the single-deal create
           door writes, for the same reason. This door forgot it until 03/09,
           and the omission was invisible on every screen: an imported deal
           shows up in the book, moves column, signs. Only the funnel counts
           short, because the denominator of every conversion rate is how many
           deals STEPPED INTO the first column. A 300-line file was 300 deals
           the report could not see, and nothing surfaces that until somebody
           compares two numbers.

           `stageSince: null`, not `now`: this row leaves no column, so
           `days_in_from` must be NULL — `opportunity_stage_event_clock` pins
           that pair. Unconditional since ADR 0064, like the single-deal door:
           every imported deal enters a column. */
        stageEvent: stageEventOf({
          code,
          from: null,
          to: draft.values.stage ?? null,
          stageSince: null,
          at: now,
          by: { id: who.id, name: who.name },
          note: NOTE.opened(write.leadCode),
        }),
        touches: [
          {
            subjectCode: code,
            subjectKind: 'opportunity' as const,
            kind: 'entered-pipeline' as const,
            ...byOf(who),
            note: NOTE.opened(write.leadCode),
          },
          {
            subjectCode: write.leadCode,
            subjectKind: 'lead' as const,
            kind: 'entered-pipeline' as const,
            ...byOf(who),
            note: NOTE.promoted(code, write.name),
          },
          ...acceptTouches(code, acceptor, now),
        ] satisfies TouchEntry[],
      }
    })

    const batch = await this.repo.run(async (tx) => {
      const accounts = await this.assertLeadsLive(tx, who, [
        ...new Set(ready.map((p) => p.row.leadCode)),
      ])
      /* Cắt khúc, và vẫn nguyên tử — mọi câu dưới đây chạy trong đúng
         transaction này. Cắt khúc là chuyện trần 65.535 tham số ràng buộc của
         Postgres, không phải chuyện bền vững.

         Dòng gương TRƯỚC trong mỗi khúc. Với lead thì khoá ngoại ép thứ tự đó;
         với cơ hội thì `opportunity.code` chưa trỏ về `platform.object` nên
         đây là kỷ luật — giữ đúng thứ tự để ngày khoá ngoại đó được thêm vào,
         cửa này không phải sửa. */
      const CHUNK = 500
      for (let i = 0; i < ready.length; i += CHUNK) {
        const slice = ready.slice(i, i + CHUNK)
        if (slice.length === 0) continue
        await this.mirror.putMany(
          tx,
          slice.map((p) => p.ref),
        )
        /* Same edge the single-deal door writes, for the same reason — a deal
           that arrived in a file has exactly the same story as one typed by
           hand, and a rail that depends on which door was used is a rail
           nobody can trust. */
        await this.mirror.linkMany(
          tx,
          slice.map((p) => ({ from: p.row.leadCode, to: p.code, kind: 'spawned' as const })),
        )
        await this.repo.insertMany(
          tx,
          slice.map((p) => ({ ...p.row, accountCode: accounts.get(p.row.leadCode) ?? null })),
        )
        await this.repo.insertOwners(
          tx,
          slice.flatMap((p) => p.owners),
        )
        /* AFTER `insertMany` — the `opportunity_code` foreign key demands the
           deal row first, and both statements sit in one transaction, so the
           order written here is the order Postgres enforces rather than a
           convention someone could reorder. */
        await this.repo.insertStageEvents(
          tx,
          slice.map((p) => p.stageEvent),
        )
        await this.touch.record(
          tx,
          slice.flatMap((p) => p.touches),
        )
      }
      await this.leadStates.converted(tx, [...new Set(ready.map((p) => p.row.leadCode))])
      await this.workstreams.syncClosed(tx, [
        ...new Set(ready.flatMap((p) => p.row.workstreamCode ?? [])),
      ])

      /* Biên lai được ghi KỂ CẢ khi không dòng nào vào. Một lô toàn lỗi vẫn là
         một việc đã xảy ra, và "tôi có bấm nạp mà chẳng thấy gì" là câu chỉ trả
         lời được nếu có dòng này. */
      return this.repo.writeBatchNote(tx, {
        actorId: who.id,
        note: JSON.stringify({
          kind: 'opportunity-import',
          file: body.fileName,
          accepted: codes.length,
          codes,
        }),
      })
    })

    return OpportunityImportCommitResponse.parse({
      ...report,
      batchId: batch.id,
      at: batch.at.toISOString(),
      accepted: codes.length,
      codes,
    })
  }

  /** Nửa dùng chung của hai cửa nạp — lý do "chạy thử nói sạch, nạp thật báo
   *  lỗi" không xảy ra được.
   *
   *  Ba lượt đọc, và lượt thứ ba phụ thuộc hai lượt đầu: phải dịch xong tên
   *  công ty sang mã lead mới biết hỏi đơn đang mở của những lead NÀO. Dịch
   *  bằng đúng `fold` mà bộ kiểm dùng — không phải một bản chép, mà chính hàm
   *  đó — nên tập mã hỏi ở đây và tập mã bộ kiểm phân giải không lệch nhau. */
  private async check(
    handle: Db,
    who: Actor,
    body: OpportunityImportBody,
  ): Promise<ImportCheck & { workstreamByLead: ReadonlyMap<string, string | null> }> {
    const [staff, leads] = await Promise.all([
      this.repo.staff(handle),
      this.repo.leadsByCompany(handle),
    ])

    const candidates = [
      ...new Set(
        body.rows
          .map((r) => leads.byCompany.get(fold(r.values.company ?? '')))
          .filter((c): c is string => c !== undefined),
      ),
    ]

    const liveDealByLead = await this.repo.liveDealsByLead(handle, candidates)

    return {
      ...checkBatch({
        rows: body.rows,
        staff,
        leadByCompany: leads.byCompany,
        ambiguousCompany: leads.ambiguous,
        liveDealByLead,
        exitedCompany: leads.exited,
        outOfScope: new Set(
          [...leads.ownerByLead].filter(([, owner]) => !holds(who, owner)).map(([code]) => code),
        ),
        importerAccepts: this.acceptorAtCreate(who) !== null,
      }),
      workstreamByLead: leads.workstreamByLead,
    }
  }

  /** A creator who may accept (ADR 0071 §3, head of sales or director by the
   *  default matrix) accepts the deal at birth. Asked of E2 rather than of
   *  `roleId`, so it follows the same grant as the accept door itself. */
  private acceptorAtCreate(who: Actor): RefOwner | null {
    return this.access.allows(who, 'opportunity.accept') ? { id: who.id, name: who.name } : null
  }

  /** The owner rules on the deal as it stands UNDER the row lock — an accept
   *  or an assign landing after the pre-read is judged, not overwritten. */
  private async ownersUnderLock(
    tx: Db,
    code: string,
    body: OpportunityUpdate,
    names: ReadonlyMap<string, string>,
    roles: ReadonlyMap<string, RoleId>,
  ): Promise<{ now: OpportunityRead; owner: RefOwner | null }> {
    const now = await this.repo.byCode(null, code, tx)
    if (!now) throw notFound('cơ hội', code)
    assertSaleLaneKept(now, body.saleOwners)
    const onSale = new Set(now.owners.filter((o) => o.role === 'SALE').map((o) => o.id))
    await assertSellers(
      tx,
      body.saleOwners.filter((id) => !onSale.has(id)),
    )
    const owner = holderOfIds(body, names, roles, now.acceptedBy)
    assertHeld(owner)
    return { now, owner }
  }

  private async pendingSign(code: string): Promise<boolean> {
    return (await this.approvals.pendingOn(code)).some((a) => a.kind === 'contract-sign')
  }

  /** Inside the write's transaction: lock the deal, and refuse if signing, a
   *  sign request or a stop landed between the pre-transaction checks and the lock. */
  private async assertLockedAsRead(
    tx: Db,
    code: string,
    found: OpportunityRead,
    pendingSign: boolean,
  ): Promise<void> {
    const locked = await this.repo.lockDeal(tx, code)
    if (!locked) throw notFound('cơ hội', code)
    const lost = found.row.state === 'lost'
    if (
      locked.signed !== found.signed ||
      locked.pendingSign !== pendingSign ||
      locked.lost !== lost
    ) {
      throw conflict(`Cơ hội ${code} vừa được ký, gửi duyệt ký hoặc dừng — tải lại rồi thử lại.`)
    }
  }

  /** Lock the leads a deal write lands on (`lockLeads`), so an exit or a
   *  hand-over racing it waits, then re-check scope and liveness on the locked
   *  rows — the pre-reads ran outside the tx. Returns each lead's company, read
   *  under that lock: the deal copies it, a body never names one. */
  private async assertLeadsLive(
    tx: Db,
    who: Actor,
    leadCodes: readonly string[],
  ): Promise<ReadonlyMap<string, string | null>> {
    const rows = await this.repo.lockLeads(tx, leadCodes)
    const foreign = rows.find((r) => !holds(who, r.ownerId))
    if (foreign) throw foreignLead(foreign.code)
    if (rows.some((r) => r.exited))
      throw conflict(`Lead đang ở trạng thái ${LEAD_GONE_WORDS} — không tạo được cơ hội`)
    return new Map(rows.map((r) => [r.code, r.accountCode]))
  }

  /** A signed deal's edit carries its commission holder onto each contract, in
   *  the edit's transaction (ADR 0057 §1). The holder moves only when they are
   *  no longer a SALE owner — one hand-picked in the sign drawer survives — and
   *  moves to the deal's holder (`holderOf`). Money no longer follows: each
   *  paper names its own (ADR 0069 §5). */
  private async syncContract(
    tx: Db,
    found: OpportunityRead,
    body: OpportunityUpdate,
    signed: ContractRead,
    holder: RefOwner | null,
  ): Promise<void> {
    if (signed.row.ownerId !== null && body.saleOwners.includes(signed.row.ownerId)) return

    const row = await this.contracts.updateTerms(tx, signed.row.code, {
      ownerId: holder?.id ?? null,
    })
    await this.mirror.put(tx, {
      code: row.code,
      kind: 'HĐ',
      branch: 'Sales',
      label: `${found.account} · ${body.name}`,
      ...(holder ? { owner: holder.name, ownerId: holder.id } : {}),
      ...(row.amount === null ? {} : { amount: row.amount }),
    })
  }

  /** Xếp hàng mail báo TRONG CÙNG đơn vị công việc với chính cơ hội.
   *
   *  Nằm trong `tx` có chủ ý, và đó là toàn bộ lý do `MailEnqueue` nhận một
   *  transaction handle: một cơ hội tồn tại mà không có thư báo là một đơn
   *  không ai được bảo phải gật, còn một thư báo tồn tại mà không có cơ hội thì
   *  trỏ vào một mã đã rollback. Chỉ tránh được cả hai khi hai lượt ghi chung
   *  một commit. Ở đây chưa có gì rời khỏi tiến trình — dòng vừa ghi là một lời
   *  hứa gửi, và worker giữ lời hứa đó sau khi commit.
   *
   *  Nhánh EMIT một sự kiện, nó không chọn kênh cũng không chọn template. E4
   *  giữ bảng ánh xạ đó, nên ở đây `plan()` được hỏi thay vì một tên template
   *  được gõ ra. Thứ duy nhất nhánh đóng góp là điều engine không được biết:
   *  bản triển khai này gửi vào hộp thư nào.
   *
   *  `lost` đi qua `data` chứ không thành một event name thứ hai — xem docblock
   *  của `OPPORTUNITY_OPENED`. Hộp thư trống = KHÔNG xếp hàng gì, đúng hành vi
   *  của một máy chưa được bảo gửi đi đâu; `PV_EMAIL_ENABLED` cố tình KHÔNG gác
   *  chỗ này, vì một cửa gửi đang tắt vẫn phải ghi sổ, nó chỉ không cho thư rời
   *  khỏi máy (xem `env.ts`).
   *
   *  CÔNG KHAI vì cửa dừng (`OpportunityMoves.stop`) cũng bắn lá này: hai cửa,
   *  một lời hứa gửi. Chép `plan()` sang file kia là dựng câu trả lời thứ hai
   *  cho "ai được biết một đơn vừa chết". */
  async notify(tx: Db, ref: ObjectRef, lost: boolean): Promise<void> {
    const intents = plan({
      name: OPPORTUNITY_OPENED,
      ref,
      audiences: { [AUDIENCE_INTERNAL]: this.env.PV_OPS_NOTIFICATION_TO },
      data: { lost },
    })

    for (const intent of intents) {
      /* Email là kênh duy nhất hôm nay có cổng ra. Một intent Zalo hay Telegram
         cần sổ gửi riêng của nó, nên nó bị BỎ QUA chứ không lặng lẽ đi nhờ sổ
         của mail. */
      if (intent.channel !== 'email') continue

      await this.mail.enqueue(tx, {
        eventKey: intent.eventKey,
        eventType: OPPORTUNITY_OPENED,
        aggregateType: 'opportunity',
        aggregateId: ref.code,
        template: intent.template,
        templateVersion: intent.templateVersion,
        recipient: intent.to,
      })
    }
  }
}

/** Where one deal stands, for the profile door.
 *
 *  Everything the engine needs is already in hand by the time this is called;
 *  the function itself is pure and synchronous, which is the whole reason it
 *  can also run in a browser. What this adds is the two translations only the
 *  branch can make:
 *
 *   · the LADDER — `config_entry` stores a label and an ord, never a stage key,
 *     so the pairing is by ordinal position and `stageConfigOf` is the one
 *     place allowed to make it;
 *   · the EVIDENCE — for a deal, its own column IS the evidence. A lead would
 *     pass "a quote exists, a contract exists"; a deal has nothing to infer,
 *     which is why `reached` is one entry rather than a walk through stage
 *     history. When it moved is a different question, and `:code/stage-history`
 *     already answers that one.
 *
 *  `null` comes back for a deal with no column — won and lost have left the
 *  board — and that is the honest answer rather than a phase invented for them. */
function positionOf(
  row: OpportunityRowDb,
  stageRows: { name: string; limitDays: number | null }[],
  approvals: readonly Decidable[],
): PipelinePositionView | null {
  if (!row.stage) return null

  const config = stageConfigOf(stageRows)
  const position = pipelinePosition(
    {
      ref: toRef(row, null),
      phases: phasesOf(config, StageKey.options),
      reached: [row.stage],

      since: row.stageSince?.toISOString() ?? null,
      approvals,
    },
    new Date().toISOString(),
  )

  return position === null ? null : PipelinePositionView.parse(position)
}

/** The body changes who stands on the SALE lane. The deal's terms are judged
 *  apart (`touchesTerms`); `state` left the body with ADR 0064. */
function saleLaneMoved(found: OpportunityRead, body: OpportunityUpdate): boolean {
  const sale = found.owners.filter((o) => o.role === 'SALE').map((o) => o.id)
  return sale.length !== body.saleOwners.length || sale.some((id) => !body.saleOwners.includes(id))
}

/** `holderOf` over a body's owner ids, with names and roles resolved first so
 *  it applies its own order, not the body's; ids the actor book does not know
 *  are skipped (their insert dies on the owner foreign key). */
function holderOfIds(
  body: { saleOwners: readonly string[]; bdOwners: readonly string[] },
  names: ReadonlyMap<string, string>,
  roles: ReadonlyMap<string, RoleId>,
  acceptor: RefOwner | null,
): RefOwner | null {
  const lane = (ids: readonly string[], role: 'SALE' | 'BD') =>
    ids.flatMap((id) => {
      const name = names.get(id)
      return name === undefined ? [] : [{ id, name, role, roleId: roles.get(id) ?? null }]
    })
  return holderOf([...lane(body.saleOwners, 'SALE'), ...lane(body.bdOwners, 'BD')], acceptor)
}

/** A deal born accepted tells its timeline the same fact the accept door
 *  writes through `OpportunityLifecycle.assigned`: same kind, same note. */
function acceptTouches(code: string, acceptor: RefOwner | null, at: Date): TouchEntry[] {
  if (acceptor === null) return []
  const note = NOTE.moved('new', 'assigned')
  return [
    {
      subjectCode: code,
      subjectKind: 'opportunity',
      kind: 'stage-changed',
      ...byOf(acceptor),
      note,
      at,
    },
  ]
}

/** `hasSellerOf` over a body's SALE ids, roles resolved first. */
const sellerAmong = (ids: readonly string[], roles: ReadonlyMap<string, RoleId>): boolean =>
  hasSellerOf(ids.map((id) => ({ role: 'SALE' as const, roleId: roles.get(id) })))

const frozenForSign = () =>
  conflict('Cơ hội đang chờ duyệt ký — chờ duyệt hoặc từ chối đề nghị trước khi sửa')
