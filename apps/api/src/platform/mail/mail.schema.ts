import { check, index, integer, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { platform } from '@api/platform/db/platform.schema'
import { MAIL_STATES, type MailState, type SuppressionReason } from './mail.contract'

/** One value list, quoted once. `sql.raw` — not `sql.join` over `sql\`${s}\`` —
 *  because a DDL statement has no bind parameters to fill at migration time;
 *  interpolating each state as a normal value emits `$1, $2, …` into the
 *  generated `.sql` file with nothing to substitute them, which is invalid
 *  syntax outside a prepared statement. `MAIL_STATES` is still the contract's
 *  own ordering — reusing it here is what keeps the CHECK from drifting out
 *  of sync with the `advances()` rank table the moment a state is renamed or
 *  added there. */
const MAIL_STATE_LIST = sql.raw(MAIL_STATES.map((s) => `'${s}'`).join(', '))

/** The one send ledger — transactional mail today, MAS campaign mail later.
 *  One table rather than two because both need the exact same lifecycle
 *  (`MAIL_STATES`), the exact same replay protection (`idempotency_key`), and
 *  a queue worker that should not have to know which kind of mail it is
 *  currently retrying.
 *
 *  `event_key` is the anti-duplicate spine end to end: it is what
 *  `enqueue()` conflicts on, and it is reused verbatim as the Resend
 *  idempotency key, so a crash between "Resend accepted" and "row updated"
 *  cannot turn into two mails. `campaign_run_id` has no foreign key yet — the
 *  table it would point at does not exist — it is a bare nullable column so
 *  the MAS branch, when it arrives, adds a reference instead of a migration
 *  that widens this table. */
export const emailDelivery = platform.table(
  'email_delivery',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventKey: text('event_key').notNull().unique(),
    eventType: text('event_type').notNull(),
    aggregateType: text('aggregate_type').notNull(),
    aggregateId: text('aggregate_id').notNull(),
    template: text('template').notNull(),
    templateVersion: integer('template_version').notNull(),
    /** Always the lower-cased, trimmed form — `isSuppressed()` and
     *  `email_suppression.recipient` compare on that same normal form. */
    recipient: text('recipient').notNull(),
    state: text('state').$type<MailState>().notNull(),
    provider: text('provider').notNull().default('resend'),
    /** Set once Resend accepts the send; unique so a webhook can find its way
     *  back to exactly one delivery — see `applyWebhook()`. */
    providerEmailId: text('provider_email_id').unique(),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    attemptCount: integer('attempt_count').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }),
    lastErrorCode: text('last_error_code'),
    lastErrorSummary: text('last_error_summary'),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    campaignRunId: uuid('campaign_run_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('email_delivery_state_idx').on(t.state),
    index('email_delivery_next_attempt_idx').on(t.nextAttemptAt),
    index('email_delivery_aggregate_idx').on(t.aggregateId),
    index('email_delivery_recipient_idx').on(t.recipient),
    check('email_delivery_state_valid', sql`${t.state} IN (${MAIL_STATE_LIST})`),
  ],
)

/** A block at the ADDRESS, not the lead. A hard bounce on
 *  `a@b.com` must stop every future mail to that address regardless of which
 *  lead or campaign run is asking — that is the whole reason this is a
 *  separate table instead of a flag on `email_delivery`. */
export const emailSuppression = platform.table('email_suppression', {
  recipient: text('recipient').primaryKey(),
  reason: text('reason').$type<SuppressionReason>().notNull(),
  source: text('source').$type<'resend' | 'operator'>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  /** NULL = currently suppressed. A value here means a human deliberately let
   *  this address back in — `isSuppressed()` reads exactly this column. */
  releasedAt: timestamp('released_at', { withTimezone: true }),
})

/** Svix replay guard, nothing else. `svix_id` is the whole defence: Resend
 *  retries a webhook it never got a 2xx for, and the primary key is what
 *  turns the second delivery of the same event into a no-op before it ever
 *  reaches `email_delivery`. No payload, no email content, no signing
 *  secret — a row here is safe to read by anyone with database access. */
export const emailWebhookEvent = platform.table('email_webhook_event', {
  svixId: text('svix_id').primaryKey(),
  type: text('type').notNull(),
  emailId: text('email_id'),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
})

export type EmailDeliveryRow = typeof emailDelivery.$inferSelect
export type EmailSuppressionRow = typeof emailSuppression.$inferSelect
export type EmailWebhookEventRow = typeof emailWebhookEvent.$inferSelect
