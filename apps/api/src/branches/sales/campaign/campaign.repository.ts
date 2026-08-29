import { and, asc, count, desc, eq, ilike, inArray, sql, type SQL } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import type { CampaignBookQuery, CampaignState } from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { contains } from '@api/platform/db/like'
import { actor } from '@api/platform/db/platform.schema'
import { configEntry } from '../config/config.schema'
import { campaign, campaignMember, campaignRun, type CampaignRowDb } from './campaign.schema'
import type { CampaignRead } from './campaign.mapper'

export type CampaignBookPage = {
  rows: CampaignRead[]
  /** Số dòng người này ĐƯỢC thấy, sau khi áp cả bộ lọc lẫn trục phạm vi. */
  total: number
  /** Số dòng bộ lọc khớp nhưng phạm vi cắt đi — luật 7. */
  hidden: number
}

/** Nguồn quy công cho chiến dịch, joined để lấy TÊN — cùng khuôn `CAMPAIGN_ON`
 *  ở `lead.repository.ts`. `list = 'SOURCE'` trong ON dù `config_entry.id` đã
 *  là khoá chính, vì lý do y hệt ở đó: trỏ nhầm danh mục phải hiện KHÔNG TÊN
 *  chứ không hiện tên của danh mục khác. LEFT join vì phần lớn chiến dịch chưa
 *  gán nguồn. */
const SOURCE_ON = and(eq(configEntry.id, campaign.sourceId), eq(configEntry.list, 'SOURCE'))

/** Hai số đếm KHÔNG phải cột — subquery tương quan thay vì đọc rồi đếm ở Node,
 *  cùng lý do `DAYS_HERE` ở `lead.repository.ts` là biểu thức SQL: một sổ 100
 *  chiến dịch mà đếm ở Node là 100 câu truy vấn phụ thay vì một cột SELECT. */
const AUDIENCE_COUNT = sql<number>`(
  SELECT count(*)::int FROM "sales"."campaign_member" cm
   WHERE cm."campaign_code" = ${campaign.code} AND cm."state" = 'ACTIVE'
)`

const WAVE_COUNT = sql<number>`(
  SELECT count(*)::int FROM "sales"."campaign_run" cr
   WHERE cr."campaign_code" = ${campaign.code}
)`

/** Một mã mới từ `sales.campaign_code_seq`, in `CP-%04d` — cùng khuôn
 *  `NEXT_CODE` ở `lead.repository.ts`. Không cần dựng trước trong một giao
 *  dịch ghi `platform.object`: `campaign.code` chưa là khoá ngoại vào đó (nợ
 *  B4, xem docblock bảng), nên không có thứ tự ghi nào phải giữ. */
const NEXT_CODE = sql`SELECT 'CP-' || lpad(nextval('sales.campaign_code_seq')::text, 4, '0') AS code`

const SELECT_READ = {
  row: campaign,
  ownerName: actor.name,
  ownerEmail: actor.email,
  sourceName: configEntry.name,
  audienceCount: AUDIENCE_COUNT,
  waveCount: WAVE_COUNT,
}

/** Chỗ DUY NHẤT trong module có SQL cho `sales.campaign`. Không quyết định gì
 *  về quyền — chỉ thi hành trục phạm vi mà endpoint đã khai. */
