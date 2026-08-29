import { bigint, check, foreignKey, index, text, timestamp, unique } from 'drizzle-orm/pg-core'
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
    /** One opportunity, at most one contract — debt #10 of `docs/fix-later.md`,
     *  paid at the table instead of in a service.
     *
     *  Until now the invariant lived only in `POST /sales/opportunities/:code/contract`,
     *  which answers 409 when the deal is already signed. That guard is real but
     *  it is one door: the day a second row appears, `OpportunityRepository`'s
     *  three read paths (`book` · `byCode` · `forMail`) join `contract` and
     *  DOUBLE the deal's row, while `total` — counted on `opportunity` alone —
     *  still says one. The book then prints 17 rows under a caption saying 16,
     *  and nothing anywhere is red.
     *
     *  On `opportunity_code` alone, not on the `(opportunity_code, lead_code)`
     *  pair the foreign key anchors: the pair is unique the moment either half
     *  is, and a unique index over both would still let two contracts share one
     *  deal if their `lead_code` differed — which `contract_opportunity_fk`
     *  already makes impossible, so the wider index buys nothing and hides
     *  which column carries the rule.
     *
     *  READ `docs/ban-giao-hop-dong.md` BEFORE APPLYING THIS TO PRODUCTION: the
     *  duplicate count has to be run first, and a duplicate is a business
     *  cleanup, not something a migration may decide. */
    unique('contract_opportunity_once').on(t.opportunityCode),
  ],
)

/** Dãy cấp mã hợp đồng.
 *
 *  ------------------------------------------------------------------
 *  BẢNG NÀY LÀ BẢNG CUỐI CÙNG CÓ MÃ MÀ KHÔNG CÓ DÃY, VÀ NAY THÌ CÓ
 *  ------------------------------------------------------------------
 *  `lead`, `opportunity` và `campaign` đều đã có dãy riêng; `contract` thì
 *  chưa, vì tới hôm nay chưa cửa nào ghi vào nó — sáu dòng đang có đều do
 *  `seed.ts` chép thẳng `contractCode` của fixture. Cửa
 *  `POST /sales/opportunities/:code/contract` là lúc phải có: `SELECT max(code)
 *  + 1` phát cùng một mã cho hai người cùng bấm "Chốt thắng", và người thứ hai
 *  thua khoá chính.
 *
 *  ------------------------------------------------------------------
 *  BẮT ĐẦU Ở 5001, CÙNG LÝ DO VỚI `opportunity_code_seq`
 *  ------------------------------------------------------------------
 *  Fixture rải mã hợp đồng ở `HĐ-2711…2716`. Một dãy bắt đầu ở 1 không đụng gì
 *  trong hai nghìn bảy trăm hợp đồng đầu, rồi hợp đồng thứ ~2711 thua khoá
 *  chính của một dòng seed — đúng loại lỗi ngủ rất lâu rồi mới dậy mà dãy mã cơ
 *  hội đã tránh bằng một con số. 5001 nằm trên khoảng đó.
 *
 *  Không cùng dãy với cơ hội, dù hai bảng sinh ra cùng lúc: mã hợp đồng là số
 *  người ta đọc cho kế toán, và một dãy dùng chung làm nó nhảy cóc theo số đơn
 *  không ký. */
export const contractCodeSeq = sales.sequence('contract_code_seq', {
  startWith: 5001,
  increment: 1,
  minValue: 1,
  cache: 1,
})

export type ContractRowDb = typeof contract.$inferSelect

/* ------------------------------------------------------------------
   TWO COLUMNS OF MODULE 4 ARE MISSING HERE, ON PURPOSE
   ------------------------------------------------------------------
   `quote_code` and `quote_status` — the pinned pair that makes "a contract can
   only point at a quote the customer accepted, and that quote cannot be pulled
   back" a job for Postgres (§3 of `docs/tam-nhin-bao-gia-hop-dong.md`) — are
   NOT declared here, because their composite foreign key references
   `sales.quote`, a table this branch does not have: it is being built in
   parallel on `feat/module-4-bao-gia`.

   Declaring the columns here without the key would put a shape in the snapshot
   that the migration folder cannot express, and re-creating `quote` locally to
   make it compile would fork a table that has one owner. So the whole step
   lives in a hand-written file OUTSIDE the journal —
   `drizzle/sau-merge/contract_quote_link.sql` — which is applied once the two
   branches meet. `docs/ban-giao-hop-dong.md` carries the checklist. */
