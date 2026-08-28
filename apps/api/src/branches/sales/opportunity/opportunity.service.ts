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
  OpportunityBookResponse,
  OpportunityCreateResponse,
  OpportunityUpdateResponse,
  type MaObject,
  type OpportunityCreate,
  type OpportunityUpdate,
  type PageQuery,
} from '@pv/contracts'
import { ENV, type Env } from '@api/platform/config/env'
import type { Db } from '@api/platform/db/db.module'
import { ACCESS } from '@api/platform/engines/tokens'
import { denied, notFound } from '@api/platform/http/problem'
import { ObjectMirror } from '@api/platform/graph/object-mirror'
import { MAIL_ENQUEUE, type MailEnqueue } from '@api/platform/mail/mail.contract'
import {
  fromCreate,
  fromUpdate,
  daysInStageOf,
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
    private readonly mirror: ObjectMirror,
    @Inject(ACCESS) private readonly access: AccessControl,
    @Inject(MAIL_ENQUEUE) private readonly mail: MailEnqueue,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async book(who: Actor, q: PageQuery): Promise<OpportunityBookResponse> {
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

  /** `POST /sales/ops` — đổi một lead thành cơ hội.
   *
   *  Lead được đọc TRƯỚC khi ghi vì hai lý do khác nhau, và chỉ một trong hai
   *  là hàng rào: câu trả lời là một dòng sổ đầy đủ, mà dòng sổ in TÊN khách
   *  chứ không in mã; và một mã lead không có thật đáng nhận 404 gọi tên nó
   *  chứ không phải 500 của khoá ngoại. Tên người đứng đơn đọc cùng lúc, vì
   *  `platform.object` chở nhãn còn bảng nối chở id.
   *
   *  Không kiểm "actor này có thật không" ở đây: khoá ngoại của bảng nối làm
   *  việc đó cho MỌI cửa, kể cả cửa ai đó viết sau này và quên đoạn kiểm. Nửa
   *  hàng rào ở tầng service là thứ ru ngủ người đọc tiếp theo. */
  async create(body: OpportunityCreate): Promise<OpportunityCreateResponse> {
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

  /** `PATCH /sales/ops/:code` — lưu phiếu ở hồ sơ cơ hội.
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
   *  KHÔNG có mail nào ở đây. Cửa tạo báo "một cơ hội vừa mở"; sửa một ô không
   *  phải một sự kiện đáng bắn thư — bắn thì mỗi lần ai đó sửa chính tả tên đơn
   *  là một lá vào hộp thư chung, và hộp thư đó thôi được đọc sau tuần thứ hai.
   *  Ngày "đơn vừa chuyển sang thua" đáng một lá riêng thì nó là một rule mới ở
   *  E4, phát từ đây, không phải một lá gửi cho mọi lượt sửa. */
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

    const row = await this.repo.run(async (tx) => {
      /* Dòng gương cập nhật theo — `put` là upsert. Không cập nhật thì
         ContextRail vẫn in tên đơn cũ và cột cũ sau khi người dùng đã sửa, và
         không có gì đỏ để chỉ ra điều đó. */
      await this.mirror.put(tx, refOf(code, write, { label: write.values.name, ownerName }))
      const written = await this.repo.updateOpportunity(tx, code, write.values)
      await this.repo.replaceOwners(tx, code, ownerRowsOf(code, write))
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
