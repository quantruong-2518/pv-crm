import {
  check,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { MailEngagementKind } from '@pv/contracts'
import { platform } from '@api/platform/db/platform.schema'
import { mailRun } from './mail-run.schema'
import { MAIL_STATES, type MailState, type SuppressionReason } from './mail.contract'

/** One key per engagement kind, checked by the compiler. Type-only import and
 *  a `satisfies Record<…>` for exactly the reasons spelled out at
 *  `MAIL_RUN_STATE_SET` in `mail-run.schema.ts` — read that note before
 *  reaching for `MailEngagementKind.options` here, it does not survive
 *  `drizzle-kit generate`. */
const MAIL_ENGAGEMENT_KIND_SET = {
  OPEN: true,
  CLICK: true,
  UNSUBSCRIBE: true,
} as const satisfies Record<MailEngagementKind, true>

const MAIL_ENGAGEMENT_KIND_LIST = sql.raw(
  Object.keys(MAIL_ENGAGEMENT_KIND_SET)
    .map((s) => `'${s}'`)
    .join(', '),
)

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
 *  cannot turn into two mails.
 *
 *  `mail_run_id` is the batch this letter belongs to. It began life as a bare
 *  nullable `campaign_run_id` holding a place for the MAS branch; when that
 *  branch arrived, the batch turned out to belong to `platform`, not to Sales
 *  — see `mail-run.schema.ts` — so the column was renamed and given the real
 *  foreign key. NULL still means a one-off, which the lead-intake notification
 *  will always be. */
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

    /** The batch this letter was posted with, NULL for a one-off such as the
     *  lead-intake notification. Renamed from `campaign_run_id` when the batch
     *  became `platform.mail_run`: the old name now names a DIFFERENT table
     *  (`sales.campaign_run`, which this column does not and must not point
     *  at), and a foreign key whose name contradicts its target is a trap
     *  rather than documentation. The column had never been read or written,
     *  so the rename moved no data. */
    mailRunId: uuid('mail_run_id').references(() => mailRun.id),

    /** Per-recipient substitution values, resolved before the letter is
     *  composed — `{"company": "…", "contactName": "…"}`.
     *
     *  It is snapshotted here rather than looked up at send time because the
     *  worker composing this letter lives in `platform` and may not read
     *  `sales.lead`. The Sales branch already holds those rows when it queues
     *  the batch, so it writes the values across; the composer then renders
     *  without knowing which branch asked. That is the same boundary the
     *  `MAIL_COMPOSER` token was introduced to keep. */
    merge: jsonb('merge').$type<Record<string, string>>(),

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

/** WHAT THE RECIPIENT DID — deliberately NOT part of `email_delivery.state`.
 *
 *  ------------------------------------------------------------------
 *  WHY AN OPEN MUST NOT MOVE THE DELIVERY ROW
 *  ------------------------------------------------------------------
 *  `mail.contract.ts` ranks delivery states and `advances()` refuses anything
 *  that does not move strictly forward. That ladder answers exactly one
 *  question: did the letter arrive. An open answers a different one, and it
 *  answers it far more weakly — so folding the two into one column would both
 *  corrupt the ladder and let a soft signal overwrite a hard one.
 *
 *  `mail-webhook.controller.ts` therefore keeps `email.opened`/`email.clicked`
 *  out of its `Signal` table for good, and sorts them down a separate road —
 *  `MailLedger.recordEngagement()`, which cannot reach `email_delivery.state`
 *  because the statement that would move it is not in that method. This table
 *  is where they land: additive rows, no state transition, invisible to
 *  `advances()`. `UNSUBSCRIBE` arrives the same way from
 *  `unsubscribe.controller.ts`, without a webhook in sight.
 *
 *  ------------------------------------------------------------------
 *  READ THE OPEN COUNT AS A NOISY FLOOR, NEVER AS TRUTH
 *  ------------------------------------------------------------------
 *  Open tracking is a 1×1 image, and three ordinary cases break it in both
 *  directions. Apple Mail Privacy Protection pre-fetches images for everyone
 *  who has it on, inventing opens nobody performed. Gmail proxies and caches
 *  that image, hiding every open after the first. Anyone reading with images
 *  off registers none at all. A CLICK is a person choosing to act and is worth
 *  much more. Any screen that renders an absent open as "unread" is asserting
 *  something this data cannot support — see `LeadMailTimelineRow`. */
export const mailEvent = platform.table(
  'mail_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** Cascade, unlike anything else in this codebase — `lead.schema.ts`
     *  deliberately refuses it. The difference is that a lead carries history
     *  worth keeping on its own, whereas an engagement row describes a letter
     *  and means nothing once that letter's row is gone. */
    deliveryId: uuid('delivery_id')
      .notNull()
      .references(() => emailDelivery.id, { onDelete: 'cascade' }),

    kind: text('kind').$type<MailEngagementKind>().notNull(),

    /** The provider's timestamp for the event, not our receive time — a
     *  webhook retried an hour later still describes the original moment. */
    at: timestamp('at', { withTimezone: true }).notNull(),

    /** Only ever set for CLICK, enforced below. */
    url: text('url'),

    /** Which webhook envelope carried this, when one did. NULL for events this
     *  system raises itself: an unsubscribe arrives through our own public
     *  route, never through Resend. */
    svixId: text('svix_id'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('mail_event_delivery_idx').on(t.deliveryId),
    index('mail_event_kind_idx').on(t.kind),
    /** Second line of replay defence. `email_webhook_event.svix_id` already
     *  stops a repeated envelope, but two DIFFERENT envelopes can still report
     *  the same open — and an open counted twice becomes a number somebody
     *  reports to a customer. */
    unique('mail_event_once').on(t.deliveryId, t.kind, t.at),
    /** UNSUBSCRIBE needs a SECOND, narrower guard, because the one above does
     *  not hold for it.
     *
     *  `mail_event_once` dedupes on the provider's timestamp, which works for
     *  OPEN and CLICK: a replayed envelope carries the same `at`, so it
     *  collides. An unsubscribe has no provider timestamp — it arrives through
     *  our own route and is stamped `now()` — so two calls produce two
     *  different `at` values and two rows.
     *
     *  And the double call is the NORMAL path, not an edge case: RFC 8058
     *  one-click has the mail client POST automatically, and the same person
     *  then usually clicks the visible link and lands on the GET page. One
     *  letter, one decision, two rows — and "how many unsubscribed" starts
     *  reading high, which is precisely the failure the note above this table
     *  warns about for opens.
     *
     *  A person can unsubscribe from one letter exactly once, so the key is the
     *  delivery alone, restricted to this kind. */
    uniqueIndex('mail_event_unsub_once')
      .on(t.deliveryId)
      .where(sql`${t.kind} = 'UNSUBSCRIBE'`),
    check('mail_event_kind_valid', sql`${t.kind} IN (${MAIL_ENGAGEMENT_KIND_LIST})`),
    /** A click with no destination lost the only thing it was carrying; an
     *  open WITH one is a row somebody filled in by mistake. */
    check('mail_event_url_matches_kind', sql`(${t.kind} = 'CLICK') = (${t.url} IS NOT NULL)`),
  ],
)

export type EmailDeliveryRow = typeof emailDelivery.$inferSelect
export type EmailSuppressionRow = typeof emailSuppression.$inferSelect
export type EmailWebhookEventRow = typeof emailWebhookEvent.$inferSelect
export type MailEventRow = typeof mailEvent.$inferSelect
