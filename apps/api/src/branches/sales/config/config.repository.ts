import { and, eq, sql } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import { CONFIG_PREFIX, ConfigList } from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import { configEntry, type ConfigRowDb } from './config.schema'

/** Bản nháp một dòng mới — thứ repository ghi được, không hơn.
 *
 *  `id` và `ord` vắng mặt vì repository tự sinh chúng (xem `create`). Định
 *  nghĩa ở đây chứ không ở `config.approval.ts` để chiều phụ thuộc đi đúng
 *  hướng: cửa duyệt biết bảng ghi được gì, bảng không biết có ai duyệt. */
export type ConfigDraft = {
  name: string
  limitDays?: number
  ownerId?: string
  kind?: string
}

/** Phần sửa. Vắng mặt = không đụng tới; `ownerId: null` = XOÁ người phụ trách.
 *  Hai thứ đó khác nhau, và cột phân biệt được, nên kiểu cũng phải phân biệt. */
export type ConfigPatchDb = {
  name?: string
  active?: boolean
  limitDays?: number
  ownerId?: string | null
  kind?: string
}

/** Không gian khoá tư vấn của riêng bảng này. Con số không mang nghĩa gì, chỉ
 *  cần cố định và không đụng bảng khác — xem `create`. */
const LOCK_SPACE = 61_001

/** Chỗ DUY NHẤT trong module cấu hình có SQL. Không quyết định gì.
 *
 *  ------------------------------------------------------------------
 *  MỘT BẢN THAM SỐ HOÁ THEO `list`, KHÔNG SÁU BẢN
 *  ------------------------------------------------------------------
 *  Sáu danh mục có cùng luật đọc, cùng luật ghi, cùng luật thứ tự. Viết sáu
 *  repository là chép cùng một câu truy vấn sáu lần, và tới lần sửa thứ hai sẽ
 *  có một bản bị bỏ quên. `list` là THAM SỐ, không phải tên hàm.
 *
 *  Đó cũng là lý do `list` luôn nằm trong mệnh đề `WHERE` của mọi câu ghi, kể
 *  cả khi `id` đã là khoá chính và tự nó đủ để tìm ra dòng: một `PATCH
 *  /sales/config/TIER/ST-01` phải không tìm thấy gì, chứ không phải sửa được
 *  một cột của phễu qua đường dẫn của bảng bậc. */