@Injectable()
export class CampaignRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Một đơn vị công việc, cho `members()` — thêm và bớt lead phải cùng vào
   *  hoặc cùng không, không thì `audienceCount` trả về giữa hai bước là một
   *  con số không ai thấy được. */
  run<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(tx))
  }

  async nextCode(): Promise<string> {
    const r = (await this.db.execute(NEXT_CODE)) as { rows: { code: string }[] }
    const code = r.rows[0]?.code
    if (!code) throw new Error('sales.campaign_code_seq trả về rỗng — migration đã chạy chưa?')
    return code
  }

  async create(input: {
    code: string
    name: string
    ownerId: string | null
    sourceId: string | null
    slogan: string | null
    thumbnailUrl: string | null
  }): Promise<CampaignRowDb> {
    const [row] = await this.db
      .insert(campaign)
      .values({ ...input, state: 'DRAFT' })
      .returning()
    if (!row) throw new Error('Ghi chiến dịch mới thất bại — không dòng nào trả về.')
    return row
  }

  async patch(
    code: string,
    input: {
      name?: string
      ownerId?: string
      sourceId?: string
      slogan?: string
      thumbnailUrl?: string
    },
  ): Promise<void> {
    await this.db
      .update(campaign)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(campaign.code, code))
  }

  async setState(code: string, state: CampaignState): Promise<void> {
    await this.db
      .update(campaign)
      .set({ state, updatedAt: new Date() })
      .where(eq(campaign.code, code))
  }

  /** ĐANG CHẠY → XONG, cho chiến dịch mà mọi đợt của nó đã ngã ngũ.
   *
   *  ------------------------------------------------------------------
   *  VÌ SAO PHẢI CÓ MỘT LƯỢT QUÉT, KHÔNG PHẢI MỘT DÒNG TRONG `start()`
   *  ------------------------------------------------------------------
   *  `DONE` có trong `CampaignState`, có trong CHECK của bảng, và cho tới
   *  lượt này KHÔNG AI GHI NÓ: `start()` nâng `RUNNING`, `stop()` hạ
   *  `STOPPED`, hết. Một chiến dịch bắn xong đủ ba đợt đứng `RUNNING` vĩnh
   *  viễn — sai trên mọi bộ lọc và mọi báo cáo đếm "đang chạy".
   *
   *  Nó không thể là một dòng trong `start()` vì lúc đó chưa có gì xong: đợt
   *  cuối có thể hẹn tuần sau. Nó cũng không thể sống trong `MailRunSweeper`
   *  — `platform` không được biết `sales.campaign` tồn tại. Nên nó ở đây, và
   *  chạy trên nhịp của worker qua [`CampaignSweeper`].
   *
   *  ------------------------------------------------------------------
   *  MỘT CÂU, VÀ ĐIỀU KIỆN "CÓ ÍT NHẤT MỘT ĐỢT" LÀ BẮT BUỘC
   *  ------------------------------------------------------------------
   *  Cùng lý lẽ với `sweepStates()`: vị ngữ nằm trọn trong WHERE nên Postgres
   *  đọc nó trên đúng một ảnh chụp, không có khe giữa lượt đọc và lượt ghi để
   *  một đợt mới chen vào.
   *
   *  `EXISTS` một đợt là hàng rào chống ca xấu nhất: `/start` nâng `RUNNING`
   *  TRƯỚC vòng lặp gửi (quyết định #5 của `ban-giao-campaign.md`), nên có
   *  một khoảnh khắc chiến dịch đã `RUNNING` mà chưa đợt nào kịp ghi. Thiếu
   *  `EXISTS`, lượt quét chạy đúng vào khoảnh khắc đó sẽ đóng ngay một chiến
   *  dịch chưa gửi lá thư nào — và `DONE` không có đường quay lại `RUNNING`.
   *
   *  Terminal của một đợt là `SENT` hoặc `CANCELLED`. `DRAFT` không nằm trong
   *  đó dù `MasService` không bao giờ tạo ra nó: một đợt nháp là một đợt còn
   *  chờ người, và chờ người thì chiến dịch chưa xong. */
  async closeFinished(): Promise<string[]> {
    const r = (await this.db.execute(sql`
      UPDATE "sales"."campaign" c
         SET "state" = 'DONE',
             "updated_at" = now()
       WHERE c."state" = 'RUNNING'
         AND EXISTS (
               SELECT 1 FROM "sales"."campaign_run" cr
                WHERE cr."campaign_code" = c."code"
             )
         AND NOT EXISTS (
               SELECT 1
                 FROM "sales"."campaign_run" cr
                 JOIN "platform"."mail_run" r ON r."id" = cr."mail_run_id"
                WHERE cr."campaign_code" = c."code"
                  AND r."state" NOT IN ('SENT', 'CANCELLED')
             )
      RETURNING c."code"
    `)) as { rows: { code: string }[] }

    return r.rows.map((row) => row.code)
  }

  async book(who: Actor, q: CampaignBookQuery, scoped: boolean): Promise<CampaignBookPage> {
    const filters = this.filtersOf(q)
    const scope = this.scopeOf(who, scoped)

    /* Chỉ đếm LẦN HAI khi trục phạm vi thật sự đang cắt — cùng lý do ở
       `lead.repository.ts#book`. */
    const [scoped_, all] = await Promise.all([
      this.count(and(...filters, scope)),
      scope ? this.count(and(...filters)) : Promise.resolve(null),
    ])

    const rows = await this.db
      .select(SELECT_READ)
      .from(campaign)
      .leftJoin(actor, eq(actor.id, campaign.ownerId))
      .leftJoin(configEntry, SOURCE_ON)
      .where(and(...filters, scope))
      .orderBy(...this.orderBy(q))
      .limit(q.size)
      .offset((q.page - 1) * q.size)

    return { rows, total: scoped_, hidden: all === null ? 0 : all - scoped_ }
  }

  /** Một chiến dịch theo mã — CẢ DÒNG, kể cả khi trục phạm vi không cho người
   *  này đọc nó. `inScope` đi CẠNH dữ liệu chứ không quyết định có trả hay
   *  không — cùng lý do `LeadRepository.byCode` chọn thay vì lọc, xem
   *  docblock đầy đủ ở đó: một dòng "không thấy" và một dòng "không có" phải
   *  trả lời khác nhau (404 với 403). */
  async byCode(
    who: Actor,
    code: string,
    scoped: boolean,
  ): Promise<(CampaignRead & { inScope: boolean }) | null> {
    const scope = this.scopeOf(who, scoped)

    const [row] = await this.db
      .select({
        ...SELECT_READ,
        inScope: scope ? sql<boolean>`COALESCE(${scope}, false)` : sql<boolean>`true`,
      })
      .from(campaign)
      .leftJoin(actor, eq(actor.id, campaign.ownerId))
      .leftJoin(configEntry, SOURCE_ON)
      .where(eq(campaign.code, code))
      .limit(1)

    return row ?? null
  }

  async activeMemberCodes(code: string): Promise<string[]> {
    const rows = await this.db
      .select({ leadCode: campaignMember.leadCode })
      .from(campaignMember)
      .where(and(eq(campaignMember.campaignCode, code), eq(campaignMember.state, 'ACTIVE')))
    return rows.map((r) => r.leadCode)
  }

  async activeMemberCount(code: string): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(campaignMember)
      .where(and(eq(campaignMember.campaignCode, code), eq(campaignMember.state, 'ACTIVE')))
    return row?.n ?? 0
  }

  /** Thêm/hồi sinh — `ON CONFLICT` chứ không `INSERT` trần, vì một lead từng
   *  bị bớt (`REMOVED`) rồi thêm lại phải trở về `ACTIVE` trên CÙNG dòng, đúng
   *  luật "một dòng là một sự thật ngừng thay đổi VỊ TRÍ, không phải ngừng
   *  thay đổi TRẠNG THÁI" mà `campaign_member.state` đã đặt ra. */
  async addMembers(tx: Db, code: string, leadCodes: readonly string[]): Promise<number> {
    if (leadCodes.length === 0) return 0
    const rows = await tx
      .insert(campaignMember)
      .values(
        leadCodes.map((leadCode) => ({ campaignCode: code, leadCode, state: 'ACTIVE' as const })),
      )
      .onConflictDoUpdate({
        target: [campaignMember.campaignCode, campaignMember.leadCode],
        set: { state: 'ACTIVE' as const },
      })
      .returning({ leadCode: campaignMember.leadCode })
    return rows.length
  }

  async removeMembers(tx: Db, code: string, leadCodes: readonly string[]): Promise<number> {
    if (leadCodes.length === 0) return 0
    const rows = await tx
      .update(campaignMember)
      .set({ state: 'REMOVED' })
      .where(
        and(
          eq(campaignMember.campaignCode, code),
          inArray(campaignMember.leadCode, [...leadCodes]),
        ),
      )
      .returning({ leadCode: campaignMember.leadCode })
    return rows.length
  }

  /** Chuỗi đợt của một chiến dịch, cũ nhất trước — thứ tự chuỗi vẽ trên hồ sơ.
   *  Chỉ trả `waveNo`/`mailRunId`: 11 con số của mỗi lô là việc của
   *  `MailRunRepository.byId`, không lặp lại ở đây (biên `platform`/`branches`
   *  đi CHIỀU NÀY thì đúng, đọc thẳng thì không — xem `mas.repository.ts`). */
  async waves(code: string): Promise<{ waveNo: number; mailRunId: string }[]> {
    return this.db
      .select({ waveNo: campaignRun.waveNo, mailRunId: campaignRun.mailRunId })
      .from(campaignRun)
      .where(eq(campaignRun.campaignCode, code))
      .orderBy(asc(campaignRun.waveNo))
  }

  /** Trục 3 · phạm vi. So bằng `id`, không bằng tên — cùng luật
   *  `LeadRepository.scopeOf`. */
  private scopeOf(who: Actor, scoped: boolean): SQL | undefined {
    return scoped && who.ownOnly ? eq(campaign.ownerId, who.id) : undefined
  }

  private async count(where: SQL | undefined): Promise<number> {
    const [r] = await this.db.select({ n: count() }).from(campaign).where(where)
    return r?.n ?? 0
  }

  private orderBy(q: CampaignBookQuery): SQL[] {
    const dir = q.dir === 'asc' ? asc : desc
    const primary = q.sort === 'name' ? campaign.name : campaign.createdAt
    return [dir(primary), dir(campaign.code)]
  }

  private filtersOf(q: CampaignBookQuery): (SQL | undefined)[] {
    return [
      q.state ? eq(campaign.state, q.state) : undefined,
      q.owner ? eq(campaign.ownerId, q.owner) : undefined,
      q.q ? ilike(campaign.name, contains(q.q)) : undefined,
    ]
  }
}
