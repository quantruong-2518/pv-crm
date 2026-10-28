import { boolean, check, integer, text, timestamp } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { AiTask } from '@pv/contracts'
import { actor, platform } from '../db/platform.schema'

/** Which model runs an AI task, with the ceilings the gateway enforces.
 *
 *  One row per `AiTask`, read per call: the primary key is the only lookup, so
 *  no cache and no other index. The vendor is not a column; it is the model id's
 *  prefix (`claude-` or `gemini-`), so a vendor and a model cannot disagree.
 *
 *  Limits use 0 for "no limit" and NULL for "not counted" where a number would
 *  lie: a 0-token ceiling would otherwise read as "refuse everything". */
export const aiRoute = platform.table(
  'ai_route',
  {
    task: text('task').$type<AiTask>().primaryKey(),
    primaryModel: text('primary_model').notNull(),
    /** Tried when the primary times out or the vendor is down; NULL = no fallback. */
    fallbackModel: text('fallback_model'),
    /** NULL = input is not counted before sending; set = counted, over it is refused. */
    maxTokensIn: integer('max_tokens_in'),
    maxTokensOut: integer('max_tokens_out').notNull(),
    timeoutMs: integer('timeout_ms').notNull(),
    /** Calls one person may start in a rolling 24 h; 0 = no limit. */
    dailyCallsPerUser: integer('daily_calls_per_user').notNull(),
    /** Tokens the whole task may spend in a rolling 24 h; 0 = no limit. */
    dailyTokenBudget: integer('daily_token_budget').notNull(),
    enabled: boolean('enabled').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    /** NULL only for the migration's seed row. A real FK: only a signed-in admin
     *  edits a route, so the `actor` row exists by the time the write runs. */
    updatedBy: text('updated_by').references(() => actor.id),
  },
  () => [
    /** `AiTask`, copied by hand: a new task kind must be a migration a person reads. */
    check('ai_route_task_known', sql`"task" IN ('lead-scan', 'lead-enrich')`),
    /** The two vendors' prefixes, copied by hand like `AiModel` in the contract. */
    check('ai_route_primary_model_known', sql`"primary_model" ~ '^(claude|gemini)-[a-z0-9.-]+$'`),
    check(
      'ai_route_fallback_model_known',
      sql`"fallback_model" IS NULL OR "fallback_model" ~ '^(claude|gemini)-[a-z0-9.-]+$'`,
    ),
    /** A fallback that is the primary retries the same outage. */
    check(
      'ai_route_fallback_differs',
      sql`"fallback_model" IS NULL OR "fallback_model" <> "primary_model"`,
    ),
    check('ai_route_max_tokens_in_positive', sql`"max_tokens_in" IS NULL OR "max_tokens_in" > 0`),
    check('ai_route_max_tokens_out_positive', sql`"max_tokens_out" > 0`),
    check('ai_route_timeout_range', sql`"timeout_ms" BETWEEN 1 AND 90000`),
    check('ai_route_daily_calls_not_negative', sql`"daily_calls_per_user" >= 0`),
    check('ai_route_daily_budget_not_negative', sql`"daily_token_budget" >= 0`),
  ],
)

export type AiRouteRowDb = typeof aiRoute.$inferSelect
export type AiRouteValues = typeof aiRoute.$inferInsert
