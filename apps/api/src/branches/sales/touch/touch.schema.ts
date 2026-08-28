import { check, index, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { LeadTier, TouchKind, TouchSubject } from '@pv/contracts'
import { actor } from '@api/platform/db/platform.schema'
import { sales } from '../sales.schema'

/** Lần chạm — chuyện gì đã xảy ra với một lead hoặc một cơ hội.
 *
 *  ------------------------------------------------------------------
 *  VÌ SAO LÀ BẢNG THỨ BA, KHI ĐÃ CÓ `audit` VÀ `email_delivery`
 *  ------------------------------------------------------------------
 *  `platform.audit` ghi AI GỌI ĐƯỜNG NÀO — nó là vết bảo mật, khoá theo một
 *  `action` của HTTP, và tới lúc nó được ghi thì thứ duy nhất còn lại là
 *  `action: 'sửa'`. Nó không nói được "đơn này vừa từ Đã demo sang Chờ ký".
 *  `platform.email_delivery` biết mọi lá thư đã gửi, tức đúng một loại tiếp xúc
 *  và là loại duy nhất hai bảng kia nhìn thấy.
 *
 *  Thứ dòng thời gian cần là SỰ KIỆN NGHIỆP VỤ, nói ra một lần, ngay lúc code
 *  còn cầm cả bản trước lẫn bản sau. `fromUpdate` biết đơn vừa đổi cột — nó
 *  tính `moved` để quyết định đồng hồ cột — và một dòng sau thì kiến thức đó
 *  biến mất. Nên dòng được ghi ở chỗ sự thật còn được biết, không phải dựng lại
 *  ở hạ nguồn từ thứ sống sót.
 *
 *  ------------------------------------------------------------------
 *  `subject_code` KHÔNG CÓ KHOÁ NGOẠI, VÀ ĐÓ LÀ QUYẾT ĐỊNH
 *  ------------------------------------------------------------------
 *  Một cột trỏ được vào HAI bảng thì không khoá ngoại được vào bảng nào —
 *  Postgres không có khoá ngoại đa hình. Ba đường đi qua chuyện đó, và đường
 *  này là đường rẻ nhất mà vẫn thành thật:
 *
 *   · hai cột `lead_code`/`opportunity_code`, mỗi cột một khoá ngoại, cộng một
 *     CHECK ép đúng một cột có giá trị — đúng nhất, và biến mọi câu đọc thành
 *     `WHERE lead_code = $1 OR opportunity_code = $1`, tức hai chỉ mục cho một
 *     câu hỏi;
 *   · khoá ngoại về `platform.object`, nơi CẢ HAI đều có dòng gương — hấp dẫn,
 *     nhưng dòng gương của cơ hội là KỶ LUẬT chứ chưa phải hàng rào
 *     (`opportunity.code` chưa trỏ về `platform.object`), nên khoá ngoại ở đây
 *     sẽ đổ một lượt ghi lần chạm vì một dòng gương thiếu — tức làm hỏng cửa
 *     ghi vì một khoản nợ ở chỗ khác;
 *   · một cột mã cộng một cột loại, có CHECK trên loại. Chọn đường này.
 *
 *  Cái mất là có thật và ghi ra ở đây: một lần chạm trỏ vào mã không tồn tại
 *  thì bảng nhận. Cái đỡ nó không phải hy vọng — cả ba chỗ ghi đều nằm TRONG
 *  transaction đã ghi chính dòng đó, nên mã không tồn tại nghĩa là dòng kia
 *  cũng đã rollback.
 *
 *  ------------------------------------------------------------------
 *  `by` LÀ TÊN, CHÉP LÚC GHI
 *  ------------------------------------------------------------------
 *  Không join `actor` lúc đọc, và đây là chỗ khác hẳn `opportunity_owner` —
 *  bảng nối kia chở id vì nó trả lời "đơn này của ai HÔM NAY", còn bảng này
 *  trả lời "hôm đó ai làm". Join sẽ làm mọi dòng lịch sử lặng lẽ đổi theo tên
 *  hiện tại của người ta, và làm dòng do máy ghi thành không vẽ được.
 *
 *  `actor_id` vẫn có, vẫn khoá ngoại, và vẫn NULL được: nó để lọc "việc tôi đã
 *  làm" ngày có màn hỏi câu đó. NULL = máy ghi, và `by` lúc đó là 'Hệ thống'. */
export const touch = sales.table(
  'touch',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),

    /** Mã lead hoặc mã cơ hội. Không khoá ngoại — xem docblock trên. */
    subjectCode: text('subject_code').notNull(),
    subjectKind: text('subject_kind').$type<TouchSubject>().notNull(),

    kind: text('kind').$type<TouchKind>().notNull(),

    /** Bậc lead SAU bước này. NULL ở mọi loại trừ hai loại chở bậc.
     *
     *  `kind` một mình không trả lời được câu hỏi của màn Hiệu suất: `len-bac`
     *  nói "lên một bậc", không nói lên `mql` hay lên `sql`. Đường rẻ hơn là
     *  đếm theo THỨ TỰ — dòng `len-bac` đầu tiên của một lead là `mql`, dòng
     *  thứ hai là `sql` — và nó chỉ đúng khi ba điều cùng đúng: dòng thời gian
     *  không thủng, không lượt ghi nào nhảy cách bậc, và mọi lead đều xuất phát
     *  từ cùng một bậc. Không điều nào trong ba là hàng rào; cả ba là thói quen
     *  hiện thời của code, và một phép đếm dựa vào thói quen sẽ hỏng lặng lẽ
     *  vào ngày thói quen đổi, ở một màn không ai soi lại.
     *
     *  Một dòng TỰ NÓI ĐƯỢC bậc của nó thì không cần điều kiện nào cả: một
     *  trường, không window function, không giả định về phần còn lại của dòng
     *  thời gian. `vao-so` cũng chở được nó, để dòng thời gian bắt đầu từ một
     *  điểm được ghi ra chứ không phải một điểm được đoán. */
    toTier: text('to_tier').$type<LeadTier>(),

    actorId: text('actor_id').references(() => actor.id),
    by: text('by').notNull(),

    note: text('note').notNull(),
  },
  (t) => [
    /** Câu hỏi DUY NHẤT bảng này trả lời: "dòng thời gian của mã X". Hai cột
     *  theo đúng thứ tự đó, `at` giảm dần — chỉ mục phục vụ cả lọc lẫn sắp xếp
     *  nên câu đọc không cần một lượt sort nào. */
    index('touch_subject_idx').on(t.subjectCode, t.at.desc()),
    /** "Việc tôi đã làm", chưa có màn nào hỏi. Rẻ, và cột đã có sẵn. */
    index('touch_actor_idx').on(t.actorId),
    check('touch_subject_kind_known', sql`"subject_kind" IN ('lead', 'opportunity')`),
    /** Đúng mười giá trị của `TouchKind`. Chép ra đây chứ không sinh: một CHECK
     *  là một chuỗi trong migration, và ngày enum ở hợp đồng dài thêm thì đây
     *  phải là một migration có người đọc, không phải một dòng lặng lẽ đổi. */
    check(
      'touch_kind_known',
      sql`"kind" IN ('vao-so', 'cham', 'dien-o', 'giao', 'len-bac', 'gap-lan-dau',
                     'vao-pipeline', 'doi-cot', 'ky', 'ra-khoi-luong')`,
    ),
    /** Ba giá trị của `LeadTier`. Chép ra đây cùng lý do với `touch_kind_known`
     *  ở trên: enum dài thêm thì phải là một migration có người đọc. */
    check('touch_to_tier_known', sql`"to_tier" IS NULL OR "to_tier" IN ('dau-moi', 'mql', 'sql')`),
    /** Lý do cột `to_tier` tồn tại là để `len-bac` trả lời được "lên bậc nào".
     *  Một dòng `len-bac` không mang bậc là một dòng không đọc được — chặn ở
     *  đây chứ không phát hiện lúc dựng biểu đồ. */
    check('touch_len_bac_co_bac', sql`"kind" <> 'len-bac' OR "to_tier" IS NOT NULL`),
    /** Một dòng thời gian không có câu nào để đọc là một dòng trống chiếm chỗ. */
    check('touch_no_blank', sql`"by" <> '' AND "note" <> '' AND "subject_code" <> ''`),
  ],
)

export type TouchRowDb = typeof touch.$inferSelect
export type TouchValues = typeof touch.$inferInsert
