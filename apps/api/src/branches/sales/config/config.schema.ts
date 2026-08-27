import { boolean, check, integer, text, timestamp, unique, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { ConfigList } from '@pv/contracts'
import { actor } from '@api/platform/db/platform.schema'
import { sales } from '../sales.schema'

/** Cấu hình danh mục Sales — SÁU danh mục trong MỘT bảng.
 *
 *  ------------------------------------------------------------------
 *  VÌ SAO MỘT BẢNG CHỨ KHÔNG SÁU
 *  ------------------------------------------------------------------
 *  Sáu bảng `stage`/`tier`/`category`/… có cùng năm cột đầu, cùng luật thứ tự,
 *  cùng luật không-xoá-cứng, cùng luật tên-không-trùng. Sáu bản chép của cùng
 *  một luật là sáu chỗ để chúng lệch nhau — và lệch ở đây không nổ, nó chỉ làm
 *  một danh mục hành xử khác năm danh mục kia cho tới khi có người để ý. Một
 *  bảng, một cột `list`, một repository tham số hoá: luật viết đúng một lần.
 *
 *  Giá phải trả là ba cột thuộc tính riêng nằm chung một hàng và chỉ có nghĩa
 *  với đúng một `list`. Giá đó được trả bằng CHECK ở tầng bảng, không bằng lời
 *  hứa của tầng ứng dụng — xem `config_limit_only_stage` bên dưới.
 *
 *  ------------------------------------------------------------------
 *  ID BẤT BIẾN · TÊN SỬA ĐƯỢC · THỨ TỰ LÀ NGHIỆP VỤ
 *  ------------------------------------------------------------------
 *  Đây là toàn bộ lý do bảng này tồn tại thay cho một `z.enum`. Lead trỏ vào
 *  `id`, người đọc nhìn `name`, nghiệp vụ đọc `ord`. Ba thứ đó độc lập nhau nên
 *  sửa một cái không kéo hai cái kia — thứ mà một enum không làm được, vì ở
 *  enum cả ba là cùng một chuỗi.
 *
 *  KHÔNG rẽ nhánh theo `id`. `if (stage.id === 'ST-05')` biên dịch được, chạy
 *  được, và sai đúng vào ngày người dùng chèn thêm một cột vào phễu. Câu hỏi
 *  đúng luôn là về `ord` hoặc về một cột thuộc tính. */
export const configEntry = sales.table(
  'config_entry',
  {
    /** '<tiền tố>-<số>' — 'ST-01'. HỆ sinh, BẤT BIẾN, không bao giờ đổi.
     *
     *  `text` không `DEFAULT`: mã do repository sinh trong cùng transaction với
     *  dòng, vì nó phải đọc mã lớn nhất đang có của đúng danh mục đó. Một
     *  `sequence` dùng chung cho cả sáu danh mục sẽ cho 'TR-07' đứng cạnh
     *  'ST-06' — số vẫn đúng, nhưng đọc log thì không còn thấy được gì. */
    id: text('id').primaryKey(),

    list: text('list').$type<ConfigList>().notNull(),

    /** NHÃN hiển thị, có dấu, sửa được. Không phải khoá của bất cứ thứ gì. */
    name: text('name').notNull(),

    /** Thứ tự nhập = thứ tự nghiệp vụ, bắt đầu từ 1.
     *
     *  Cột này CHỞ NGHĨA: 'đầu mối' là `ord` nhỏ nhất của `TIER`, 'chờ ký' là
     *  `ord` lớn nhất của `STAGE`. Chín chỗ trong repo đang hỏi những câu đó
     *  bằng cách so chuỗi literal; chúng phải chuyển sang hỏi cột này. */
    ord: integer('ord').notNull(),

    /** Tắt, KHÔNG xoá. Một lý do rơi đang có 21 lead đứng tên mà bị xoá thì 21
     *  dòng đó mất chỗ đứng — nên bảng không có đường xoá, và khoá ngoại từ
     *  `lead` là thứ chặn cứng nếu ai đó thử. */
    active: boolean('active').notNull().default(true),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),

    // ── thuộc tính riêng · mỗi cột đúng một danh mục ────────────────────────
    /** CHỈ `STAGE` — hạn của cột, tính bằng ngày. */
    limitDays: integer('limit_days'),
    /** CHỈ `CATEGORY` — Sale phụ trách ngành.
     *
     *  Khoá ngoại vào `platform.actor(id)`, KHÔNG lưu tên người: hai người
     *  trùng tên là hai người nhận nhầm lead của nhau (nợ số 2 của
     *  `ban-giao-backend.md`, trả trước ở đây thay vì trả sau bằng migration). */
    ownerId: text('owner_id').references(() => actor.id),
    /** CHỈ `SOURCE` — 'chien-dich' · 'su-kien' · 'tu-nhien'. */
    kind: text('kind'),
  },
  (t) => [
    /** Trống là `NULL`, không bao giờ là `''` — cùng quy ước với `lead`. */
    check('config_name_not_blank', sql`"name" <> ''`),

    /** Hạn cột CHỈ thuộc về `STAGE`, và mọi `STAGE` đều phải có hạn.
     *
     *  Viết bằng dấu bằng giữa hai mệnh đề chứ không bằng hai `CHECK` rời: một
     *  biểu thức thì không có cách nào thoả nửa này mà hụt nửa kia. Đây là chỗ
     *  ép cái giá của quyết định "sáu danh mục một bảng". */
    check('config_limit_only_stage', sql`("list" = 'STAGE') = ("limit_days" IS NOT NULL)`),

    /** ĐÍCH của khoá ngoại GHÉP mà `sales.lead` sẽ trỏ vào.
     *
     *  `lead.stage_id` một mình chỉ nói "trỏ vào một dòng cấu hình nào đó" —
     *  nó không ngăn cột `stage` của lead trỏ vào một dòng của danh mục
     *  `EXIT_REASON`. Ghép thêm `list` vào khoá ngoại thì Postgres từ chối, và
     *  không cửa vào nào phải nhớ điều đó. Cùng kỹ thuật `contract` đang dùng
     *  để neo `(opportunity_code, lead_code)`. */
    unique('config_id_list').on(t.id, t.list),

    /** Thứ tự KHÔNG trùng trong một danh mục — và ràng buộc này BẮT BUỘC phải
     *  `DEFERRABLE INITIALLY DEFERRED`.
     *
     *  ------------------------------------------------------------------
     *  CHỖ NÀY ĐƯỢC VÁ TAY TRONG FILE MIGRATION — ĐỪNG XOÁ
     *  ------------------------------------------------------------------
     *  Kéo thả đổi thứ tự là một hoán vị: 5 dòng đổi chỗ là 5 câu `UPDATE`
     *  trong một transaction, và giữa chừng CHẮC CHẮN có hai dòng cùng `ord`.
     *  Với ràng buộc kiểm-ngay thì thao tác hợp lệ nhất của cả màn này luôn
     *  hỏng; hoãn tới `COMMIT` thì Postgres chỉ nhìn trạng thái cuối.
     *
     *  `drizzle-kit` KHÔNG sinh được từ khoá `DEFERRABLE` (drizzle-orm 0.38
     *  không có chỗ nào khai nó). Nên nó được viết tay vào cuối câu `CREATE
     *  TABLE` của file migration, kèm comment ở đúng chỗ đó. Dòng khai báo ở
     *  đây vẫn phải còn, để `drizzle-kit push` không coi ràng buộc kia là thừa
     *  rồi `DROP` mất. Sinh lại migration từ đầu thì phải vá lại bằng tay. */
    unique('config_ord_uniq').on(t.list, t.ord),

    /** Tên KHÔNG trùng trong một danh mục ĐANG SỐNG, không phân biệt hoa
     *  thường.
     *
     *  Hai điều kiện, mỗi cái trả một câu khác nhau:
     *   · `lower(name)` — 'Đã demo' và 'ĐÃ DEMO' là một mục, không phải hai.
     *     Ép ở index thì không cửa vào nào quên được (đúng chặn số 3 của
     *     `ban-giao-db.md`, trả trước ở bảng này).
     *   · `WHERE active` — một mục đã tắt vẫn giữ tên cũ để dữ liệu cũ đọc
     *     được, nhưng nó không được chặn người dùng dựng lại một mục cùng tên. */
    uniqueIndex('config_name_live')
      .on(t.list, sql`lower("name")`)
      .where(sql`"active"`),
  ],
)

export type ConfigRowDb = typeof configEntry.$inferSelect
