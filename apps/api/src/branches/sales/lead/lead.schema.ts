import { index, integer, smallint, text, timestamp } from 'drizzle-orm/pg-core'
import type { ExitReason, LeadCategory, LeadTier, StageKey } from '@pv/contracts'
import { actor } from '@api/platform/db/platform.schema'
import { sales } from '../sales.schema'

/** `sales.lead` — một dòng sổ lead.
 *
 *  Kiểu của cột lấy bằng `$type<>()` từ chính hợp đồng zod, nên cột và hợp
 *  đồng không thể lệch nhau mà `tsc` không kêu. Ràng buộc CHECK ở tầng
 *  Postgres đi cùng migration đầu tiên có dữ liệu thật — `$type` gác lúc gõ,
 *  CHECK gác lúc ghi, và cần cả hai. */
export const lead = sales.table(
  'lead',
  {
    code: text('code').primaryKey(),
    company: text('company').notNull(),
    province: text('province').notNull(),
    category: text('category').$type<LeadCategory>().notNull(),
    tier: text('tier').$type<LeadTier>().notNull(),

    /** Cổng init data nhìn vào con số này: đủ 6 là chạy được vào pipeline. */
    requiredFilled: smallint('required_filled').notNull().default(0),
    optionalFilled: smallint('optional_filled').notNull().default(0),

    /** Ai giữ. Khoá ngoại sang `platform.actor` — platform KHÔNG phải một
     *  nhánh, nên đây không vi phạm luật cấm JOIN chéo nhánh. */
    ownerId: text('owner_id').references(() => actor.id),

    stage: text('stage').$type<StageKey>(),
    dealCode: text('deal_code'),
    contractCode: text('contract_code'),

    daysHere: integer('days_here').notNull().default(0),

    /** Dây nối module 1 (chiến dịch) ↔ module 2 (lead). */
    source: text('source').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),

    /** Khoá ASCII, KHÔNG phải nhãn tiếng Việt — nợ số 4 đã trả ở hợp đồng. */
    exitReason: text('exit_reason').$type<ExitReason>(),
    exitedAt: timestamp('exited_at', { withTimezone: true }),
  },
  (t) => [
    /** Ba chỉ mục theo đúng ba câu hỏi sổ lead hỏi mỗi lần mở: của ai, ở cột
     *  nào, còn sống không. Thêm chỉ mục theo phỏng đoán là trả phí ghi cho
     *  một câu chưa ai hỏi. */
    index('lead_owner_idx').on(t.ownerId),
    index('lead_stage_idx').on(t.stage),
    index('lead_exit_idx').on(t.exitReason),
    /* Ô tìm theo tên công ty dùng `ILIKE '%…%'` — B-tree KHÔNG đỡ được kiểu
       này, mọi lần gõ là một seq scan. Với 100 dòng thì không ai thấy; khi có
       dữ liệu thật thì bật `pg_trgm` và thêm một GIN index trên `company`.
       Chưa làm bây giờ vì extension phải đi kèm migration, và migration đầu
       tiên nên là cái dựng bảng. */
  ],
)

export type LeadRowDb = typeof lead.$inferSelect
