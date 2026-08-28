import { and, count, desc, eq, exists, inArray, sql, type SQL } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import type { OpportunityOwner, PageQuery } from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import { contract } from '../contract/contract.schema'
import { lead } from '../lead/lead.schema'
import { opportunity, opportunityOwner, type OpportunityRowDb } from './opportunity.schema'
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

  async book(who: Actor, q: PageQuery, scoped: boolean): Promise<OpportunityBookPage> {
    const scope = this.scopeOf(who, scoped)

    /* Chỉ đếm LẦN HAI khi trục phạm vi thật sự đang cắt — với người nhìn được
       cả sổ thì `hidden` luôn bằng 0, và một COUNT toàn bảng để in ra số 0 là
       trả phí cho câu không ai hỏi. Cùng phép mà sổ lead đang dùng. */
    const [scopedTotal, all] = await Promise.all([
      this.count(scope),
      scope ? this.count(undefined) : Promise.resolve(null),
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
      .where(scope)
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
