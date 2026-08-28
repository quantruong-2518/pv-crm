import {
  bigint,
  check,
  date,
  index,
  integer,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { CostKind } from '@pv/contracts'
import { actor } from '@api/platform/db/platform.schema'
import { sales } from '../sales.schema'
import { configEntry } from '../config/config.schema'

/** KINH TẾ CỦA MỘT NGUỒN LEAD — ba bảng, và cả ba treo vào `config_entry`.
 *
 *  ------------------------------------------------------------------
 *  "NGUỒN" Ở ĐÂY LÀ DÒNG `SOURCE` CỦA SỔ CẤU HÌNH, KHÔNG PHẢI `sales.campaign`
 *  ------------------------------------------------------------------
 *  Hai thứ mang tên "chiến dịch" sống cạnh nhau trong nhánh này và chúng KHÔNG
 *  phải một:
 *
 *   · `config_entry` (list `SOURCE`, mã `SR-…`) — nguồn kéo lead về, thứ mà
 *     `lead.campaign_id` trỏ vào và module 1 vẽ ra thành bảng. Người dùng tự
 *     thêm, tự đổi tên, tự tắt.
 *   · `sales.campaign` (mã `CP-…`) — một chiến dịch GỬI MAIL, thứ có tệp người
 *     nhận (`campaign_member`) và các lô gửi (`campaign_run`).
 *
 *  Tiền tiêu, người đến sự kiện và người theo dõi đều là chuyện của cái THỨ
 *  NHẤT: một nguồn tiêu 145 triệu cho gian hàng triển lãm không hề gửi mail nào,
 *  và một nguồn có ba chuỗi mail vẫn chỉ là MỘT dòng ngân sách. Treo chúng vào
 *  `sales.campaign` thì nguồn không gửi mail không có chỗ để tiêu tiền.
 *
 *  Sợi dây giữa hai thứ đó là `campaign.source_id` (thêm ở chính lượt này):
 *  một chiến dịch mail được quy công cho một nguồn, nên chuỗi đợt của nguồn =
 *  các lô của những chiến dịch mang mã nguồn đó.
 *
 *  ------------------------------------------------------------------
 *  KHOÁ NGOẠI MỘT CỘT, VÀ "PHẢI LÀ DÒNG SOURCE" LÀ VIỆC CỦA SERVICE
 *  ------------------------------------------------------------------
 *  `config_entry` có sẵn `unique(id, list)` để làm đích cho khoá ngoại GHÉP —
 *  kỹ thuật chặn được cả chuyện trỏ nhầm sang danh mục khác. Ba bảng dưới đây
 *  KHÔNG dùng nó, và đó là lựa chọn có giá: dùng thì mỗi bảng phải mang thêm
 *  một cột `list` hằng số chỉ để làm nửa thứ hai của khoá. Đổi lại "trỏ nhầm
 *  danh mục" là lỗi mà service bắt được bằng một câu đọc nó vẫn phải đọc (nguồn
 *  có tồn tại không), còn "trỏ vào một dòng đã bị xoá" thì chỉ khoá ngoại chặn
 *  được. Chọn cái khoá ngoại chặn được.
 *
 *  Vẫn chặt hơn `lead.campaign_id` đang có, cột đó KHÔNG có khoá ngoại nào. */

/** Năm loại chi TIỀN MẶT. Không có loại thứ sáu và không có ô "khác": một ô
 *  "khác" là chỗ mọi hoá đơn khó phân loại chui vào, và sau ba tháng nó thành
 *  loại lớn nhất bảng. Danh sách khoá ở `CostKind` trong `@pv/contracts`. */
export const sourceCost = sales.table(
  'source_cost',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** Nguồn tiêu khoản này — `config_entry.id` của một dòng `SOURCE`. */
    sourceId: text('source_id')
      .notNull()
      .references(() => configEntry.id),

    kind: text('kind').$type<CostKind>().notNull(),

    /** Hoá đơn này là gì — "Apollo 2.000 dòng", "Gian hàng NEPCON". Nhãn của
     *  DÒNG CHI, khác nhãn của loại: một nguồn có ba dòng cùng loại `CHANNEL`. */
    label: text('label').notNull(),

    /** Đồng. `bigint` cùng lý do với `lead.budget` và `platform.object.amount`:
     *  một gian hàng triển lãm 145 triệu thì vừa `int4`, một ngân sách cả năm
     *  của phòng thì không. */
    amount: bigint('amount', { mode: 'number' }).notNull(),

    /** NGÀY TIÊU, không phải ngày nhập. Có nó thì chi phí mới cắt được theo kỳ
     *  — thiếu nó thì màn Hiệu suất phải thú nhận "chi phí của một nguồn không
     *  chia được theo ngày", đúng chỗ mà bản fixture đã phải thú nhận.
     *
     *  `date` chứ không `timestamp`: một hoá đơn thuộc về một NGÀY, và giờ phút
     *  của nó không trả lời câu hỏi nào mà báo cáo nào hỏi. */
    spentOn: date('spent_on').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('source_cost_source_idx').on(t.sourceId),
    /** Cắt kỳ đọc cột này mỗi lần, và nó đọc cả bảng nếu không có index. */
    index('source_cost_spent_idx').on(t.spentOn),
    check('source_cost_kind_valid', sql`${t.kind} IN ('DATA','CHANNEL','CONTENT','EVENT','TOOL')`),
    /** Tiền không âm. Hoàn tiền là một dòng chi âm ở nhiều hệ khác; ở đây
     *  KHÔNG, vì một bảng cho phép số âm thì "tổng chi" và "tổng hoá đơn" thôi
     *  là một số, và không màn nào đang phân biệt hai thứ đó. */
    check('source_cost_amount_nonneg', sql`${t.amount} >= 0`),
    check('source_cost_label_not_blank', sql`${t.label} <> ''`),
  ],
)

