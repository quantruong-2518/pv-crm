import { check, index, integer, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { sales } from '../sales.schema'
import { lead } from './lead.schema'

export type LeadIntakeStatus = 'accepted' | 'duplicate' | 'honeypot'

/** One bounded audit row per public submission. Personal profile fields stay
 *  in `sales.lead`; this table keeps only attribution and abuse evidence. */
export const leadIntake = sales.table(
  'lead_intake',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    leadCode: text('lead_code').references(() => lead.code),
    status: text('status').$type<LeadIntakeStatus>().notNull(),
    landingPage: text('landing_page').notNull(),
    ipHash: text('ip_hash').notNull(),
    origin: text('origin'),
    referrer: text('referrer'),
    userAgent: text('user_agent'),
    utmSource: text('utm_source'),
    utmMedium: text('utm_medium'),
    utmCampaign: text('utm_campaign'),
    utmContent: text('utm_content'),
    utmTerm: text('utm_term'),
  },
  (t) => [
    index('lead_intake_received_idx').on(t.receivedAt),
    index('lead_intake_lead_idx').on(t.leadCode),
    index('lead_intake_page_idx').on(t.landingPage),
    check('lead_intake_status_valid', sql`${t.status} IN ('accepted', 'duplicate', 'honeypot')`),
  ],
)

/** Shared fixed-window counters. They live in Postgres so two API Machines do
 *  not each grant a separate budget to the same client. Keys are HMAC hashes;
 *  raw client IPs are never persisted. */
export const leadIntakeRate = sales.table(
  'lead_intake_rate',
  {
    keyHash: text('key_hash').primaryKey(),
    scope: text('scope').notNull(),
    minuteStartedAt: timestamp('minute_started_at', { withTimezone: true }).notNull(),
    minuteCount: integer('minute_count').notNull(),
    dayStartedAt: timestamp('day_started_at', { withTimezone: true }).notNull(),
    dayCount: integer('day_count').notNull(),
    blockedUntil: timestamp('blocked_until', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('lead_intake_rate_updated_idx').on(t.updatedAt),
    check('lead_intake_rate_counts_positive', sql`${t.minuteCount} > 0 AND ${t.dayCount} > 0`),
  ],
)
