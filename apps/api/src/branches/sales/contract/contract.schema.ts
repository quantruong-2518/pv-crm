import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type {
  ConditionSide,
  CurrencyCode,
  DocState,
  RecordChannel,
  RecordState,
} from '@pv/contracts'
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

/** The payment schedule of a signed contract, one row per installment.
 *
 *  Keyed by the pair (contract, ordinal) instead of a surrogate id: an
 *  installment has no identity outside its contract, and every screen naming
 *  one says "installment 2 of this contract". That pair is also what the four
 *  child tables below anchor their composite foreign key on, which is what
 *  makes a checklist line belonging to another contract's installment
 *  impossible rather than merely discouraged. */
export const contractInstallment = sales.table(
  'contract_installment',
  {
    contractCode: text('contract_code')
      .notNull()
      .references(() => contract.code, { onDelete: 'cascade' }),
    no: integer('no').notNull(),
    label: text('label').notNull(),
    /** Share of the contract value, whole percent. Stored rather than derived
     *  from `amount`: the schedule is negotiated in percentages and the money
     *  is rounded off them, so recomputing gives 29.99 for a line both sides
     *  signed as 30. */
    share: integer('share').notNull(),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    due: timestamp('due', { withTimezone: true }).notNull(),
    /** When the money landed. NULL = not collected yet. */
    paidAt: timestamp('paid_at', { withTimezone: true }),
  },
  (t) => [
    /** Doubles as the index for "the installments of this contract" — it leads
     *  with `contract_code`, so a separate index would be a second copy. */
    primaryKey({ name: 'contract_installment_pk', columns: [t.contractCode, t.no] }),
    check('contract_installment_no_positive', sql`"no" > 0`),
    check('contract_installment_share_range', sql`"share" BETWEEN 0 AND 100`),
  ],
)

/** What has to happen before an installment unlocks — one checklist line.
 *
 *  `side` says which side owes the work, and it is a column rather than a
 *  guess from `who` because "which side is this stuck on" is the question the
 *  screen asks first and a name does not answer it. */
export const contractCondition = sales.table(
  'contract_condition',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contractCode: text('contract_code').notNull(),
    installmentNo: integer('installment_no').notNull(),
    side: text('side').$type<ConditionSide>().notNull(),
    what: text('what').notNull(),
    due: timestamp('due', { withTimezone: true }).notNull(),
    /** NULL = still open. On a customer-side line, a value means the CUSTOMER
     *  did it — not that we chased them. */
    doneAt: timestamp('done_at', { withTimezone: true }),
    who: text('who').notNull(),
  },
  (t) => [
    foreignKey({
      name: 'contract_condition_installment_fk',
      columns: [t.contractCode, t.installmentNo],
      foreignColumns: [contractInstallment.contractCode, contractInstallment.no],
    }).onDelete('cascade'),
    /** "The conditions of this installment" — the only way this table is read. */
    index('contract_condition_installment_idx').on(t.contractCode, t.installmentNo),
    check('contract_condition_side_known', sql`"side" IN ('ta', 'khách')`),
  ],
)

/** Paperwork an installment needs. `state` carries a third value beyond
 *  present/signed: a document nobody has produced yet is a real state, and
 *  collapsing it into a missing row loses the line the desk has to chase. */
export const contractDocument = sales.table(
  'contract_document',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contractCode: text('contract_code').notNull(),
    installmentNo: integer('installment_no').notNull(),
    name: text('name').notNull(),
    state: text('state').$type<DocState>().notNull(),
    hint: text('hint').notNull(),
  },
  (t) => [
    foreignKey({
      name: 'contract_document_installment_fk',
      columns: [t.contractCode, t.installmentNo],
      foreignColumns: [contractInstallment.contractCode, contractInstallment.no],
    }).onDelete('cascade'),
    index('contract_document_installment_idx').on(t.contractCode, t.installmentNo),
    check('contract_document_state_known', sql`"state" IN ('đủ', 'chờ-ký', 'chưa-có')`),
  ],
)

/** One touch on an installment — sent, or queued to send.
 *
 *  `channel` is a closed set of its own, NOT `ContactChannel`: that one lists
 *  where a lead can be reached, this one lists how the desk chases money, and
 *  the two vocabularies do not line up. */
export const contractRecord = sales.table(
  'contract_record',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contractCode: text('contract_code').notNull(),
    installmentNo: integer('installment_no').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull(),
    channel: text('channel').$type<RecordChannel>().notNull(),
    what: text('what').notNull(),
    detail: text('detail').notNull(),
    state: text('state').$type<RecordState>().notNull(),
  },
  (t) => [
    foreignKey({
      name: 'contract_record_installment_fk',
      columns: [t.contractCode, t.installmentNo],
      foreignColumns: [contractInstallment.contractCode, contractInstallment.no],
    }).onDelete('cascade'),
    /** Newest first is how the history prints, so the index carries the order
     *  and the read never sorts. */
    index('contract_record_installment_idx').on(t.contractCode, t.installmentNo, t.at),
    check(
      'contract_record_channel_known',
      sql`"channel" IN ('email', 'zalo-oa', 'trong-app', 'gọi')`,
    ),
    check(
      'contract_record_state_known',
      sql`"state" IN ('xong', 'chờ-trả-lời', 'đã-xếp', 'chưa-tới')`,
    ),
  ],
)

/** Free-hand note on an installment — the place for what no field holds. */
export const contractNote = sales.table(
  'contract_note',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contractCode: text('contract_code').notNull(),
    installmentNo: integer('installment_no').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull(),
    who: text('who').notNull(),
    text: text('text').notNull(),
  },
  (t) => [
    foreignKey({
      name: 'contract_note_installment_fk',
      columns: [t.contractCode, t.installmentNo],
      foreignColumns: [contractInstallment.contractCode, contractInstallment.no],
    }).onDelete('cascade'),
    index('contract_note_installment_idx').on(t.contractCode, t.installmentNo, t.at),
  ],
)

export type ContractRowDb = typeof contract.$inferSelect
export type ContractInstallmentRowDb = typeof contractInstallment.$inferSelect
export type ContractConditionRowDb = typeof contractCondition.$inferSelect
export type ContractDocumentRowDb = typeof contractDocument.$inferSelect
export type ContractRecordRowDb = typeof contractRecord.$inferSelect
export type ContractNoteRowDb = typeof contractNote.$inferSelect