@Injectable()
export class SalesConfigRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Cả sáu danh mục trong MỘT câu. Sắp theo `list` rồi `ord` để mapper chỉ
   *  việc đổ vào sáu ô, không phải sắp lại lần nữa. */
  async all(): Promise<ConfigRowDb[]> {
    return this.db.select().from(configEntry).orderBy(configEntry.list, configEntry.ord)
  }

  /** Một danh mục, kể cả dòng đã tắt.
   *
   *  KHÔNG lọc `active` ở đây: màn Cấu hình phải thấy dòng đã tắt (đó là toàn
   *  bộ hình thức "xoá" mà hệ có, giấu đi thì không ai bật lại được). Chỗ cần
   *  danh sách để CHỌN thì lọc ở chỗ đó. */
  async list(list: ConfigList): Promise<ConfigRowDb[]> {
    return this.db
      .select()
      .from(configEntry)
      .where(eq(configEntry.list, list))
      .orderBy(configEntry.ord)
  }

  async byId(list: ConfigList, id: string): Promise<ConfigRowDb | null> {
    const [row] = await this.db
      .select()
      .from(configEntry)
      .where(and(eq(configEntry.list, list), eq(configEntry.id, id)))
      .limit(1)
    return row ?? null
  }

  /** Người này có trong sổ nhân sự không. Dùng cho `CATEGORY.ownerId`.
   *
   *  Khoá ngoại đã chặn cứng rồi, nhưng nó chặn ở lúc GHI — mà đường ghi còn
   *  phải qua duyệt, nên người đề nghị sẽ chỉ biết mình gõ sai id vài ngày sau,
   *  lúc người gật bấm nút. Hỏi trước một câu thì lỗi rơi đúng vào tay người
   *  gõ. */
  async actorExists(id: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: actor.id })
      .from(actor)
      .where(eq(actor.id, id))
      .limit(1)
    return row !== undefined
  }

  // ── ĐƯỜNG GHI ─────────────────────────────────────────────────────────────
  // Ba hàm dưới đây là phần ÁP DỤNG của một đề nghị đã được gật. Chúng KHÔNG
  // được gọi thẳng từ controller — xem `config.approval.ts`.

  /** Thêm một dòng: sinh `id`, sinh `ord`, ghi — trong CÙNG một transaction.
   *
   *  ------------------------------------------------------------------
   *  KHOÁ TƯ VẤN, VÌ MỘT TRANSACTION KHÔNG ĐỦ
   *  ------------------------------------------------------------------
   *  Cả hai con số đều là "cái đang có lớn nhất, cộng một". Hai lời gọi song
   *  song đọc cùng một `max` sẽ tính ra cùng một `id` và cùng một `ord`, và
   *  transaction ở mức `READ COMMITTED` không ngăn chuyện đó — nó chỉ làm cái
   *  thứ hai hỏng ở khoá chính, tức một lỗi 500 cho một thao tác hoàn toàn hợp
   *  lệ. `pg_advisory_xact_lock` xếp hàng chúng lại, khoá theo TỪNG danh mục
   *  nên thêm một lý do rơi không chặn ai đang thêm một cột phễu, và tự nhả khi
   *  transaction kết thúc dù kết thúc kiểu gì. */
  async create(list: ConfigList, draft: ConfigDraft): Promise<ConfigRowDb> {
    return this.db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(CAST(${LOCK_SPACE} AS int), CAST(${ConfigList.options.indexOf(list)} AS int))`,
      )

      /* Số của `id` đi theo mã lớn nhất TỪNG cấp, không theo số dòng đang có:
         đếm dòng thì một dòng bị xoá (chỉ có thể xảy ra bằng tay ở database)
         làm mã tiếp theo trùng một mã đã từng tồn tại, và mọi log cũ nói về mã
         đó thành nói sai. */
      const [top] = await tx
        .select({
          ord: sql<number | null>`max(${configEntry.ord})`,
          seq: sql<number | null>`max(CAST(split_part(${configEntry.id}, '-', 2) AS int))`,
        })
        .from(configEntry)
        .where(eq(configEntry.list, list))

      /* `Number(...)` chứ không tin thẳng kiểu khai: driver Postgres trả hàm
         tổng hợp về dạng chuỗi với một số kiểu cột, và một phép `+` trên chuỗi
         thì nối chứ không cộng. */
      const ord = Number(top?.ord ?? 0) + 1
      const seq = Number(top?.seq ?? 0) + 1

      const [row] = await tx
        .insert(configEntry)
        .values({
          id: `${CONFIG_PREFIX[list]}-${String(seq).padStart(2, '0')}`,
          list,
          name: draft.name,
          ord,
          limitDays: draft.limitDays ?? null,
          ownerId: draft.ownerId ?? null,
          kind: draft.kind ?? null,
        })
        .returning()

      if (!row) throw new Error(`config_entry: INSERT vào ${list} không trả về dòng nào`)
      return row
    })
  }

  /** Sửa một dòng. Trả `null` khi cặp `(list, id)` không có thật. */
  async patch(list: ConfigList, id: string, patch: ConfigPatchDb): Promise<ConfigRowDb | null> {
    const set: ConfigPatchDb = {}
    /* So với `undefined` chứ không lọc bằng tính đúng-sai: `active: false`,
       `limitDays: 0` và `ownerId: null` đều là giá trị phải ghi xuống. */
    if (patch.name !== undefined) set.name = patch.name
    if (patch.active !== undefined) set.active = patch.active
    if (patch.limitDays !== undefined) set.limitDays = patch.limitDays
    if (patch.ownerId !== undefined) set.ownerId = patch.ownerId
    if (patch.kind !== undefined) set.kind = patch.kind

    const [row] = await this.db
      .update(configEntry)
      .set(set)
      .where(and(eq(configEntry.list, list), eq(configEntry.id, id)))
      .returning()
    return row ?? null
  }

  /** Đánh số lại cả danh mục theo thứ tự `ids` gửi lên.
   *
   *  MỘT câu `UPDATE … FROM (VALUES …)`, không phải n câu trong vòng lặp: n câu
   *  là n vòng đi về database cho một thao tác kéo thả, và mỗi câu là một chỗ
   *  để transaction hỏng giữa chừng.
   *
   *  Câu này chỉ chạy được vì `config_ord_uniq` là `DEFERRABLE INITIALLY
   *  DEFERRED`: đảo chỗ hai dòng thì ở giữa câu chắc chắn có hai dòng cùng
   *  `ord`, và một ràng buộc kiểm-ngay sẽ từ chối. Postgres chỉ nhìn trạng thái
   *  lúc `COMMIT`. Xem ghi chú ở `config.schema.ts` và ở file migration. */
  async reorder(list: ConfigList, ids: string[]): Promise<ConfigRowDb[]> {
    return this.db.transaction(async (tx) => {
      const pairs = sql.join(
        ids.map((id, i) => sql`(CAST(${id} AS text), CAST(${i + 1} AS int))`),
        sql`, `,
      )

      await tx.execute(sql`
        UPDATE ${configEntry} AS c
           SET "ord" = v.ord
          FROM (VALUES ${pairs}) AS v(id, ord)
         WHERE c."id" = v.id AND c."list" = ${list}
      `)

      return tx
        .select()
        .from(configEntry)
        .where(eq(configEntry.list, list))
        .orderBy(configEntry.ord)
    })
  }
}
