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
  OpportunityScorecard,
  OpportunityUpdateResponse,
  type ContractSign,
  type MaObject,
  type OpportunityBookQuery,
  type OpportunityCreate,
  type OpportunityImportBody,
  type OpportunityUpdate,
  type TouchTimelineResponse,
} from '@pv/contracts'
import { ENV, type Env } from '@api/platform/config/env'
import type { Db } from '@api/platform/db/db.module'
import { ACCESS } from '@api/platform/engines/tokens'
import { conflict, denied, notFound } from '@api/platform/http/problem'
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
  refOf,
  toContract,
  toRef,
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
       một endpoint quên `scoped: true`, không còn gì đỡ. */
    const items = page.rows.map((r) => ({
      ...r,
      ref: toRef(r.row, r.owners[0]?.name ?? null),
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

  /** Một đơn theo mã. Hai cách hỏng, và chúng không gộp được.
   *
   *  404 là "không có đơn này", 403 là "đơn không phải của bạn" — hai câu dẫn
   *  tới hai việc khác nhau cho người đang đọc màn, nên máy chủ phải phân biệt
   *  được. Sổ trả lời người ngoài phạm vi bằng cách bớt dòng và báo `hidden`;
   *  một hồ sơ chỉ có đúng một dòng nên không có gì để bớt. */
  async profile(who: Actor, code: MaObject): Promise<OpportunityCreateResponse> {
    const found = await this.repo.byCode(who, code)
    if (!found) throw notFound('cơ hội', code)
    if (!found.inScope) throw denied('out-of-scope')

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

    const write = fromCreate(body, new Date())
    const code = await this.repo.nextCode()
    const ownerName =
      body.saleOwners.map((id) => names.get(id)).find((n) => n !== undefined) ?? null

    const row = await this.repo.run(async (tx) => {
      const ref = refOf(code, write, { label: write.values.name, ownerName })
      await this.mirror.put(tx, ref)
      const written = await this.repo.insertOpportunity(tx, { ...write.values, code })
      await this.repo.insertOwners(tx, ownerRowsOf(code, write))

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
    if (!found) throw notFound('cơ hội', code)
    if (!found.inScope) throw denied('out-of-scope')

    const names = await this.repo.actorNames(this.repo.readonlyHandle, [
      ...body.saleOwners,
      ...body.bdOwners,
    ])
    const write = fromUpdate(body, found.row, new Date())
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
      }

      if (becameLost) await this.notify(tx, ref, true)
      return written
    })

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
      }),
    )
  }

  /** `GET /sales/opportunities/:code/touches` — dòng thời gian của một đơn.
   *
   *  Đi qua `byCode` trước rồi mới hỏi bảng lần chạm, và một danh sách rỗng
   *  KHÔNG được dùng thay cho hai câu từ chối: rỗng là câu trả lời THẬT — một
   *  đơn vừa mở có đúng một dòng, một đơn nạp từ tệp có đúng một dòng — nên nó
   *  không được kiêm nghĩa "không có đơn này" hay "đơn không phải của bạn".
   *  Cùng lý lẽ mà `LeadService.mailTimeline` đã viết ra đầy đủ, và cùng cái
   *  giá: một câu truy vấn thừa trên một màn vốn đang tải sẵn hồ sơ. */
  async touches(who: Actor, code: MaObject): Promise<TouchTimelineResponse> {
    const found = await this.repo.byCode(who, code)
    if (!found) throw notFound('cơ hội', code)
    if (!found.inScope) throw denied('out-of-scope')

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
    if (!found) throw notFound('cơ hội', code)
    if (!found.inScope) throw denied('out-of-scope')

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
