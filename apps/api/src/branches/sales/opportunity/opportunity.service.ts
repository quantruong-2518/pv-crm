import { Inject, Injectable } from '@nestjs/common'
import {
  AUDIENCE_INTERNAL,
  OPPORTUNITY_OPENED,
  pipelinePosition,
  plan,
  type AccessControl,
  type Actor,
  type Decidable,
  type ObjectRef,
} from '@pv/engines'
import {
  OpportunityBookResponse,
  OpportunityCreateResponse,
  OpportunityProfileResponse,
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
  type OpportunityImportBody,
  type OpportunityStageMove,
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
import { LeadStateWriter } from '../lead/lead-state'
import { checkBatch, fold, type ImportCheck } from './opportunity-import.check'
import {
  fromCreate,
  fromUpdate,
  daysInStageOf,
  NOTE,
  ownerRowsOf,
  productRowsOf,
  refOf,
  scopeRefOf,
  stageEventOf,
  toContract,
  toRef,
  toStageEvent,
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
      ref: scopeRefOf(r.row, r.owners, who.id),
    }))
    const { visible, hidden } = this.access.visible(who, items)

    /* TWO READS FOR THE WHOLE PAGE, and that is what makes a position per row
       affordable. The ladder is one query; who each deal is waiting on is one
       `IN (…)` over the codes that SURVIVED the scope cut, so a row this reader
       may not see does not even have its approvals fetched.

       They run side by side and only after `visible`, for those two reasons in
       that order. */
    const [stageRows, waiting] = await Promise.all([
      this.repo.stageRows(),
      this.approvals.pendingOnMany(visible.map((v) => v.row.code)),
    ])

    /* Kiểm chính dữ liệu MÌNH trả ra bằng hợp đồng. Một cột đổi kiểu, một
       trường quên map — cả hai lọt qua `tsc` nếu mapper sai theo, không lọt qua
       đây. Phí bị chặn trên bởi `size` tối đa 200 dòng. */
    return OpportunityBookResponse.parse({
      rows: visible.map((v) => ({
        ...toContract(v),
        position: positionOf(v.row, stageRows, waiting.get(v.row.code) ?? []),
      })),
      total: page.total,
      hidden: page.hidden + hidden,
    })
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
      ref: scopeRefOf(d.row, d.owners, who.id),
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

    /* The ladder, the open approvals and the object chain, side by side: none
       depends on the others and the screen waits on all three. Read only on
       this door — see `OpportunityProfileResponse` for why the book does not
       pay for them.

       `storyFor` rather than `story`, and the reasoning is the lead profile's:
       the chain crosses records this reader may not be allowed to open, so E2
       cuts it inside the service. `hidden` is dropped for the same reason
       there — a count of what was cut is itself a leak on a rail this short. */
    const [stageRows, approvals, story] = await Promise.all([
      this.repo.stageRows(),
      this.approvals.pendingOn(code),
      this.graph.storyFor(who, code),
    ])

    const sign = approvals.find((a) => a.kind === 'contract-sign')
    return OpportunityProfileResponse.parse({
      ...toContract(found),
      position: positionOf(found.row, stageRows, approvals),
      pendingSign: sign
        ? { approvalId: sign.id, raisedBy: sign.raisedBy, raisedAt: sign.raisedAt.toISOString() }
        : null,
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

    const [lead, names] = await Promise.all([
      this.repo.leadCompany(handle, body.leadCode),
      this.repo.actorNames(handle, [...body.saleOwners, ...body.bdOwners]),
    ])
    if (lead === null) throw notFound('lead', body.leadCode)
    if (lead.exited) throw conflict('Lead đã loại hoặc đã lưu trữ — không tạo được cơ hội')

    /* ONE instant for the whole write. `new Date()` used to sit inline in the
       `fromCreate` call, which was enough while one place needed it; the column
       history row now needs that same instant, and two `new Date()` a few
       milliseconds apart are two answers to "when did this deal enter the
       column". */
    const now = new Date()
    const write = fromCreate(body, now, lead.workstreamCode)
    const code = await this.repo.nextCode()
    const ownerName =
      body.saleOwners.map((id) => names.get(id)).find((n) => n !== undefined) ?? null

    const row = await this.repo.run(async (tx) => {
      await this.assertLeadsLive(tx, [body.leadCode])
      const ref = refOf(code, write, { label: write.values.name, ownerName })
      await this.mirror.put(tx, ref)
      /* The lead BEGAT this deal, so the arrow runs lead → deal. Written here
         rather than left to the seed because a rail that only exists in seeded
         data is a rail that breaks the first time somebody opens a deal they
         made themselves. Both mirror rows are in place: the lead's is
         guaranteed by `lead.code`'s foreign key, the deal's by the line above. */
      await this.mirror.link(tx, { from: body.leadCode, to: code, kind: 'spawned' })
      const written = await this.repo.insertOpportunity(tx, { ...write.values, code })
      await this.repo.insertOwners(tx, ownerRowsOf(code, write))
      await this.repo.insertProducts(tx, productRowsOf(code, write))

      /* THE FIRST HISTORY ROW — `from: null`, i.e. the deal entering the board.
         Written at the create door rather than waiting for the first column
         move, because a funnel missing its ENTRY step counts nothing: every
         conversion rate has "deals that entered the first column" as its
         denominator. A deal opened straight into the lost state stands in no
         column, and a `null -> null` row is refused by
         `opportunity_stage_event_moved` — exactly right, because that deal was
         never on the board. */
      if (written.stage !== null) {
        await this.repo.insertStageEvent(
          tx,
          stageEventOf({
            code,
            from: null,
            to: written.stage,
            stageSince: null,
            at: now,
            by: { id: who.id, name: who.name },
            note: NOTE.opened(body.leadCode, body.state),
          }),
        )
      }

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
          note: NOTE.opened(body.leadCode, body.state),
        },
        {
          subjectCode: body.leadCode,
          subjectKind: 'lead',
          kind: 'entered-pipeline',
          ...byOf(who),
          note: NOTE.promoted(code, write.values.name),
        },
      ])

      await this.notify(tx, ref, body.state === 'close-lost')
      await this.leadStates.converted(tx, [body.leadCode])
      if (written.workstreamCode) await this.workstreams.syncClosed(tx, [written.workstreamCode])
      return written
    })

    /* `signed: false` là biết chứ không đoán: "đã thắng" nghĩa là có dòng trong
       `sales.contract`, và đơn này ra đời một mili giây trước — chưa có cửa nào
       ký được cho nó. Cùng phép mà `LeadWriteService.create` dùng cho `daysHere`.

       Hàm không nhận `Actor`, cùng lý do `LeadWriteService.create` không nhận:
       ai bấm nút đã là một dòng của `platform.audit` do `RouteAuditService`
       ghi, và nhận thêm một tham số chỉ để không dùng là mời người sau ghi bản
       thứ hai của cùng một sự thật. Ngày nối E3, phiếu này thành một đề nghị
       thật và NGƯỜI ĐỨNG đề nghị mới là dữ liệu — lúc đó tham số quay lại, kèm
       chỗ để cất nó. */
    /* Labels looked up AFTER the write, outside the transaction: the body only
       carries ids, and the answer has to print names. One extra read per write
       is the right price — building labels from the draft would show the screen
       a name the server guessed rather than the one the catalog holds. */
    const productNames = (await this.repo.productsOf(handle, [code])).get(code) ?? []

    return OpportunityCreateResponse.parse(
      toContract({
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
        signed: false,
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
   *  ĐỌC QUA `byCode` ĐỂ CÓ CẢ HAI CÂU TỪ CHỐI, RỒI MỚI GHI
   *  ------------------------------------------------------------------
   *  Một `UPDATE … WHERE code = $1` kèm điều kiện phạm vi cũng chặn đúng người,
   *  và trả về đúng một câu: "không sửa được dòng nào". Câu đó gộp mất hai việc
   *  khác nhau — đơn không tồn tại (404, quay về sổ) và đơn không phải của bạn
   *  (403, đi hỏi người đứng đơn). Đọc trước thì máy chủ phân biệt được.
   *
   *  Dòng đọc ra cũng là thứ `fromUpdate` cần: đồng hồ của cột chỉ được dí lại
   *  khi cột THẬT SỰ đổi, mà "đổi so với cái gì" thì phải có dòng cũ mới biết.
   *
   *  ------------------------------------------------------------------
   *  ĐÚNG MỘT LƯỢT SỬA ĐƯỢC BẮN THƯ, VÀ NÓ LÀ LƯỢT CHUYỂN SANG THUA
   *  ------------------------------------------------------------------
   *  Bản trước không bắn thư nào từ đây, và ghi rõ điều kiện để có một lá: "sửa
   *  một ô không phải một sự kiện đáng bắn thư — bắn thì mỗi lần ai đó sửa
   *  chính tả tên đơn là một lá vào hộp thư chung, và hộp thư đó thôi được đọc
   *  sau tuần thứ hai." Điều kiện đó vẫn nguyên; thứ đổi là nay có một lượt sửa
   *  KHÔNG phải sửa một ô.
   *
   *  Vị từ là `becameLost`, không phải `lost`:
   *
   *      const becameLost = body.state === 'close-lost' && found.row.state !== 'close-lost'
   *
   *  `lost` một mình đúng ở MỌI lượt lưu một đơn đã thua — sửa lại câu lý do
   *  thua, thêm một người đứng đơn — nên nó chính là cái bẫy "một lá mỗi lượt
   *  sửa" mà đoạn trên cảnh báo, chỉ hẹp hơn một chút. Cùng hình với `moved` mà
   *  `fromUpdate` dùng để quyết định đồng hồ cột: câu hỏi luôn là "đổi so với
   *  dòng đang có", và đó là lý do dòng cũ phải được đọc trước.
   *
   *  KHÔNG có rule mới ở E4, và đó là điều đáng đọc: `opportunity-lost-internal`
   *  đã có sẵn, nghe cùng `OPPORTUNITY_OPENED`, tách bằng `when(data.lost)`.
   *  `flow` của nó (`opportunity-lost`) khác `flow` của lá "đơn mở"
   *  (`opportunity-open`), nên khoá `UNIQUE(event_key)` KHÔNG coi lá thứ hai là
   *  trùng — một đơn mở rồi thua sau này nhận đủ hai lá. Bảng rule đã tính
   *  trước đường này; đây chỉ là đường đó được nối vào.
   *
   *  Hệ quả của khoá đó, nói ra để không ai phát hiện trên production: một đơn
   *  thua → mở lại → thua lần nữa chỉ bắn ĐÚNG MỘT lá, mãi mãi. `event_key` là
   *  `opportunity-lost/internal/v1/<mã>` và `enqueue` là `onConflictDoNothing`.
   *  Đó là hành vi đúng — hộp thư chung không cần nghe cùng một đơn thua hai
   *  lần — nhưng nó là một quyết định, không phải một tai nạn. */
  async update(
    who: Actor,
    code: ObjectCode,
    body: OpportunityUpdate,
  ): Promise<OpportunityUpdateResponse> {
    const found = await this.repo.byCode(who, code)
    if (!found || !found.inScope) throw notFound('cơ hội', code)
    if (found.signed && body.state !== 'close-won') {
      throw conflict(`Cơ hội ${code} đã ký — sửa được thông tin nhưng không đổi được trạng thái.`, {
        state: ['Đơn đã ký'],
      })
    }
    if (!found.signed && body.state === 'close-won') {
      throw conflict('Chốt thắng bằng nút Ký hợp đồng', {
        state: ['Chốt thắng bằng nút Ký hợp đồng'],
      })
    }
    /* Money or SALE owners on a signed deal rewrite the contract, so they need
       the sign door's permission and scope; state is already pinned above. */
    if (found.signed && touchesSignTerms(found, body)) {
      const ref = scopeRefOf(found.row, found.owners, who.id)
      const verdict = this.access.check(who, { permission: 'opportunity.close', ref })
      if (!verdict.ok) throw denied(verdict.reason, verdict.note)
    }
    // A reopened deal on an exited lead would be an open deal the exit door refused to leave behind.
    if (found.row.state === 'close-lost' && body.state !== 'close-lost') {
      const lead = await this.repo.leadCompany(this.repo.readonlyHandle, found.row.leadCode)
      if (lead?.exited) throw conflict('Lead đã loại hoặc đã lưu trữ — không tạo được cơ hội')
    }

    const [names, signedContract, pendingSign] = await Promise.all([
      this.repo.actorNames(this.repo.readonlyHandle, [...body.saleOwners, ...body.bdOwners]),
      found.signed ? this.contracts.byOpportunity(code, found.row.leadCode) : null,
      this.pendingSign(code),
    ])
    if (pendingSign && touchesSignTerms(found, body)) throw frozenForSign()
    const now = new Date()
    const write = fromUpdate(body, found.row, now, found.signed)
    const ownerName =
      body.saleOwners.map((id) => names.get(id)).find((n) => n !== undefined) ?? null

    const becameLost = body.state === 'close-lost' && found.row.state !== 'close-lost'
    const stateChanged = write.values.state !== found.row.state

    const row = await this.repo.run(async (tx) => {
      await this.assertLockedAsRead(tx, code, found.signed, pendingSign)
      if (found.row.state === 'close-lost' && body.state !== 'close-lost') {
        await this.assertLeadsLive(tx, [found.row.leadCode])
      }
      /* Dòng gương cập nhật theo — `put` là upsert. Không cập nhật thì
         ContextRail vẫn in tên đơn cũ và cột cũ sau khi người dùng đã sửa, và
         không có gì đỏ để chỉ ra điều đó. */
      const ref = refOf(code, write, { label: write.values.name, ownerName })
      await this.mirror.put(tx, ref)
      const written = await this.repo.updateOpportunity(tx, code, write.values)
      await this.repo.replaceOwners(tx, code, ownerRowsOf(code, write))
      await this.repo.replaceProducts(tx, code, productRowsOf(code, write))
      if (signedContract) await this.syncContract(tx, found, body, signedContract, names)

      /* Chỉ ghi vết khi TRẠNG THÁI đổi. Sửa tên đơn, thêm một tệp, đổi ngày
         đóng — không cái nào là một mẩu lịch sử bán hàng, và ghi hết thì thẻ
         hoạt động thành một sổ nhật ký chỉnh sửa mà không ai đọc tới dòng thứ
         mười. Cùng ngưỡng mà `stage_since` dùng, và vì cùng lý do.

         Cột đọc từ dòng ĐÃ GHI (`written.stage`) chứ không từ bản nháp: đó là
         giá trị bảng thật sự đang giữ, và nó là thứ câu văn phải nói đúng. */
      if (stateChanged) {
        const moved = written.stage !== found.row.stage
        await this.touch.record(tx, [
          {
            subjectCode: code,
            subjectKind: 'opportunity',
            kind: 'stage-changed',
            ...byOf(who),
            note: moved
              ? NOTE.moved(found.row.stage, written.stage)
              : NOTE.restated(found.row.state, write.values.state ?? found.row.state),
          },
        ])

        /* A NARROWER threshold than the timeline row just above, and the gap is
           deliberate: the activity card records a state change that did not move
           the column too (a sentence a seller reads with meaning), while the
           history table records only a deal that REALLY left a column. Writing
           both here would ruin the very number this table exists to answer —
           "average days spent in a column" would start counting moves that went
           nowhere. */
        if (moved) {
          await this.repo.insertStageEvent(
            tx,
            stageEventOf({
              code,
              from: found.row.stage,
              to: written.stage,
              stageSince: found.row.stageSince,
              at: now,
              by: { id: who.id, name: who.name },
              note: NOTE.moved(found.row.stage, written.stage),
            }),
          )
        }
      }

      if (becameLost) await this.notify(tx, ref, true)
      /* Losing or reopening a deal can end or reopen its run. */
      if (stateChanged && written.workstreamCode) {
        await this.workstreams.syncClosed(tx, [written.workstreamCode])
      }
      return written
    })

    const productNames =
      (await this.repo.productsOf(this.repo.readonlyHandle, [code])).get(code) ?? []

    return OpportunityUpdateResponse.parse(
      toContract({
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
        signed: found.signed,
        daysInStage: daysInStageOf(row, new Date()),
        products: productNames,
      }),
    )
  }

  /** `PATCH /sales/opportunities/:code/stage` — drag a deal to another column.
   *
   *  ------------------------------------------------------------------
   *  THIS DOOR IS WHAT OPENS THE TWO COLUMNS NOBODY COULD REACH
   *  ------------------------------------------------------------------
   *  Before it, `stage` could only be written INDIRECTLY, through `state` and
   *  the `STAGE_OF_STATE` table. That table covers three of the five columns —
   *  no state maps to 'new' or 'demo-done' — so the board had five columns and
   *  only three of them writable. Full reasoning is in the docblock of
   *  `OpportunityStageMove` in the contract.
   *
   *  It does NOT touch `state`, and that is the important half: dragging a card
   *  between the first two columns does not change what the seller is doing.
   *  This door also touches neither money, nor owners, nor the close date — the
   *  cheapest gesture in the product must not be the one that overwrites a
   *  deal's value.
   *
   *  A DEAL THAT HAS LEFT THE BOARD IS REFUSED. A signed or lost deal stands in
   *  no column (`stage` NULL), and dragging it back onto the board through this
   *  door would reopen a closed deal without any signature being withdrawn —
   *  making the book lie about a contract that exists. Reopening is a different
   *  operation, and nobody has asked for it. */
  async moveStage(
    who: Actor,
    code: ObjectCode,
    body: OpportunityStageMove,
  ): Promise<OpportunityUpdateResponse> {
    const found = await this.repo.byCode(who, code)
    if (!found || !found.inScope) throw notFound('cơ hội', code)

    if (found.signed || found.row.closedAt !== null) {
      throw conflict(
        `Cơ hội ${code} đã đóng sổ nên không còn đứng ở cột nào — mở lại đơn trước khi chuyển cột.`,
        { stage: ['Đơn đã đóng'] },
      )
    }

    /* Dragging back onto the column the deal already stands in is a no-op.
       Return the current row rather than write an empty history entry:
       `opportunity_stage_event_moved` would refuse it, and a 500 for a card
       dropped back where it was is the wrong answer. */
    if (found.row.stage === body.stage) {
      return OpportunityUpdateResponse.parse(toContract(found))
    }
    if (await this.pendingSign(code)) throw frozenForSign()

    const now = new Date()

    const row = await this.repo.run(async (tx) => {
      await this.assertLockedAsRead(tx, code, false, false)
      const written = await this.repo.updateOpportunity(tx, code, {
        stage: body.stage,
        /* The column clock is reset — this IS a column move, exactly what
           `stage_since` exists to measure. */
        stageSince: now,
      })

      await this.repo.insertStageEvent(
        tx,
        stageEventOf({
          code,
          from: found.row.stage,
          to: body.stage,
          stageSince: found.row.stageSince,
          at: now,
          by: { id: who.id, name: who.name },
          note: body.note ?? NOTE.moved(found.row.stage, body.stage),
        }),
      )

      await this.touch.record(tx, [
        {
          subjectCode: code,
          subjectKind: 'opportunity',
          kind: 'stage-changed',
          ...byOf(who),
          note: body.note ?? NOTE.moved(found.row.stage, body.stage),
        },
      ])

      /* The mirror row carries E1's `state`, and `toRef` builds it from the
         column — so moving the column moves what the ContextRail prints. */
      await this.mirror.put(tx, toRef(written, found.owners[0]?.name ?? null))
      return written
    })

    return OpportunityUpdateResponse.parse(
      toContract({
        row,
        account: found.account,
        owners: found.owners,
        signed: false,
        daysInStage: daysInStageOf(row, now),
        products: found.products,
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
  async importPreview(body: OpportunityImportBody): Promise<OpportunityImportPreviewResponse> {
    const { report } = await this.check(this.repo.readonlyHandle, body)
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
    const { report, writes, workstreamByLead } = await this.check(handle, body)

    /* Mã cấp TRƯỚC khi mở transaction, một câu cho cả lô — lý do đầy đủ ở
       `nextCodes`. Dãy trả theo thứ tự tăng nên thứ tự của tệp cũng là thứ tự
       của mã, không cần sắp lại như lô nạp lead phải làm. */
    const codes = await this.repo.nextCodes(writes.length)
    const now = new Date()

    const names = await this.repo.actorNames(
      handle,
      writes.flatMap((w) => [...w.saleOwners, ...w.bdOwners]),
    )

    /* Dòng, dòng gương, bảng nối và lần chạm dựng CÙNG một lượt, từ cùng một
       bản nháp và cùng một mã — bốn thứ không lệch nhau bằng một chỉ số được. */
    const ready = writes.map((write, i) => {
      const code = codes[i] ?? ''
      const draft = fromCreate(write, now, workstreamByLead.get(write.leadCode) ?? null)
      const ownerName =
        write.saleOwners.map((id) => names.get(id)).find((n) => n !== undefined) ?? null

      return {
        code,
        row: { ...draft.values, code },
        ref: refOf(code, draft, { label: draft.values.name, ownerName }),
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
           that pair. A deal opened straight into 'close-lost' stands in no
           column and gets no history row at all, exactly as at the create
           door. */
        /* `?? null` rather than an `=== null` test: `OpportunityValues` is
           inferred from `$inferInsert`, so a nullable column there is
           `StageKey | undefined` and not `| null` — skip this and `undefined`
           reaches `stageEventOf`, writing a history row for a column that does
           not exist. */
        stageEvent:
          (draft.values.stage ?? null) === null
            ? null
            : stageEventOf({
                code,
                from: null,
                to: draft.values.stage ?? null,
                stageSince: null,
                at: now,
                by: { id: who.id, name: who.name },
                note: NOTE.opened(write.leadCode, write.state),
              }),
        touches: [
          {
            subjectCode: code,
            subjectKind: 'opportunity' as const,
            kind: 'entered-pipeline' as const,
            ...byOf(who),
            note: NOTE.opened(write.leadCode, write.state),
          },
          {
            subjectCode: write.leadCode,
            subjectKind: 'lead' as const,
            kind: 'entered-pipeline' as const,
            ...byOf(who),
            note: NOTE.promoted(code, write.name),
          },
        ] satisfies TouchEntry[],
      }
    })

    const batch = await this.repo.run(async (tx) => {
      await this.assertLeadsLive(tx, [...new Set(ready.map((p) => p.row.leadCode))])
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
          slice.map((p) => p.row),
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
          slice.flatMap((p) => (p.stageEvent === null ? [] : [p.stageEvent])),
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
      }),
      workstreamByLead: leads.workstreamByLead,
    }
  }

  private async pendingSign(code: string): Promise<boolean> {
    return (await this.approvals.pendingOn(code)).some((a) => a.kind === 'contract-sign')
  }

  /** Inside the write's transaction: lock the deal, and refuse if signing or a
   *  sign request landed between the pre-transaction checks and the lock. */
  private async assertLockedAsRead(
    tx: Db,
    code: string,
    signed: boolean,
    pendingSign: boolean,
  ): Promise<void> {
    const locked = await this.repo.lockDeal(tx, code)
    if (!locked) throw notFound('cơ hội', code)
    if (locked.signed !== signed || locked.pendingSign !== pendingSign) {
      throw conflict(`Cơ hội ${code} vừa được ký hoặc gửi duyệt ký — tải lại rồi thử lại.`)
    }
  }

  /** Share-lock the leads a deal write lands on; an exit racing it waits. */
  private async assertLeadsLive(tx: Db, leadCodes: readonly string[]): Promise<void> {
    const exited = await this.repo.exitedLocked(tx, leadCodes)
    if (exited.length > 0) throw conflict('Lead đã loại hoặc đã lưu trữ — không tạo được cơ hội')
  }

  /** A signed deal's edit carries its money and commission holder onto the
   *  contract, in the edit's transaction (ADR 0057 §1). The holder moves only
   *  when they are no longer a SALE owner — one hand-picked in the sign drawer
   *  survives a reorder. The contract's mirror row carries both, so it moves. */
  private async syncContract(
    tx: Db,
    found: OpportunityRead,
    body: OpportunityUpdate,
    signed: ContractRead,
    names: ReadonlyMap<string, string>,
  ): Promise<void> {
    const moneyChanged = body.amount !== found.row.amount || body.currency !== found.row.currency
    const main = body.saleOwners[0] ?? null
    const ownerChanged =
      signed.row.ownerId === null || !body.saleOwners.includes(signed.row.ownerId)
    if (!moneyChanged && !ownerChanged) return

    const row = await this.contracts.updateTerms(tx, signed.row.code, {
      ...(moneyChanged ? { amount: body.amount, currency: body.currency } : {}),
      ...(ownerChanged ? { ownerId: main } : {}),
    })
    const ownerName = ownerChanged
      ? main === null
        ? null
        : (names.get(main) ?? null)
      : signed.ownerName
    await this.mirror.put(tx, {
      code: row.code,
      kind: 'HĐ',
      branch: 'Sales',
      label: `${found.account} · ${body.name}`,
      ...(ownerName ? { owner: ownerName } : {}),
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
   *  khỏi máy (xem `env.ts`). */
  private async notify(tx: Db, ref: ObjectRef, lost: boolean): Promise<void> {
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

/** While a sign request waits, the terms the approver read are frozen: state,
 *  money and SALE owners. Name, dates, files and the rest may still be saved. */
function touchesSignTerms(found: OpportunityRead, body: OpportunityUpdate): boolean {
  const sale = found.owners.filter((o) => o.role === 'SALE').map((o) => o.id)
  return (
    body.state !== (found.signed ? 'close-won' : found.row.state) ||
    body.amount !== found.row.amount ||
    body.currency !== found.row.currency ||
    sale.length !== body.saleOwners.length ||
    sale.some((id) => !body.saleOwners.includes(id))
  )
}

const frozenForSign = () =>
  conflict('Cơ hội đang chờ duyệt ký — chờ duyệt hoặc từ chối đề nghị trước khi sửa')
