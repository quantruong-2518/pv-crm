import { boolean, check, index, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { ContactChannel } from '@pv/contracts'
import { actor, objectRef } from '@api/platform/db/platform.schema'
import { sales } from '../sales.schema'
import { lead } from '../lead/lead.schema'

/** Sổ người liên hệ phía KHÁCH — một công ty nhiều người, mỗi người một dòng.
 *
 *  ------------------------------------------------------------------
 *  ĐÂY LÀ VIỆC ĐẢO QUYẾT ĐỊNH #1 CỦA `docs/ban-giao-db.md`
 *  ------------------------------------------------------------------
 *  Quyết định đó chọn để email nằm thẳng trên `lead` — "một lead = một người =
 *  một email" — và tự hẹn trước ngày phải trả: "ngày một công ty cần nhiều
 *  người nhận mail sẽ là một migration". Hai thứ đã tới hạn cùng lúc:
 *
 *   · `sales.meeting_attendee` vừa dựng phải mô tả khách bằng TÊN GÕ TAY, vì
 *     phía khách chưa có sổ nào để trỏ tới. Docblock của chính bảng đó viết
 *     "ngày có bảng liên hệ thật thì đây là chỗ đầu tiên mọc thêm một khoá
 *     ngoại" — bảng này là cái nó chờ.
 *   · `platform.email_suppression` khoá theo ĐỊA CHỈ, không theo lead code.
 *     Tức tầng gửi thư đã coi con người là đơn vị từ lâu; lược đồ mới là thứ
 *     đi sau, không phải ngược lại.
 *
 *  ------------------------------------------------------------------
 *  NĂM CỘT TRÊN `sales.lead` KHÔNG BỊ XOÁ Ở LƯỢT NÀY — NỢ CÓ HẸN
 *  ------------------------------------------------------------------
 *  `lead.required_filled` và `optional_filled` là `GENERATED ALWAYS … STORED`,
 *  và ô 4 / ô 5 của cổng init data đọc thẳng `contact_title` · `phone` ·
 *  `contact_channel`. Cột generated KHÔNG đọc được bảng khác, nên chuyển năm
 *  cột đi là cổng MQL mất hai ô ngay ở tầng SQL — không phải một lỗi lộ ra khi
 *  chạy, mà một con số lặng lẽ tụt xuống. Cộng thêm luật vận hành đang chạy:
 *  migration không được chứa `DROP`.
 *
 *  Nên trong lượt này contact PRIMARY còn được chép xuống năm cột đó. Phải nói
 *  thẳng đây là HAI NGUỒN CHO MỘT SỰ THẬT — đúng thứ `meeting.ts` cảnh báo là
 *  drift — và nó chỉ chịu được nhờ đúng một điều kiện: `ContactService` là
 *  người ghi DUY NHẤT, và nó ghi cả hai trong CÙNG một transaction. Cửa nào
 *  ghi thẳng `sales.lead.email` mà không đi qua đó là làm hỏng bất biến này.
 *  Ngày xoá năm cột là một migration riêng, sau khi FE đã cắt hẳn sang đây.
 *
 *  ------------------------------------------------------------------
 *  MÃ ĐỌC ĐƯỢC `CT-%04d`, KHÔNG PHẢI `uuid`
 *  ------------------------------------------------------------------
 *  Khác `touch` và `meeting`, bảng này lấy khuôn của `lead`/`contract`: mã đọc
 *  được + dòng gương ở `platform.object`, vì `ObjectKind` ĐÃ có sẵn `'CT'` và
 *  kịch bản đóng băng đã đặt `CT-0391` vào đồ thị kèm cạnh
 *  `AC-0142 –thuộc-về→ CT-0391 –sinh-ra→ OP-0288`. Bản thiết kế gốc luôn coi
 *  người liên hệ là một object của E1; hôm nay chỉ là lúc bảng bắt kịp.
 *
 *  Hệ quả: `code` là FK vào `platform.object(code)`, nên dòng gương phải được
 *  ghi TRƯỚC, cùng transaction, qua `ObjectMirror.put`. Mã do repository sinh
 *  chứ không phải column DEFAULT — cùng lý do đã ghi ở `lead.repository.ts`. */
export const contact = sales.table(
  'contact',
  {
    code: text('code')
      .primaryKey()
      .references(() => objectRef.code),

    /** Khoá ngoại THẬT, cùng khuôn `meeting.lead_code` và khác
     *  `touch.subject_code`: người liên hệ chỉ treo vào lead, không đa hình.
     *  Không `ON DELETE CASCADE` — lead rời phễu bằng `exit_reason` chứ không
     *  bị xoá, nên CASCADE ở đây là hàng rào cho một việc không được phép xảy
     *  ra. */
    leadCode: text('lead_code')
      .notNull()
      .references(() => lead.code),

    name: text('name').notNull(),
    title: text('title'),

    /** TUỲ CHỌN ở đây, trong khi `lead.email` là `NOT NULL` — và đó không phải
     *  nới lỏng luật.
     *
     *  `NOT NULL` trên lead phục vụ đúng một câu (quyết định #4): "một lead
     *  không email là một lead không tham gia được luồng MAS mail". Câu đó nói
     *  về LEAD, và lead vẫn giữ nguyên ràng buộc của nó. Người liên hệ thứ hai
     *  của cùng công ty — người mà ta mới chỉ có số điện thoại — không việc gì
     *  phải mang một địa chỉ bịa ra để được ghi vào sổ.
     *
     *  Lưu ở dạng đã `trim().toLowerCase()`; `@pv/contracts` chuẩn hoá một lần
     *  ở tầng zod và mapper cố ý không làm lại lần hai. */
    email: text('email'),
    phone: text('phone'),
    channel: text('channel').$type<ContactChannel>(),

    /** Người liên hệ CHÍNH của lead — người mà năm cột trên `sales.lead` là
     *  bản chép, và người mà luồng MAS mail bắn tới.
     *
     *  Cờ này thuộc về TẬP dòng chứ không thuộc về một dòng: "nhiều nhất một
     *  primary mỗi lead" cưỡng chế được bằng partial unique index bên dưới,
     *  "ít nhất một" thì index không nói được và đó là việc của service. Vì
     *  vậy đổi primary là một endpoint riêng chứ không phải
     *  `PATCH { isPrimary: true }` — nó là thao tác trên HAI dòng (hạ dòng cũ,
     *  nâng dòng mới), còn một PATCH trông như thao tác trên một dòng. */
    isPrimary: boolean('is_primary').notNull().default(false),

    note: text('note'),

    /** Ảnh chụp tên người ghi, cùng luật với `touch.by` và `meeting.by`: một
     *  bản ghi là bản ghi của lúc ĐÓ. Join `actor` lúc đọc thì một dòng cũ
     *  lặng lẽ nhận tên mới của người ta, và không hiện gì cả nếu người đó đã
     *  rời sổ. */
    by: text('by').notNull(),
    createdBy: text('created_by').references(() => actor.id),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('contact_lead_idx').on(t.leadCode),

    /** NHIỀU NHẤT một primary mỗi lead, gác ở tầng bảng chứ không nhờ service
     *  nhớ. Partial: các dòng không-primary không đụng nhau, nên một lead có
     *  bao nhiêu người phụ cũng được. */
    uniqueIndex('contact_primary_idx')
      .on(t.leadCode)
      .where(sql`"is_primary"`),

    /** Tra ngược từ địa chỉ về người — đường mà `email_suppression` cần khi ai
     *  đó bấm huỷ nhận thư và ta phải trả lời "ai vừa rút". KHÔNG unique, và
     *  đó là quyết định:
     *
     *  luật chống trùng đang chạy là `lead_email_live_idx` —
     *  `UNIQUE(lower(email)) WHERE exit_reason IS NULL`, tức "một hộp thư = một
     *  lead ĐANG SỐNG". Điều kiện đó đọc `lead.exit_reason`, một cột của bảng
     *  KHÁC, mà partial index không với sang bảng khác được. Dựng một unique
     *  toàn cục ở đây là siết chặt hơn luật đang chạy: hai lead cùng địa chỉ
     *  mà một cái đã rơi là hợp lệ hôm nay, và một unique ở đây sẽ làm backfill
     *  gãy.
     *
     *  Nên trong lượt này `lead_email_live_idx` vẫn là hàng rào chống trùng —
     *  nó còn nguyên vì năm cột trên lead còn nguyên. Ngày xoá năm cột đó,
     *  hàng rào phải mọc lại ở đây dưới dạng partial index nối `lead`, hoặc
     *  một cột trạng thái chép sang. Đó là mục đầu tiên của migration ấy. */
    index('contact_email_idx').on(sql`lower("email")`),

    /** Chuỗi rỗng không phải một giá trị — cùng luật `lead_no_blank`.
     *  `NULL <> ''` cho ra NULL, và CHECK cho qua khi biểu thức là NULL, nên
     *  một dòng vẫn được phép vắng `title`/`email`/`phone`/`channel`/`note`;
     *  thứ bị chặn là dòng CÓ mặt trường đó nhưng rỗng. */
    check(
      'contact_no_blank',
      sql`"lead_code" <> '' AND "name" <> '' AND "by" <> '' AND "title" <> '' AND "email" <> '' AND "phone" <> '' AND "channel" <> '' AND "note" <> ''`,
    ),

    /** Kênh phải là một trong bảy khoá đã biết.
     *
     *  `sales.lead.contact_channel` KHÔNG có ràng buộc này — giá trị ở đó chỉ
     *  được gác bởi zod, nên cửa nào không đi qua zod (`db:seed`, một câu SQL
     *  gõ tay) ghi được rác vào. Bảng mới không thừa kế lỗ đó. Bảy khoá lấy từ
     *  `ContactChannel` của `@pv/contracts`; danh sách phải viết lại ở đây vì
     *  Postgres cần hằng số, và đó là lý do dòng này phải đổi cùng lúc với
     *  enum kia. */
    check(
      'contact_channel_known',
      sql`"channel" IS NULL OR "channel" IN ('email', 'zalo-oa', 'telegram', 'in-app', 'linkedin', 'facebook', 'website')`,
    ),
  ],
)

/** Mã `CT-%04d` cho người liên hệ mới.
 *
 *  Bắt đầu từ 2001 để chừa hai dải đã có người ở: mã sinh bởi migration
 *  backfill (`CT-1001` trở đi, một dòng cho mỗi lead đang có) và `CT-0391` mà
 *  kịch bản đóng băng đã đặt vào `platform.object`. Sequence bỏ qua
 *  transaction — rollback đốt số, thủng dãy là bình thường. */
export const contactCodeSeq = sales.sequence('contact_code_seq', {
  startWith: 2001,
  increment: 1,
  minValue: 1,
  cache: 1,
})

export type ContactRowDb = typeof contact.$inferSelect
export type ContactValues = typeof contact.$inferInsert
