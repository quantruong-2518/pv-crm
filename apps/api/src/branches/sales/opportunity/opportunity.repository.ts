import { and, count, desc, eq, exists, inArray, isNull, ne, not, sql, type SQL } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import type { OpportunityBookQuery, OpportunityOwner } from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { actor, audit } from '@api/platform/db/platform.schema'
import { contract } from '../contract/contract.schema'
import { lead } from '../lead/lead.schema'
import { opportunity, opportunityOwner, type OpportunityRowDb } from './opportunity.schema'
import type { ActorLite } from './opportunity-import.check'
import type { OpportunityValues } from './opportunity.mapper'

/** Một dòng sổ đã nạp đủ thứ nó cần để ra mặt. */
export type OpportunityRead = {
  row: OpportunityRowDb
  account: string
  owners: OpportunityOwner[]
  signed: boolean
  /** Số ngày đơn đã đứng trong cột hiện tại. `null` = đơn đã ra khỏi bảng. */
  daysInStage: number | null
}

/** Số ngày đơn đã đứng trong cột hiện tại.
 *
 *  Tính trong CÂU TRUY VẤN chứ không đọc từ một cột: đây là con số đổi theo
 *  thời gian ngay cả khi không ai chạm vào dòng dữ liệu, nên một cột
 *  `days_in_stage` chỉ đúng vào đêm job vừa chạy. Cùng phép mà `DAYS_HERE` của
 *  sổ lead dùng, kể cả việc đi qua `epoch`: epoch luôn là tổng số giây của cả
 *  khoảng, không phụ thuộc cách Postgres cắt interval thành tháng/ngày.
 *
 *  `stage_since` NULL thì trả NULL, không trả 0 — đơn đã đóng sổ không đứng ở
 *  cột nào, và số 0 ở đó đọc ra là "vừa mới vào cột". */
const DAYS_IN_STAGE = sql<number | null>`CASE WHEN ${opportunity.stageSince} IS NULL THEN NULL ELSE
  GREATEST(0, FLOOR(EXTRACT(epoch FROM now() - ${opportunity.stageSince}) / 86400))::int END`

export type OpportunityBookPage = {
  rows: OpportunityRead[]
  total: number
  /** Số dòng trục phạm vi cắt đi — luật 7, và máy chủ phải đếm vì màn không
   *  đếm được thứ nó không nhận. */
  hidden: number
}

/** Một số từ `sales.opportunity_code_seq`, in ra dạng `OP-%04d`.
 *
 *  Dãy khai ở `opportunity.schema.ts` để `drizzle-kit` sở hữu nó; Drizzle không
 *  có node biểu thức cho `nextval` nên tên phải viết lại đúng một lần ở đây —
 *  cùng đánh đổi mà `lead.repository.ts` đã ghi. */
const NEXT_CODE = sql`SELECT 'OP-' || lpad(nextval('sales.opportunity_code_seq')::text, 4, '0') AS code`

/** Chỗ DUY NHẤT của module cơ hội có SQL. Không quyết định gì về quyền — nó chỉ
 *  THI HÀNH trục phạm vi mà endpoint đã khai bằng `@Need({ scoped: true })`. */
