import { check, index, jsonb, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { NotificationKind, NotificationSubject } from '@pv/contracts'
import { actor, platform } from '../db/platform.schema'

/** The bell's ledger — one row per person per thing worth telling them.
 *
 *  `platform`, not a branch: leads, approvals, mail runs and account changes all
 *  ring the same bell, and E4 (`e4-bell-rules.ts`) decides the kind for all of them.
 *
 *  Strictly private: every read and every "mark read" MUST filter by
 *  `recipient_id`. The routes carry no permission key, so that filter is the fence.
 *
 *  `subject_code` has no foreign key, for `touch.subject_code`'s reason taken
 *  further: it points at several kinds of thing, some of which have no
 *  `platform.object` row at all (a scan batch, a mail run, a Google link). A
 *  row whose subject later vanishes is a line whose click lands on "not found";
 *  a write refused for a missing mirror would roll back the caller's own work. */
export const notification = platform.table(
  'notification',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** CASCADE, like `user_pin`: a bell line belongs to its reader and means
     *  nothing to anyone else. A real FK because a recipient is by definition
     *  somebody who can sign in and open the bell — a caller that resolves an
     *  audience to a non-actor id has a bug this fence should surface. */
    recipientId: text('recipient_id')
      .notNull()
      .references(() => actor.id, { onDelete: 'cascade' }),

    kind: text('kind').$type<NotificationKind>().notNull(),

    /** `<kind>/<code>[/<occurrence>]`, built by E4's `plan`. The collapse key:
     *  the same news about the same thing reaches one person once. */
    eventKey: text('event_key').notNull(),

    /** Where a click goes. Kind alone cannot say: `mail-failed` and
     *  `customer-replied` land on a lead or an opportunity. */
    subjectKind: text('subject_kind').$type<NotificationSubject>().notNull(),
    /** Lead/opportunity code, approval id, scan batch id, run id or actor id. */
    subjectCode: text('subject_code').notNull(),
    /** Company or run name copied at write time, so the bell never joins into
     *  another module to draw a line. NULL when the subject has no name. */
    subjectLabel: text('subject_label'),

    /** Who caused it; NULL = the system. SET NULL rather than cascade: the news
     *  is still true after the person who caused it is removed. */
    actorId: text('actor_id').references(() => actor.id, { onDelete: 'set null' }),

    /** Small display facts only (a count, a reason sentence). Never read here. */
    detail: jsonb('detail').$type<Record<string, unknown>>(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** Read since WHEN, the repo's mark convention; the 90-day purge counts from it. */
    readAt: timestamp('read_at', { withTimezone: true }),
  },
  (t) => [
    /** A constraint, not a partial index, so `ON CONFLICT (recipient_id,
     *  event_key) DO NOTHING` can name it: a second insert is ignored, never an
     *  error that would roll back the caller's transaction. */
    unique('notification_recipient_event_uq').on(t.recipientId, t.eventKey),
    /** "My bell, newest first" — `GET /notifications`, filter and order in one. */
    index('notification_recipient_recent_idx').on(t.recipientId, t.createdAt.desc()),
    /** "How many have I not read" — the badge, asked every 60 s per open tab.
     *  Partial: read rows are the bulk of the table and never counted. */
    index('notification_recipient_unread_idx')
      .on(t.recipientId)
      .where(sql`"read_at" IS NULL`),
    /** The twenty-five `NotificationKind` values, copied out for
     *  `touch_kind_known`'s reason: a new kind must be a migration somebody reads. */
    check(
      'notification_kind_known',
      sql`"kind" IN ('lead-pooled', 'lead-received', 'lead-removed', 'lead-re-entered',
                     'lead-stopped', 'lead-scan-ready', 'lead-scan-committed',
                     'lead-scan-failed', 'opportunity-awaiting-accept', 'opportunity-lost',
                     'opportunity-accepted', 'opportunity-assigned', 'opportunity-unassigned',
                     'next-step-assigned', 'next-step-done', 'approval-waiting',
                     'approval-approved', 'approval-rejected', 'mail-run-sent',
                     'mail-run-cancelled', 'mail-failed', 'customer-replied',
                     'access-changed', 'password-reset-by-admin', 'google-link-broken')`,
    ),
    /** The `NotificationSubject` values, copied out for the same reason. */
    check(
      'notification_subject_kind_known',
      sql`"subject_kind" IN ('lead', 'lead-pool', 'opportunity', 'approval', 'lead-scan', 'mail-run',
                             'user', 'google-link')`,
    ),
  ],
)

export type NotificationRowDb = typeof notification.$inferSelect
export type NotificationValues = typeof notification.$inferInsert
