import { bigint, check, date, index, text, timestamp, unique } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { CurrencyCode, StageKey } from '@pv/contracts'
import { actor } from '@api/platform/db/platform.schema'
import { lead } from '../lead/lead.schema'
import { sales } from '../sales.schema'

/** Cơ hội — module 3 (Ops) của nhánh Sales.
 *
 *  ------------------------------------------------------------------
 *  MỘT LEAD SINH ĐƯỢC NHIỀU CƠ HỘI
 *  ------------------------------------------------------------------
 *  Quan hệ nằm ở ĐÂY (`lead_code`), không nằm ở `lead.deal_code` như bản
 *  trước. Một cột `deal_code` trên lead ngầm định 1-1, tức khách mua lần thứ
 *  hai phải tạo một lead mới trùng công ty trùng email — và từ đó mọi con số
 *  "bao nhiêu khách" đếm sai.
 *
 *  ------------------------------------------------------------------
 *  KHÔNG CÓ TRẠNG THÁI 'won'
 *  ------------------------------------------------------------------
 *  "Đã thắng" = có một dòng trong `contract`, suy ra chứ không lưu. Thêm một
 *  `state = 'won'` ở đây là dựng nguồn sự thật thứ hai cho cùng một câu, và
 *  hai nguồn thì có ngày lệch — cơ hội ghi 'won' mà không có hợp đồng nào, hoặc
 *  ngược lại. `closed_at` + `lost_reason` đủ kể ba trạng thái:
 *
 *      đang mở  · closed_at IS NULL
 *      đã thua  · closed_at NOT NULL AND lost_reason NOT NULL
 *      đã thắng · EXISTS (SELECT 1 FROM contract WHERE lead_code = …)
 *
 *  Bảng này dựng TỐI THIỂU — đủ cột để `running` của sổ lead có nghĩa và để
 *  `contract` có đích khoá ngoại. Khi tới lượt module Ops thì bồi thêm cột,
 *  không phải dựng lại. */
export const opportunity = sales.table(
  'opportunity',
  {
    code: text('code').primaryKey(),
    leadCode: text('lead_code')
      .notNull()
      .references(() => lead.code),
    stage: text('stage').$type<StageKey>(),
    amount: bigint('amount', { mode: 'number' }),
    currency: text('currency').$type<CurrencyCode>(),
    expectedClose: date('expected_close'),
    ownerId: text('owner_id').references(() => actor.id),
    /** Có giá trị = cơ hội đã đóng, theo hướng nào thì `lost_reason` nói. */
    closedAt: timestamp('closed_at', { withTimezone: true }),
    lostReason: text('lost_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('opportunity_lead_idx').on(t.leadCode),
    index('opportunity_owner_idx').on(t.ownerId),
    /** Đích của khoá ngoại GHÉP bên `contract`. `code` đã là khoá chính nên
     *  cặp này thừa về mặt duy nhất — nó tồn tại chỉ để Postgres có chỗ neo
     *  khoá ngoại hai cột, và đó chính là thứ làm việc lệch trở thành bất khả
     *  thi thay vì chỉ "đừng làm thế". */
    unique('opportunity_code_lead_key').on(t.code, t.leadCode),
    check('opportunity_money_pair', sql`("amount" IS NULL) = ("currency" IS NULL)`),
    /** Thua thì phải đóng. Một cơ hội có lý do thua mà vẫn đang mở là một dòng
     *  không ai đọc được. */
    check('opportunity_lost_closed', sql`"lost_reason" IS NULL OR "closed_at" IS NOT NULL`),
  ],
)

export type OpportunityRowDb = typeof opportunity.$inferSelect