@Injectable()
export class OpportunityRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  get readonlyHandle(): Db {
    return this.db
  }

  run<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(tx))
  }

  /** Giữ trước mã kế tiếp. Gọi TRƯỚC khi mở transaction.
   *
   *  Ngoài transaction vì `nextCode` chạy trên pool: hỏi nó trong lúc
   *  transaction của mình đang giữ một kết nối là một request chiếm hai kết
   *  nối, và với pool mười thì mười phiếu đồng thời chờ nhau một kết nối thứ
   *  mười một không bao giờ tới. `nextval` cố tình không nghe transaction —
   *  phiếu bị rollback đốt số của nó, phiếu sau lấy số kế tiếp. Thủng dãy mã là
   *  bình thường; hai đơn trùng mã thì không. */
  async nextCode(): Promise<string> {
    const r = (await this.db.execute(NEXT_CODE)) as { rows: { code: string }[] }
    const code = r.rows[0]?.code
    if (!code) {
      throw new Error('sales.opportunity_code_seq trả về rỗng — migration đã chạy chưa?')
    }
    return code
  }

  // ── đọc ──────────────────────────────────────────────────────────────────

  async book(who: Actor, q: OpportunityBookQuery, scoped: boolean): Promise<OpportunityBookPage> {
    const scope = this.scopeOf(who, scoped)

    /* Bộ lọc của người dùng và trục phạm vi ĐI RIÊNG, và phải đi riêng: `total`
       đếm theo cả hai, còn `hidden` là hiệu của hai phép đếm CÙNG bộ lọc, khác
       nhau đúng ở trục phạm vi. Gộp chúng làm một thì `hidden` của một lượt lọc
       theo lead sẽ đọc ra "số đơn cả sổ bạn không thấy", tức một con số đúng
       cho câu không ai hỏi. */
    const filter = q.leadCode === undefined ? undefined : eq(opportunity.leadCode, q.leadCode)
    const where = and(filter, scope)

    /* Chỉ đếm LẦN HAI khi trục phạm vi thật sự đang cắt — với người nhìn được
       cả sổ thì `hidden` luôn bằng 0, và một COUNT toàn bảng để in ra số 0 là
       trả phí cho câu không ai hỏi. Cùng phép mà sổ lead đang dùng. */
    const [scopedTotal, all] = await Promise.all([
      this.count(where),
      scope ? this.count(filter) : Promise.resolve(null),
    ])

    const rows = await this.db
      .select({
        row: opportunity,
        account: lead.company,
        signed: this.signedValue(),
        daysInStage: DAYS_IN_STAGE,
      })
      .from(opportunity)
      .innerJoin(lead, eq(lead.code, opportunity.leadCode))
      .where(where)
      /* Mới nhất trước: thứ vừa tạo mà phải lật sang trang ba mới thấy thì
         người dùng tưởng nút không ăn. `code` phá hoà vì hai đơn tạo trong cùng
         một mili giây vẫn phải ra một thứ tự cố định — không có nó thì hai lần
         gọi cùng một trang trả về hai thứ tự khác nhau và dòng cuối trang nhảy. */
      .orderBy(desc(opportunity.createdAt), desc(opportunity.code))
      .limit(q.size)
      .offset((q.page - 1) * q.size)

    const owners = await this.ownersOf(
      this.db,
      rows.map((r) => r.row.code),
    )

    return {
      rows: rows.map((r) => ({ ...r, owners: owners.get(r.row.code) ?? [] })),
      total: scopedTotal,
      hidden: all === null ? 0 : all - scopedTotal,
    }
  }

  /** Một đơn theo mã, kèm phán quyết của trục phạm vi trên chính nó.
   *
   *  `inScope` đi KÈM dữ liệu chứ không quyết định dữ liệu có về hay không —
   *  cùng hình với `LeadRepository.byCode`, và vì cùng lý do: 404 "không có đơn
   *  này" và 403 "đơn không phải của bạn" là hai câu khác nhau, mà một truy vấn
   *  đã lọc theo phạm vi thì chỉ trả lời được câu thứ nhất. */
  async byCode(who: Actor, code: string): Promise<(OpportunityRead & { inScope: boolean }) | null> {
    const [found] = await this.db
      .select({
        row: opportunity,
        account: lead.company,
        signed: this.signedValue(),
        daysInStage: DAYS_IN_STAGE,
        inScope: this.inScopeValue(who),
      })
      .from(opportunity)
      .innerJoin(lead, eq(lead.code, opportunity.leadCode))
      .where(eq(opportunity.code, code))
      .limit(1)

    if (!found) return null

    const owners = await this.ownersOf(this.db, [code])
    return { ...found, owners: owners.get(code) ?? [] }
  }

  /** Người đứng đơn của một loạt đơn, đọc MỘT lần cho cả trang.
   *
   *  Một truy vấn cho cả trang chứ không một truy vấn mỗi dòng: 50 dòng là 50
   *  vòng tới Neon, và Neon tính tiền theo thời gian thức. `IN` với 50 mã thì
   *  đi đúng `opportunity_owner_pk`.
   *
   *  Thứ tự trong mỗi đơn là thứ tự cố định (`role` rồi `name`) vì màn in ra
   *  một hàng avatar — hai lần mở cùng một đơn mà hàng đó đảo chỗ thì đọc như
   *  dữ liệu vừa đổi. */
  private async ownersOf(tx: Db, codes: string[]): Promise<Map<string, OpportunityOwner[]>> {
    if (codes.length === 0) return new Map()

    const rows = await tx
      .select({
        code: opportunityOwner.opportunityCode,
        id: opportunityOwner.actorId,
        name: actor.name,
        role: opportunityOwner.role,
      })
      .from(opportunityOwner)
      .innerJoin(actor, eq(actor.id, opportunityOwner.actorId))
      .where(inArray(opportunityOwner.opportunityCode, codes))
      .orderBy(opportunityOwner.role, actor.name)

    const byCode = new Map<string, OpportunityOwner[]>()
    for (const r of rows) {
      const list = byCode.get(r.code)
      const owner = { id: r.id, name: r.name, role: r.role }
      if (list) list.push(owner)
      else byCode.set(r.code, [owner])
    }
    return byCode
  }

  /** Tên khách của một lead. Sổ in tên chứ không in mã.
   *
   *  Null = không có lead đó, và cửa ghi biến null thành 404 — khoá ngoại
   *  `opportunity_lead_code_lead_code_fk` cũng chặn, nhưng nó ném ra một 500
   *  không gọi tên ô nào. */
  async leadCompany(tx: Db, code: string): Promise<string | null> {
    const [row] = await tx
      .select({ company: lead.company })
      .from(lead)
      .where(eq(lead.code, code))
      .limit(1)
    return row?.company ?? null
  }

  /** Một đơn, đọc cho BỘ DỰNG THÂN MAIL. Không có trục phạm vi.
   *
   *  Không nhận `Actor`, và đó là chủ ý chứ không phải thiếu sót: người gọi là
   *  worker, và worker không hành động thay ai cả — nó thực hiện một lời hứa
   *  mà nhánh đã ghi vào sổ gửi lúc còn biết người bấm là ai. Nhét một actor
   *  giả vào đây để "cho có kiểm" là dựng một hàng rào không chặn gì mà đọc
   *  như có chặn.
   *
   *  Hàng rào thật nằm ở chỗ khác và đã đứng rồi: dòng sổ gửi chỉ tồn tại nếu
   *  `POST /sales/ops` đi qua `@Need({ permission: 'cơ-hội.sửa' })`, và địa chỉ
   *  nhận là hộp thư của chính công ty, khai trong env — không phải thứ ai gọi
   *  được cũng đặt được. */
  async forMail(code: string): Promise<(OpportunityRead & { daysOpen: number }) | null> {
    const [found] = await this.db
      .select({
        row: opportunity,
        account: lead.company,
        signed: this.signedValue(),
        /* Số ngày đơn sống. Tính trong câu truy vấn chứ không đọc từ cột: đây
           là con số đổi theo thời gian ngay cả khi không ai chạm vào dòng. Qua
           `epoch` để không phụ thuộc cách Postgres cắt interval. */
        daysOpen: sql<number>`GREATEST(0, FLOOR(
          EXTRACT(epoch FROM COALESCE(${opportunity.closedAt}, now()) - ${opportunity.createdAt}) / 86400
        ))::int`,
        daysInStage: DAYS_IN_STAGE,
      })
      .from(opportunity)
      .innerJoin(lead, eq(lead.code, opportunity.leadCode))
      .where(eq(opportunity.code, code))
      .limit(1)

    if (!found) return null

    const owners = await this.ownersOf(this.db, [code])
    return { ...found, owners: owners.get(code) ?? [] }
  }

  /** Tên hiển thị của một loạt actor, cho dòng gương E1 và cho câu trả lời.
   *
   *  Đọc trước khi ghi vì `platform.object` chở NHÃN còn bảng nối chở id (nợ số
   *  2 của `docs/ban-giao-backend.md`). Ai không có trong sổ nhân sự thì vắng
   *  mặt trong Map — và insert vào bảng nối sẽ chết ở
   *  `opportunity_owner_actor_id_actor_id_fk` ngay sau đó, đúng hàng rào giữ
   *  cho MỌI cửa chứ không riêng cửa nào nhớ kiểm. */
  async actorNames(tx: Db, ids: readonly string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map()
    const rows = await tx
      .select({ id: actor.id, name: actor.name })
      .from(actor)
      .where(inArray(actor.id, [...ids]))
    return new Map(rows.map((r) => [r.id, r.name]))
  }

  /** Cả sổ nhân sự, một lượt đọc. Lô nạp dịch TÊN sang id, và nó dịch cho tới
   *  hai nghìn dòng — hỏi từng dòng là hai nghìn vòng tới Neon cho một bảng
   *  bảy người. Cùng phép mà `LeadWriteRepository.staff` dùng. */
  async staff(tx: Db): Promise<ActorLite[]> {
    return tx.select({ id: actor.id, name: actor.name }).from(actor).where(isNull(actor.disabledAt))
  }

  /** Tên công ty → mã lead, cho cột "Account" của tệp.
   *
   *  ------------------------------------------------------------------
   *  GẤP TÊN Ở POSTGRES, KHÔNG PHẢI Ở NODE
   *  ------------------------------------------------------------------
   *  `lower(company)` chạy trong câu truy vấn nên phép gấp của hai đầu khớp
   *  nhau ở nửa quan trọng nhất — chữ hoa. Nửa còn lại (gộp khoảng trắng) làm ở
   *  Node, vì `regexp_replace` cho một sổ trăm dòng là trả phí cho thứ vòng lặp
   *  đã đi qua rồi.
   *
   *  Chỉ lead CÒN CHẠY (`exit_reason IS NULL`), cùng nửa điều kiện mà
   *  `lead_email_live_idx` mang: một khách đã rơi khỏi luồng thì không mở đơn
   *  mới cho họ bằng một dòng Excel được.
   *
   *  Trả về CẢ tập tên nhập nhằng, không lặng lẽ chọn dòng đầu. Hai lead cùng
   *  tên công ty là chuyện có thật (hai chi nhánh, một lần nhập trùng), và đoán
   *  ở đây là gán một đơn cho nhầm hồ sơ — đúng loại lỗi không lộ ra cho tới
   *  lúc ai đó gọi điện cho sai người. */
  async leadsByCompany(
    tx: Db,
  ): Promise<{ byCompany: Map<string, string>; ambiguous: Set<string> }> {
    const rows = await tx
      .select({ code: lead.code, folded: sql<string>`lower(${lead.company})` })
      .from(lead)
      .where(isNull(lead.exitReason))

    const byCompany = new Map<string, string>()
    const ambiguous = new Set<string>()

    for (const r of rows) {
      const key = r.folded.trim().replace(/\s+/g, ' ')
      if (byCompany.has(key)) ambiguous.add(key)
      else byCompany.set(key, r.code)
    }

    return { byCompany, ambiguous }
  }

  /** Mã lead → mã đơn ĐANG MỞ của nó, cho `dupWithBook` của lô nạp.
   *
   *  "Đang mở" loại cả hai đầu cuối: `state <> 'close-lost'` bỏ đơn thua, và
   *  `NOT signed` bỏ đơn đã ký. Một khách quay lại quý sau là một đơn MỚI, không
   *  phải bản trùng của một đơn đã xong — nên chỉ đơn còn sống mới làm một dòng
   *  trong tệp thành trùng.
   *
   *  Đọc theo danh sách mã chứ không quét cả bảng: lô đã dịch xong tên công ty
   *  nên nó biết chính xác hỏi về những lead nào. `IN` đi đúng
   *  `opportunity_lead_idx`. */
  async liveDealsByLead(tx: Db, leadCodes: readonly string[]): Promise<Map<string, string>> {
    if (leadCodes.length === 0) return new Map()

    const rows = await tx
      .select({ leadCode: opportunity.leadCode, code: opportunity.code })
      .from(opportunity)
      .where(
        and(
          inArray(opportunity.leadCode, [...leadCodes]),
          ne(opportunity.state, 'close-lost'),
          not(this.signed()),
        ),
      )
      .orderBy(opportunity.code)

    const byLead = new Map<string, string>()
    for (const r of rows) if (!byLead.has(r.leadCode)) byLead.set(r.leadCode, r.code)
    return byLead
  }

  // ── ghi ──────────────────────────────────────────────────────────────────

  /** Ghi đơn. Dòng gương phải đã nằm trong CHÍNH transaction này.
   *
   *  `returning()` vì `stage` là cột SINH: chỉ database biết nó, và chỉ sau khi
   *  insert xong. Dựng lại ở Node là dựng bản thứ hai của một biểu thức đã có
   *  một bản. */
  async insertOpportunity(
    tx: Db,
    row: OpportunityValues & { code: string },
  ): Promise<OpportunityRowDb> {
    const [written] = await tx.insert(opportunity).values(row).returning()
    if (!written) throw new Error(`sales.opportunity: INSERT ${row.code} không trả về dòng nào`)
    return written
  }

  /** `n` mã một lượt, cho lô nạp.
   *
   *  MỘT câu truy vấn chứ không `n` lần `nextCode()`: hai nghìn dòng là hai
   *  nghìn vòng tới Neon trước khi transaction kịp mở, và `generate_series` gọi
   *  `nextval` đúng `n` lần trong một lượt — cùng bảo đảm về tính duy nhất, một
   *  phần nghìn số vòng mạng.
   *
   *  Ngoài transaction, cùng lý do `nextCode()` ghi ở trên. Số bị đốt khi lô bị
   *  rollback; dãy mã thủng là bình thường, hai đơn trùng mã thì không. */
  async nextCodes(n: number): Promise<string[]> {
    if (n <= 0) return []
    const r = (await this.db.execute(
      sql`SELECT 'OP-' || lpad(nextval('sales.opportunity_code_seq')::text, 4, '0') AS code
          FROM generate_series(1, ${n})`,
    )) as { rows: { code: string }[] }

    if (r.rows.length !== n) {
      throw new Error(`sales.opportunity_code_seq cấp ${r.rows.length}/${n} mã`)
    }
    return r.rows.map((x) => x.code)
  }

  /** Ghi cả lô đơn, cắt khúc.
   *
   *  `CHUNK` là trần 65.535 tham số ràng buộc của Postgres chia cho số cột, làm
   *  tròn xuống cho dễ đọc — KHÔNG phải một ranh giới bền vững. Cả lô vẫn nằm
   *  trong một transaction; cắt khúc chỉ để một câu INSERT không vượt trần tham
   *  số, không phải để commit từng phần. Cùng con số mà lô nạp lead dùng. */
  async insertMany(
    tx: Db,
    rows: readonly (OpportunityValues & { code: string })[],
  ): Promise<OpportunityRowDb[]> {
    const CHUNK = 500
    const written: OpportunityRowDb[] = []

    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK)
      if (slice.length === 0) continue
      written.push(...(await tx.insert(opportunity).values(slice).returning()))
    }

    return written
  }

  /** Ghi người đứng đơn. Một câu cho cả danh sách. */
  async insertOwners(
    tx: Db,
    rows: readonly { opportunityCode: string; actorId: string; role: 'SALE' | 'BD' }[],
  ): Promise<void> {
    if (rows.length === 0) return
    await tx.insert(opportunityOwner).values([...rows])
  }

  /** Sửa một đơn. Trả về dòng SAU khi sửa. */
  async updateOpportunity(
    tx: Db,
    code: string,
    values: Partial<OpportunityValues>,
  ): Promise<OpportunityRowDb> {
    const [written] = await tx
      .update(opportunity)
      .set(values)
      .where(eq(opportunity.code, code))
      .returning()
    if (!written) throw new Error(`sales.opportunity: UPDATE ${code} không trả về dòng nào`)
    return written
  }

  /** Một dòng `platform.audit` làm BIÊN LAI của lô nạp.
   *
   *  Không gọi `AuditRepository.write` vì hai lý do đã ghi ở bản của lô nạp
   *  lead và vẫn đúng ở đây: hàm đó ghi qua pool nên không vào được transaction
   *  này, và nó không trả về gì — mà `batchId` CHÍNH LÀ id của dòng vừa ghi.
   *
   *  Đây là chỗ duy nhất nối một lô với những mã nó đã cấp: `sales.opportunity`
   *  không có cột `batch_id`. Cùng khoản nợ mà lô nạp lead đang mang, và cùng
   *  cách trả — một cột `batch_id` thật, ngày ai đó cần hỏi "lô hôm qua nạp
   *  những đơn nào" bằng SQL thay vì bằng cách đọc JSON trong một dòng audit. */
  async writeBatchNote(
    tx: Db,
    entry: { actorId: string; note: string },
  ): Promise<{ id: string; at: Date }> {
    const [row] = await tx
      .insert(audit)
      .values({ actorId: entry.actorId, action: 'sửa', note: entry.note })
      .returning({ id: audit.id, at: audit.at })

    if (!row) throw new Error('platform.audit: INSERT không trả về dòng nào')
    return row
  }

  /** Thay TOÀN BỘ danh sách người đứng đơn: xoá hết rồi ghi lại.
   *
   *  ------------------------------------------------------------------
   *  XOÁ-RỒI-GHI CHỨ KHÔNG SO SÁNH HAI TẬP HỢP
   *  ------------------------------------------------------------------
   *  Cửa `PATCH` nhận CẢ danh sách chứ không nhận "thêm ai bớt ai", nên câu hỏi
   *  ở đây là "danh sách mới trông thế nào", không phải "đã đổi những gì". Tính
   *  hiệu hai tập rồi phát ra vài câu INSERT/DELETE cho ra đúng kết quả đó,
   *  bằng nhiều code hơn và thêm một chỗ để sai.
   *
   *  Cùng transaction với lượt UPDATE dòng đơn, nên không có khoảnh khắc nào
   *  một đơn tồn tại mà không ai đứng tên: người đọc thứ hai hoặc thấy danh
   *  sách cũ, hoặc thấy danh sách mới. Ngoài transaction thì đây đúng là khoảng
   *  trống mà một lượt đọc chen vào được. */
  async replaceOwners(
    tx: Db,
    code: string,
    rows: readonly { opportunityCode: string; actorId: string; role: 'SALE' | 'BD' }[],
  ): Promise<void> {
    await tx.delete(opportunityOwner).where(eq(opportunityOwner.opportunityCode, code))
    await this.insertOwners(tx, rows)
  }

  // ── trục phạm vi và câu hỏi "đã thắng chưa" ──────────────────────────────

  /** Trục 3 của E2 trên sổ này: người `ownOnly` chỉ thấy đơn mình đứng tên.
   *
   *  "Đứng tên" đọc CẢ HAI vai — Sale chốt và BD mở cửa. Chỉ đọc `SALE` thì
   *  người BD mở được khách mất luôn đơn của chính mình khỏi sổ, và họ là người
   *  duy nhất biết đơn đó bắt đầu từ đâu.
   *
   *  `EXISTS` chứ không `JOIN`: một đơn có ba người thì join nhân dòng đó lên
   *  ba, và `COUNT` sau đó đếm ba. */
  private scopeOf(who: Actor, scoped: boolean): SQL | undefined {
    if (!scoped || !who.ownOnly) return undefined
    return exists(
      this.db
        .select({ one: sql`1` })
        .from(opportunityOwner)
        .where(
          and(
            eq(opportunityOwner.opportunityCode, opportunity.code),
            eq(opportunityOwner.actorId, who.id),
          ),
        ),
    )
  }

  /** Cùng vị từ, nhưng ĐƯỢC CHỌN RA thay vì đem đi lọc — xem `byCode`. */
  private inScopeValue(who: Actor): SQL<boolean> {
    const scope = this.scopeOf(who, true)
    return (scope ? sql`COALESCE(${scope}, false)` : sql`true`) as SQL<boolean>
  }

  private async count(where: SQL | undefined): Promise<number> {
    const [r] = await this.db.select({ n: count() }).from(opportunity).where(where)
    return r?.n ?? 0
  }

  /** "Đã thắng" — hỏi thẳng `contract` qua khoá ngoại GHÉP.
   *
   *  Khớp CẢ HAI cột (`opportunity_code` và `lead_code`) chứ không riêng mã đơn.
   *  Cặp đó chính là thứ `opportunity_code_lead_key` tồn tại để neo, và đọc
   *  bằng cả cặp là cách câu truy vấn nói lại đúng bất biến mà bảng đang giữ. */
  private signed(): SQL {
    return exists(
      this.db
        .select({ one: sql`1` })
        .from(contract)
        .where(
          and(
            eq(contract.opportunityCode, opportunity.code),
            eq(contract.leadCode, opportunity.leadCode),
          ),
        ),
    )
  }

  private signedValue(): SQL<boolean> {
    return this.signed() as SQL<boolean>
  }
}
