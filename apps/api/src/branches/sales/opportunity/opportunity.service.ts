import { Inject, Injectable } from '@nestjs/common'
import {
  AUDIENCE_INTERNAL,
  OPPORTUNITY_OPENED,
  plan,
  type AccessControl,
  type Actor,
  type ObjectRef,
} from '@pv/engines'
import {
  ContractSignResponse,
  OpportunityBookResponse,
  OpportunityCreateResponse,
  OpportunityImportCommitResponse,
  OpportunityImportPreviewResponse,
  OpportunityLiveDeal,
  OpportunityScorecard,
  OpportunityStageHistory,
  OpportunityUpdateResponse,
  type ContractSign,
  type MaObject,
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
import { conflict, notFound } from '@api/platform/http/problem'
import { ObjectMirror } from '@api/platform/graph/object-mirror'
import { MAIL_ENQUEUE, type MailEnqueue } from '@api/platform/mail/mail.contract'
import { ContractRepository } from '../contract/contract.repository'
import { fromSign, toContract as toContractRow } from '../contract/contract.mapper'
import { byOf, TouchService, type TouchEntry } from '../touch/touch.service'
import { checkBatch, fold, type ImportCheck } from './opportunity-import.check'
import {
  closeForSign,
  fromCreate,
  fromUpdate,
  daysInStageOf,
  NOTE,
  ownerRowsOf,
  productRowsOf,
  refOf,
  stageEventOf,
  toContract,
  toRef,
  toStageEvent,
} from './opportunity.mapper'
import { OpportunityRepository } from './opportunity.repository'

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
    private readonly touch: TouchService,
    private readonly mirror: ObjectMirror,
    @Inject(ACCESS) private readonly access: AccessControl,
    @Inject(MAIL_ENQUEUE) private readonly mail: MailEnqueue,
    @Inject(ENV) private readonly env: Env,
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
      ref: toRef(r.row, (r.owners.find((o) => o.id === who.id) ?? r.owners[0])?.name ?? null),
    }))
    const { visible, hidden } = this.access.visible(who, items)

    /* Kiểm chính dữ liệu MÌNH trả ra bằng hợp đồng. Một cột đổi kiểu, một
       trường quên map — cả hai lọt qua `tsc` nếu mapper sai theo, không lọt qua
       đây. Phí bị chặn trên bởi `size` tối đa 200 dòng. */
    return OpportunityBookResponse.parse({
      rows: visible.map((v) => toContract(v)),
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
   *  cho từng người. Cửa vẫn đòi `cơ-hội.xem`; ai không được vào sổ thì cũng
   *  không thấy thẻ. Lập luận đầy đủ ở `LeadService.scorecard`.
   *
   *  Hệ quả phải nói ra: con số ở đây KHÔNG khớp `total` của sổ mà một người
   *  `ownOnly` đang nhìn, vì sổ của họ đã bị trục phạm vi cắt. Hai con số trả
   *  lời hai câu khác nhau, và màn in chúng dưới hai nhãn khác nhau. */
  async scorecard(): Promise<OpportunityScorecard> {
    return OpportunityScorecard.parse(await this.repo.scorecard())
  }

  /** "Lead này đã có đơn CÒN SỐNG chưa" — `GET /sales/opportunities/live-deal`.
   *
   *  ------------------------------------------------------------------
   *  CỬA NÀY CỐ Ý BỎ TRỤC PHẠM VI, VÀ NÓ TRẢ GIÁ BẰNG CÁCH TRẢ RẤT ÍT
   *  ------------------------------------------------------------------
   *  Hồ sơ lead phải trả lời câu này TRƯỚC khi bày nút "Chuyển thành cơ hội",
   *  và cho tới hôm nay nó hỏi bằng chính cửa sổ — `GET /sales/opportunities?
   *  leadCode=…`, thứ khai `scoped: true`. `scoped` đúng cho một cái SỔ và sai
   *  chí mạng cho một CHỐT CHẶN: Sale A đổi LD-0042 thành OP-5001, Sale B (cũng
   *  `ownOnly`) mở LD-0042, trục phạm vi cắt mất OP-5001, màn đọc danh sách
   *  rỗng đó thành "chưa ai đổi lead này". Nút sáng, `POST /sales/opportunities`
   *  chỉ đòi `cơ-hội.sửa` và KHÔNG kiểm trùng, và một khách có hai đơn. Một
   *  chốt chặn giấu đi đúng cái dòng nó sinh ra để tìm thì không phải chốt chặn.
   *
   *  Nên cửa này KHÔNG nhận `Actor` và không cắt theo phạm vi. Giá của việc đó
   *  trả bằng hình dữ liệu: nó rò đúng MỘT mã đơn, không rò tên người đứng đơn
   *  (thứ mà trục phạm vi vốn để che), không rò tiền, không rò trạng thái,
   *  không rò khách. Đủ để tắt một cái nút và để đi tới đúng đơn đó — hết. Cửa
   *  vẫn đòi `cơ-hội.xem`: ai không được vào sổ thì cũng không hỏi được câu này.
   *  Lập luận đầy đủ ở docblock của `OpportunityLiveDeal` (`@pv/contracts`).
   *
   *  ------------------------------------------------------------------
   *  "CÒN SỐNG", KHÔNG PHẢI "TỪNG TỒN TẠI"
   *  ------------------------------------------------------------------
   *  Đi thẳng qua `liveDealsByLead` — CHÍNH vị từ mà cửa nạp tệp gọi là trùng:
   *  `state <> 'close-lost'` và chưa ký. Dùng lại nó chứ không viết vị từ thứ
   *  hai, vì hai vị từ là hai câu trả lời sẽ lệch nhau, và chúng ĐANG lệch: màn
   *  chặn theo bất kỳ đơn nào từng tồn tại, nên một lead có đúng một đơn đã thua
   *  quý I thì quý III khách quay lại vẫn không đổi được nữa — vĩnh viễn — trong
   *  khi lô nạp lại nhận đúng dòng ấy. Một khách quay lại là một đơn MỚI.
   *
   *  Nhiều đơn sống cùng lúc thì lấy mã NHỎ NHẤT, vì `liveDealsByLead` đã
   *  `ORDER BY code` và giữ dòng đầu: nút chỉ có một chỗ để đi tới, và thứ tự
   *  đó ổn định giữa hai lần đọc. */
  async liveDeal(leadCode: MaObject): Promise<OpportunityLiveDeal> {
    const byLead = await this.repo.liveDealsByLead(this.repo.readonlyHandle, [leadCode])
    return OpportunityLiveDeal.parse({ code: byLead.get(leadCode) ?? null })
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
  async profile(who: Actor, code: MaObject): Promise<OpportunityCreateResponse> {
    const found = await this.repo.byCode(who, code)
    if (!found || !found.inScope) throw notFound('cơ hội', code)

    return OpportunityCreateResponse.parse(toContract(found))
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

    const [account, names] = await Promise.all([
      this.repo.leadCompany(handle, body.leadCode),
      this.repo.actorNames(handle, [...body.saleOwners, ...body.bdOwners]),
    ])
    if (account === null) throw notFound('lead', body.leadCode)

    /* ONE instant for the whole write. `new Date()` used to sit inline in the
       `fromCreate` call, which was enough while one place needed it; the column
       history row now needs that same instant, and two `new Date()` a few
       milliseconds apart are two answers to "when did this deal enter the
       column". */
    const now = new Date()
    const write = fromCreate(body, now)
    const code = await this.repo.nextCode()
    const ownerName =
      body.saleOwners.map((id) => names.get(id)).find((n) => n !== undefined) ?? null

    const row = await this.repo.run(async (tx) => {
      /* MỘT LEAD, MỘT ĐƠN CÒN SỐNG — chốt ở CỬA GHI, không chỉ ở cái nút.
         ------------------------------------------------------------------
         Màn đã tắt nút khi `liveDeal` trả về một mã, nhưng một cái nút tắt
         không phải là một hàng rào: double-click, một tab mở từ sáng, hay một
         lượt gọi thẳng API đều đi vòng qua nó, và cái sinh ra là hai đơn cho
         cùng một khách — sổ cộng ra một con số không có thật, hoa hồng chia
         hai lần.

         Cửa NẠP TỆP đã từ chối đúng ca này từ đầu (`dupWithBook`), nên tới
         hôm nay hai đường vào cùng một bảng trả lời ngược nhau: lô nạp nói
         "khách này đã có đơn đang mở", phiếu tay nói "được". Một bảng thì một
         luật.

         Dùng lại CHÍNH `liveDealsByLead` mà cả `liveDeal` lẫn cửa nạp tệp gọi
         — ba chỗ, một vị từ. Viết vị từ thứ hai ở đây là dựng chỗ để chúng
         lệch nhau, và lệch kiểu này thì không ai thấy cho tới lúc sổ sai.

         TRONG transaction, không phải trước nó: kiểm ngoài rồi ghi trong để
         hở đúng cái khe mà double-click rơi vào.

         Nói thẳng phần CÒN HỞ: đây vẫn không phải hàng rào ở tầng bảng. Hai
         transaction đồng thời ở READ COMMITTED đều có thể thấy "chưa có đơn
         sống" rồi cùng ghi. Một unique index bộ phận trên `lead_code` sẽ đóng
         hẳn khe đó, nhưng nó KHÔNG diễn đạt được vế "chưa ký" — vế ấy nằm ở
         `sales.contract`, một bảng khác, mà index bộ phận thì không với sang
         bảng khác được. Đóng nốt khe này là một quyết định về lược đồ (dựng
         cột phi chuẩn hoá `signed`, hoặc khoá theo lead), không phải một dòng
         thêm vào đây. */
      const live = await this.repo.liveDealsByLead(tx, [body.leadCode])
      const opened = live.get(body.leadCode)
      if (opened !== undefined) {
        throw conflict(
          `Lead ${body.leadCode} đã có cơ hội đang mở (${opened}) — đóng đơn đó trước khi mở đơn mới.`,
          { leadCode: [`Đơn đang mở: ${opened}`] },
        )
      }

      const ref = refOf(code, write, { label: write.values.name, ownerName })
      await this.mirror.put(tx, ref)
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
          kind: 'vao-pipeline',
          ...byOf(who),
          note: NOTE.opened(body.leadCode, body.state),
        },
        {
          subjectCode: body.leadCode,
          subjectKind: 'lead',
          kind: 'vao-pipeline',
          ...byOf(who),
          note: NOTE.promoted(code, write.values.name),
        },
      ])

      await this.notify(tx, ref, body.state === 'close-lost')
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
        account,
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
    code: MaObject,
    body: OpportunityUpdate,
  ): Promise<OpportunityUpdateResponse> {
    const found = await this.repo.byCode(who, code)
    if (!found || !found.inScope) throw notFound('cơ hội', code)

    const names = await this.repo.actorNames(this.repo.readonlyHandle, [
      ...body.saleOwners,
      ...body.bdOwners,
    ])
    const now = new Date()
    const write = fromUpdate(body, found.row, now)
    const ownerName =
      body.saleOwners.map((id) => names.get(id)).find((n) => n !== undefined) ?? null

    const becameLost = body.state === 'close-lost' && found.row.state !== 'close-lost'
    const stateChanged = body.state !== found.row.state

    const row = await this.repo.run(async (tx) => {
      /* Dòng gương cập nhật theo — `put` là upsert. Không cập nhật thì
         ContextRail vẫn in tên đơn cũ và cột cũ sau khi người dùng đã sửa, và
         không có gì đỏ để chỉ ra điều đó. */
      const ref = refOf(code, write, { label: write.values.name, ownerName })
      await this.mirror.put(tx, ref)
      const written = await this.repo.updateOpportunity(tx, code, write.values)
      await this.repo.replaceOwners(tx, code, ownerRowsOf(code, write))
      await this.repo.replaceProducts(tx, code, productRowsOf(code, write))

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
            kind: 'doi-cot',
            ...byOf(who),
            note: moved
              ? NOTE.moved(found.row.stage, written.stage)
              : NOTE.restated(found.row.state, body.state),
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
   *  no state maps to 'moi' or 'da-demo' — so the board had five columns and
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
    code: MaObject,
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

    const now = new Date()

    const row = await this.repo.run(async (tx) => {
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
          kind: 'doi-cot',
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
  async stageHistory(who: Actor, code: MaObject): Promise<OpportunityStageHistory> {
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
  async touches(who: Actor, code: MaObject): Promise<TouchTimelineResponse> {
    const found = await this.repo.byCode(who, code)
    if (!found || !found.inScope) throw notFound('cơ hội', code)

    return this.touch.timeline(code)
  }

  /** `POST /sales/opportunities/:code/contract` — ký.
   *
   *  ------------------------------------------------------------------
   *  HAI CÂU TỪ CHỐI LÀ 409, KHÔNG PHẢI 400
   *  ------------------------------------------------------------------
   *  "Đơn này đã ký" và "đơn này đã thua" không nói về thân request — thân đó
   *  hoàn toàn hợp lệ, và gửi lại y nguyên sau khi mở lại đơn thì nó chạy. Cái
   *  sai là TRẠNG THÁI của tài nguyên, và đó đúng là định nghĩa của 409. Trả
   *  400 sẽ bắt màn tô đỏ một ô, mà không ô nào sai.
   *
   *  Câu "đã ký" chở luôn mã hợp đồng đã có. Người bấm nút hai lần cần biết
   *  cái đã tồn tại là cái nào, không phải chỉ biết mình bấm thừa.
   *
   *  ------------------------------------------------------------------
   *  KHÔNG CÓ CỬA HUỶ KÝ, VÀ ĐÓ LÀ CHỦ Ý
   *  ------------------------------------------------------------------
   *  Ký là thứ đi ra khỏi phòng kinh doanh — hợp đồng đã sang tay kế toán và
   *  sang tay khách. Một `DELETE` ở đây là một nút xoá doanh số, và nó phải là
   *  một đề nghị có người duyệt (E3), không phải một lượt gọi của người vừa lỡ
   *  tay. Cho tới lúc có E3, gỡ một chữ ký là việc của người có quyền vào
   *  database, và điều đó đúng.
   *
   *  ------------------------------------------------------------------
   *  BA LƯỢT GHI, MỘT COMMIT
   *  ------------------------------------------------------------------
   *  Dòng hợp đồng, cột của đơn (`stage`/`stage_since`/`closed_at`), và hai
   *  dòng gương E1. Nửa vời thì sổ tự mâu thuẫn theo cách khó gỡ nhất: một đơn
   *  `signed` mà vẫn đứng trong cột "Chờ ký", hoặc một hợp đồng trỏ vào một đơn
   *  bảng vẫn coi là đang chạy. */
  async sign(who: Actor, code: MaObject, body: ContractSign): Promise<ContractSignResponse> {
    const found = await this.repo.byCode(who, code)
    if (!found || !found.inScope) throw notFound('cơ hội', code)

    if (found.signed) {
      const existing = await this.contracts.byOpportunity(code, found.row.leadCode)
      throw conflict(
        existing
          ? `Cơ hội ${code} đã ký — hợp đồng ${existing.row.code}.`
          : `Cơ hội ${code} đã ký.`,
      )
    }
    if (found.row.state === 'close-lost') {
      throw conflict(`Cơ hội ${code} đã thua — mở lại đơn trước khi ký.`)
    }

    const saleOwner = found.owners.find((o) => o.role === 'SALE') ?? null
    const contractCode = await this.contracts.nextCode()
    const values = fromSign(body, contractCode, found.row, saleOwner?.id ?? null, new Date())
    const signedAt = values.signedAt

    /* Tên người ăn hoa hồng. Đọc chứ không suy: `ownerId` có thể đến từ thân
       request và trỏ vào một người không nằm trong danh sách đứng đơn.
       `?? null` gộp hai cách vắng mặt của cột — `undefined` (mapper bỏ trường)
       và `null` (giá trị NULL) — thành một, vì ở đây chúng nói cùng một câu. */
    const ownerId = values.ownerId ?? null
    const names = await this.repo.actorNames(
      this.repo.readonlyHandle,
      ownerId === null ? [] : [ownerId],
    )
    const ownerName = ownerId === null ? null : (names.get(ownerId) ?? null)

    const done = await this.repo.run(async (tx) => {
      const row = await this.repo.updateOpportunity(tx, code, closeForSign(signedAt))
      const contractRow = await this.contracts.insert(tx, values)

      /* THE LAST HISTORY ROW — `to: null`, the deal leaving the board because
         it was signed. Without it the funnel has an entry step and no exit
         step: every won deal vanishes from the final column with no row saying
         where it went, and "how many deals turned into contracts" — the one
         question the funnel exists to answer — cannot be computed. A deal
         standing in no column (`stage` NULL, e.g. one opened straight into the
         lost state and signed anyway) is skipped: a `null -> null` row is
         refused by `opportunity_stage_event_moved`, exactly as it should be. */
      if (found.row.stage !== null) {
        await this.repo.insertStageEvent(
          tx,
          stageEventOf({
            code,
            from: found.row.stage,
            to: null,
            stageSince: found.row.stageSince,
            at: signedAt,
            by: { id: who.id, name: who.name },
            note: NOTE.signed(contractCode),
          }),
        )
      }

      /* Đơn ra khỏi bảng năm cột, nên dòng gương của nó thôi chở `state` — và
         `toRef` đọc `row.stage`, thứ vừa thành NULL. */
      await this.mirror.put(tx, toRef(row, saleOwner?.name ?? null))

      /* Hợp đồng là một object E1 của chính nó (`kind: 'HĐ'`). Không có nó thì
         ContextRail đi hết chuỗi lead → cơ hội rồi dừng ngay trước mắt xích
         người ta mở màn để tìm. Cạnh nối hai object thì CHƯA ghi: chưa cửa nào
         trong `apps/api` ghi `platform.edge` — seed là chỗ duy nhất — nên dựng
         một cạnh ở đây là mở một quy ước mới trong một cửa, không phải trong
         `GraphModule` nơi nó thuộc về. */
      await this.mirror.put(tx, {
        code: contractCode,
        kind: 'HĐ',
        branch: 'Sales',
        label: `${found.account} · ${row.name}`,
        ...(ownerName ? { owner: ownerName } : {}),
        ...(contractRow.amount === null ? {} : { amount: contractRow.amount }),
      })

      /* `at: signedAt` chứ không để `now()` mặc định: một hợp đồng vào sổ muộn
         ba ngày phải nằm đúng chỗ của nó trên dòng thời gian, không nhảy lên
         đầu. Đây là chỗ duy nhất trong nhánh đặt `at` bằng tay, và lý do là
         cột `signed_at` mang một mốc thật do người nhập biết. */
      await this.touch.record(tx, [
        {
          subjectCode: code,
          subjectKind: 'opportunity',
          kind: 'ky',
          ...byOf(who),
          note: NOTE.signed(contractCode),
          at: signedAt,
        },
        {
          subjectCode: row.leadCode,
          subjectKind: 'lead',
          kind: 'ky',
          ...byOf(who),
          note: NOTE.signed(contractCode),
          at: signedAt,
        },
      ])

      return { row, contractRow }
    })

    return ContractSignResponse.parse({
      opportunity: toContract({
        row: done.row,
        account: found.account,
        owners: found.owners,
        /* Biết chứ không hỏi lại: dòng hợp đồng vừa được ghi trong chính
           transaction vừa commit. `toContract` đọc cờ này để lắp trạng thái thứ
           năm — cùng phép mà `create` dùng để nói `signed: false`. */
        signed: true,
        /* Đi CÙNG `signed`, không để một mình. Ba đường đọc (`book`, `byCode`,
           `forMail`) lấy cả hai từ một `LEFT JOIN`, nên chúng không lệch được;
           câu trả lời của cửa ký thì lắp tay, và bỏ trường này ở đây là dựng ra
           một đơn `close-won` KHÔNG có mã hợp đồng — hình mà không lượt đọc nào
           sinh ra nổi. Màn nào tin vào bất biến "đã ký thì có mã" sẽ vỡ đúng
           một lần, ngay sau cú bấm ký, rồi tự lành ở lượt đọc kế tiếp: đúng
           loại lỗi không ai tái hiện được. */
        contractCode: done.contractRow.code,
        daysInStage: null,
        /* Signing does not touch the product join table, so the list read
           alongside the row is still correct — carry it back rather than ask a
           second time. */
        products: found.products,
      }),
      contract: toContractRow(done.contractRow, ownerName),
    })
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
    const { report, writes } = await this.check(handle, body)

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
      const draft = fromCreate(write, now)
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
            kind: 'vao-pipeline' as const,
            ...byOf(who),
            note: NOTE.opened(write.leadCode, write.state),
          },
          {
            subjectCode: write.leadCode,
            subjectKind: 'lead' as const,
            kind: 'vao-pipeline' as const,
            ...byOf(who),
            note: NOTE.promoted(code, write.name),
          },
        ] satisfies TouchEntry[],
      }
    })

    const batch = await this.repo.run(async (tx) => {
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
  private async check(handle: Db, body: OpportunityImportBody): Promise<ImportCheck> {
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

    return checkBatch({
      rows: body.rows,
      staff,
      leadByCompany: leads.byCompany,
      ambiguousCompany: leads.ambiguous,
      liveDealByLead,
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
