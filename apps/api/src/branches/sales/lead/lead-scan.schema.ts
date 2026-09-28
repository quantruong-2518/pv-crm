import { check, index, integer, jsonb, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type {
  ScanBatchState,
  ScanExtraction,
  ScanFileKind,
  ScanFileState,
  ScanResult,
} from '@pv/contracts'
import { actor } from '@api/platform/db/platform.schema'
import { attachment } from '@api/platform/storage/attachment.schema'
import { campaign } from '../campaign/campaign.schema'
import { sales } from '../sales.schema'

/** Counter half of the `SCN-YYMM-NN` code, for `leadCodeSeq`'s reason: only
 *  a sequence stays correct with two writers. The format lives in the
 *  repository — `'SCN-' || to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh',
 *  'YYMM') || '-' || lpad(nextval(…)::text, 2, '0')`. The number does NOT
 *  restart each month: a per-month counter needs a row lock, and `YYMM` is
 *  there for a human reading the code, not for uniqueness. */
export const scanBatchCodeSeq = sales.sequence('scan_batch_code_seq', {
  startWith: 1,
  increment: 1,
  minValue: 1,
  cache: 1,
})

/** One upload of card photos / company PDFs, read by AI, committed as leads.
 *
 *  No `platform.object` mirror: a batch is a working set, not a thing in the
 *  E1 story — the leads it creates are. `result` and `extraction` are `jsonb`
 *  because the server only ever reads them whole, as the contract shapes. */
export const scanBatch = sales.table(
  'scan_batch',
  {
    code: text('code').primaryKey(),
    state: text('state').$type<ScanBatchState>().notNull().default('UPLOADING'),
    /** A mail campaign (`CP-…`), not a config `SOURCE` id. Attribution only:
     *  scanned leads are never enrolled as members, so no MAS wave reaches them. */
    campaignCode: text('campaign_code').references(() => campaign.code),
    /** Derived from `campaign_code` at the door, stored so the commit does not
     *  re-derive it; `scan_batch_motion_matches_campaign` keeps the two honest. */
    motion: text('motion').$type<'EVENT' | 'OUTBOUND'>().notNull(),
    /** The uploader, and the owner of every lead the commit writes. */
    createdBy: text('created_by')
      .notNull()
      .references(() => actor.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    committedAt: timestamp('committed_at', { withTimezone: true }),
    result: jsonb('result').$type<ScanResult>(),
    error: text('error'),
  },
  (t) => [
    /** "My recent batches" — the scan door reopens the uploader's last one. */
    index('scan_batch_creator_idx').on(t.createdBy, t.createdAt.desc()),

    check('scan_batch_code_shape', sql`"code" ~ '^SCN-[0-9]{4}-[0-9]{2,}$'`),
    /** `ScanBatchState`, copied by hand for `touch_kind_known`'s reason. */
    check(
      'scan_batch_state_known',
      sql`"state" IN ('UPLOADING', 'READING', 'READY', 'COMMITTING', 'DONE', 'FAILED')`,
    ),
    check('scan_batch_motion_known', sql`"motion" IN ('EVENT', 'OUTBOUND')`),
    /** The contract's rule: `EVENT` with a campaign, `OUTBOUND` without. */
    check(
      'scan_batch_motion_matches_campaign',
      sql`("motion" = 'EVENT') = ("campaign_code" IS NOT NULL)`,
    ),
    /** The done screen links to what was written, so DONE must carry it. */
    check('scan_batch_done_has_result', sql`"state" <> 'DONE' OR "result" IS NOT NULL`),
    check('scan_batch_failed_has_error', sql`"state" <> 'FAILED' OR "error" IS NOT NULL`),
  ],
)

/** One file of a batch, and what the AI read from it. */
export const scanFile = sales.table(
  'scan_file',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** CASCADE: a file row means nothing outside its batch. The attachment
     *  survives — it may already hang on a lead. */
    batchCode: text('batch_code')
      .notNull()
      .references(() => scanBatch.code, { onDelete: 'cascade' }),
    /** A real key: the attachment row is written in the same transaction. */
    attachmentId: uuid('attachment_id')
      .notNull()
      .references(() => attachment.id),
    /** A copy of `attachment.sha256` — a UNIQUE cannot span two tables. */
    sha256: text('sha256').notNull(),
    state: text('state').$type<ScanFileState>().notNull().default('QUEUED'),
    kind: text('kind').$type<ScanFileKind>(),
    extraction: jsonb('extraction').$type<ScanExtraction>(),
    note: text('note'),
    error: text('error'),
    /** Model cost of this read. NULL = never read, or reused from a cache hit. */
    tokensIn: integer('tokens_in'),
    tokensOut: integer('tokens_out'),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /** One batch never holds the same bytes twice. Its leading column also
     *  answers "the files of batch X", so no separate index on `batch_code`. */
    unique('scan_file_batch_sha256_unique').on(t.batchCode, t.sha256),
    /** "Has any batch already read these bytes" — reuse the extraction
     *  instead of paying the model twice for one card. */
    index('scan_file_sha256_idx').on(t.sha256),
    /** "Which batch did attachment X come from" (`LeadAttachment.batchCode`).
     *  UNIQUE because one upload is one file of one batch — `owner_code` has
     *  room for one lead, so sharing it across batches could not be recorded. */
    unique('scan_file_attachment_unique').on(t.attachmentId),

    check('scan_file_sha256_hex', sql`"sha256" ~ '^[0-9a-f]{64}$'`),
    /** `ScanFileState` and `ScanFileKind`, copied by hand. */
    check(
      'scan_file_state_known',
      sql`"state" IN ('QUEUED', 'READING', 'READ', 'EMPTY', 'FAILED')`,
    ),
    check(
      'scan_file_kind_known',
      sql`"kind" IN ('BUSINESS_CARD', 'CARD_BACK', 'CARD_SHEET', 'COMPANY_PROFILE', 'OTHER')`,
    ),
    /** The preview is built from extractions; a READ row without one is a hole. */
    check('scan_file_read_has_extraction', sql`"state" <> 'READ' OR "extraction" IS NOT NULL`),
    check('scan_file_failed_has_error', sql`"state" <> 'FAILED' OR "error" IS NOT NULL`),
    check(
      'scan_file_tokens_nonneg',
      sql`("tokens_in" IS NULL OR "tokens_in" >= 0) AND ("tokens_out" IS NULL OR "tokens_out" >= 0)`,
    ),
  ],
)

export type ScanBatchRowDb = typeof scanBatch.$inferSelect
export type ScanFileRowDb = typeof scanFile.$inferSelect
