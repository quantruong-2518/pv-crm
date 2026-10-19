import {
  check,
  date,
  index,
  integer,
  numeric,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { AiCallOutcome, AiTask } from '@pv/contracts'
import { actor, platform } from '../db/platform.schema'

/** The AI cost ledger — one row per model call, success or failure (ADR 0102).
 *
 *  `platform`, not a branch: every branch's AI task writes here, and the future
 *  orchestrator adds task kinds, not a second table.
 *
 *  Counts only, never prompt or answer text: the text is customer data and the
 *  ledger is read by whoever holds `cost.view`. No cost column either — cost is
 *  tokens × `ai_price`, computed on read, so a corrected price corrects the past.
 *
 *  Append-only, like `audit`: a ledger that can be edited cannot answer what was spent. */
export const aiCall = platform.table(
  'ai_call',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    task: text('task').$type<AiTask>().notNull(),
    /** The vendor's model id as sent (`gemini-3.8-flash`), the join key into `ai_price`. */
    model: text('model').notNull(),
    tokensIn: integer('tokens_in').notNull(),
    /** Includes thinking tokens: the vendor bills them as output. */
    tokensOut: integer('tokens_out').notNull(),
    outcome: text('outcome').$type<AiCallOutcome>().notNull(),
    /** Who pressed; NULL means a system job, so no SET NULL on delete — that
     *  would move a person's spend into the system line. A real FK: writers pass
     *  an actor id or NULL — lead scan passes `scan_batch.created_by`, already one. */
    actorId: text('actor_id').references(() => actor.id),
    /** What the call was for (a scan batch code), for tracing. No FK, for
     *  `notification.subject_code`'s reason: it names several kinds of thing. */
    subjectCode: text('subject_code'),
    /** `'scan_file:' || id`, written by 0122's backfill only, so re-running it
     *  adds nothing. NULL on every live write; NULLs never collide in a UNIQUE. */
    sourceKey: text('source_key'),
  },
  (t) => [
    /** A constraint, not a partial index, so `ON CONFLICT (source_key)` can name it. */
    unique('ai_call_source_key_uq').on(t.sourceKey),
    /** "Every call in month M" — the cost report's totals, by day, task and model. */
    index('ai_call_at_idx').on(t.at),
    /** "One person's calls in a date range" — the spend of a person, scoped by month. */
    index('ai_call_actor_at_idx').on(t.actorId, t.at),
    /** `AiTask`, copied by hand: a new task kind must be a migration a person reads. */
    check('ai_call_task_known', sql`"task" IN ('lead-scan')`),
    check('ai_call_outcome_known', sql`"outcome" IN ('ok', 'error')`),
    check('ai_call_tokens_in_not_negative', sql`"tokens_in" >= 0`),
    check('ai_call_tokens_out_not_negative', sql`"tokens_out" >= 0`),
  ],
)

/** Unit price history per model, USD per 1M tokens, entered by an admin.
 *
 *  A call is priced by its model's row with the greatest `effective_from` on or
 *  before the call's date in Asia/Ho_Chi_Minh; no row means unpriced, never 0.
 *  Nothing is seeded: we do not invent prices.
 *
 *  The natural key is the primary key, as in `setting`: the API names a row by
 *  model and date and never by a surrogate. Its leading column also answers
 *  "model M's prices, newest first", so no other index. */
export const aiPrice = platform.table(
  'ai_price',
  {
    model: text('model').notNull(),
    /** `numeric`, not float: six decimals of a dollar must sum without drift. */
    inputUsdPerMTok: numeric('input_usd_per_mtok', { precision: 14, scale: 6 }).notNull(),
    outputUsdPerMTok: numeric('output_usd_per_mtok', { precision: 14, scale: 6 }).notNull(),
    /** A calendar day in Vietnam time, not an instant: the admin picks a date. */
    effectiveFrom: date('effective_from').notNull(),
    /** A real FK for `setting.updated_by`'s reason: only a signed-in admin writes. */
    setById: text('set_by_id')
      .notNull()
      .references(() => actor.id),
    setAt: timestamp('set_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'ai_price_pk', columns: [t.model, t.effectiveFrom] }),
    check('ai_price_input_not_negative', sql`"input_usd_per_mtok" >= 0`),
    check('ai_price_output_not_negative', sql`"output_usd_per_mtok" >= 0`),
  ],
)

export type AiCallRowDb = typeof aiCall.$inferSelect
export type AiCallValues = typeof aiCall.$inferInsert
export type AiPriceRowDb = typeof aiPrice.$inferSelect
export type AiPriceValues = typeof aiPrice.$inferInsert
