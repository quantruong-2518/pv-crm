import { bigint, check, foreignKey, index, text, timestamp } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { CurrencyCode } from '@pv/contracts'
import { actor } from '@api/platform/db/platform.schema'
import { opportunity } from '../opportunity/opportunity.schema'
import { sales } from '../sales.schema'

/** Hợp đồng đã ký — NGUỒN SỰ THẬT DUY NHẤT của câu "lead này đã ký chưa".
 *
 *  ------------------------------------------------------------------
 *  VÌ SAO CÓ `lead_code` TRONG KHI ĐÃ CÓ `opportunity_code`
 *  ------------------------------------------------------------------
 *  Sổ lead hỏi "còn chạy không" ở MỌI lần mở sổ, và câu đó là "chưa rơi và
 *  chưa ký". Không có cột này thì mỗi lần lọc phải đi hai chặng
 *  `lead → opportunity → contract`; có nó thì còn một chặng trên một chỉ mục.
 *
 *  Đây là denormalize KHOÁ, không phải denormalize GIÁ TRỊ: `lead_code` của
 *  một hợp đồng không bao giờ đổi. Và nó không thể lệch — khoá ngoại GHÉP dưới
 *  đây neo cặp `(opportunity_code, lead_code)` vào đúng cặp đó bên
 *  `opportunity`, nên một hợp đồng trỏ vào cơ hội của lead A mà ghi lead B là
 *  câu `INSERT` bị Postgres từ chối, không phải một bug chờ ai đó phát hiện. */
export const contract = sales.table(
  'contract',
  {
    code: text('code').primaryKey(),
    opportunityCode: text('opportunity_code').notNull(),
    leadCode: text('lead_code').notNull(),
    amount: bigint('amount', { mode: 'number' }),
    currency: text('currency').$type<CurrencyCode>(),
    signedAt: timestamp('signed_at', { withTimezone: true }).notNull(),
    ownerId: text('owner_id').references(() => actor.id),
  },
  (t) => [
    foreignKey({
      name: 'contract_opportunity_fk',
      columns: [t.opportunityCode, t.leadCode],
      foreignColumns: [opportunity.code, opportunity.leadCode],
    }),
    /** Chỉ mục của câu hỏi hay nhất: "lead này đã ký chưa". */
    index('contract_lead_idx').on(t.leadCode),
    check('contract_money_pair', sql`("amount" IS NULL) = ("currency" IS NULL)`),
  ],
)

export type ContractRowDb = typeof contract.$inferSelect