/** MỘT nguồn kiểu sự kiện có MỘT lần diễn ra — nên khoá chính là `source_id`.
 *
 *  Hội thảo tổ chức hai lần là hai NGUỒN, không phải hai dòng ở đây: số lead,
 *  chi phí và người đến của lần một không được cộng vào lần hai, và một sổ
 *  không tách được hai lần thì không tách được công trạng.
 *
 *  Nguồn không phải sự kiện đơn giản là KHÔNG có dòng nào — vắng mặt là câu
 *  trả lời, không phải chỗ thiếu dữ liệu, đúng như `attendRate: null` mà màn
 *  đang đọc ("`null` = không phải sự kiện, KHÔNG phải chưa ai đến"). */
export const sourceEvent = sales.table(
  'source_event',
  {
    sourceId: text('source_id')
      .primaryKey()
      .references(() => configEntry.id),

    /** Tổ chức ở đâu. Nullable: sự kiện online không có địa điểm nào cả. */
    venue: text('venue'),

    /** Đăng ký / đến thật. Hai cột, không một cột "tỉ lệ": tỉ lệ là phép chia
     *  và một phép chia lưu thành cột là một phép chia không kiểm lại được. */
    registered: integer('registered'),
    checkedIn: integer('checked_in'),

    heldOn: date('held_on'),
  },
  (t) => [
    check('source_event_registered_nonneg', sql`${t.registered} IS NULL OR ${t.registered} >= 0`),
    check('source_event_checked_in_nonneg', sql`${t.checkedIn} IS NULL OR ${t.checkedIn} >= 0`),
    /** Đến nhiều hơn đăng ký là chuyện CÓ THẬT ở hội thảo (khách dắt theo đồng
     *  nghiệp), nên KHÔNG có ràng buộc `checked_in <= registered`. Ghi ra đây
     *  để lần sau không ai "sửa" bằng cách thêm nó vào. */
  ],
)

/** Người theo dõi thêm một nguồn — KHÔNG kể chủ nguồn.
 *
 *  Chủ nằm ở `config_entry.owner_id`: chủ là người chịu trách nhiệm khi số hụt,
 *  follower là người xin theo. Trộn hai vai vào một bảng thì mất luôn câu trả
 *  lời "hỏi ai khi số hụt", nên chủ không được phép có dòng ở đây và service
 *  từ chối nếu ai đó thêm. */
export const sourceFollower = sales.table(
  'source_follower',
  {
    sourceId: text('source_id')
      .notNull()
      .references(() => configEntry.id),
    actorId: text('actor_id')
      .notNull()
      .references(() => actor.id),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('source_follower_actor_idx').on(t.actorId),
    primaryKey({ columns: [t.sourceId, t.actorId] }),
  ],
)

export type SourceCostRow = typeof sourceCost.$inferSelect
export type SourceEventRow = typeof sourceEvent.$inferSelect
export type SourceFollowerRow = typeof sourceFollower.$inferSelect
