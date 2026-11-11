import { check, date, numeric, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { actor, platform } from '@api/platform/db/platform.schema'

/** One Vietcombank transfer-buying rate (VND per 1 unit of `currency`) for one
 *  Vietnam calendar day. A foreign amount converts at the row of the day its
 *  money event happened, or the nearest earlier row — weekends have no row.
 *
 *  No `platform.object` mirror: a rate is reference data, not a thing in a
 *  story. VND never has rows (its rate is 1). The `legacy` row dated
 *  2000-01-01 makes every past event resolve to 26,400, so no closed KPI month
 *  moves. */
export const fxRate = platform.table(
  'fx_rate',
  {
    /** ISO code of the foreign currency, never VND. */
    currency: text('currency').notNull(),
    /** Vietnam calendar day (Asia/Ho_Chi_Minh), a `date` so no timezone slides it. */
    day: date('day', { mode: 'string' }).notNull(),
    /** VND per unit. numeric(14,2): the feed publishes two decimals. */
    rate: numeric('rate', { precision: 14, scale: 2 }).notNull(),
    /** `'vietcombank' | 'manual' | 'legacy'`. `manual` wins over `vietcombank` for the
     *  same day; `legacy` is the one backfilled row. */
    source: text('source').$type<'vietcombank' | 'manual' | 'legacy'>().notNull(),
    /** Who typed the rate, for `manual` only. No ON DELETE action: an actor is
     *  switched off, never deleted, and the audit trail should keep its author. */
    setBy: text('set_by').references(() => actor.id),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /** "Rate for currency X on day D", and "nearest earlier day" as a descending range scan. */
    primaryKey({ columns: [t.currency, t.day] }),

    /** Only USD besides VND today. A new currency is a migration a person reads:
     *  its feed column, its display and its backfill row all change with it. */
    check('fx_rate_currency_known', sql`"currency" = 'USD'`),
    check('fx_rate_positive', sql`"rate" > 0`),
    /** `'vietcombank' | 'manual' | 'legacy'`, copied by hand for the same reason. */
    check('fx_rate_source_known', sql`"source" IN ('vietcombank', 'manual', 'legacy')`),
    /** A manual rate always names its author; a fetched one never does. */
    check('fx_rate_manual_has_author', sql`("source" = 'manual') = ("set_by" IS NOT NULL)`),
  ],
)

export type FxRateRowDb = typeof fxRate.$inferSelect
