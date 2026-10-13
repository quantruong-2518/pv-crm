import { boolean, check, index, jsonb, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { NotificationKind, NotificationSubject } from '@pv/contracts'
import type { RoleId } from '@pv/engines'
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
    /** Lead/opportunity code, approval id, scan batch id, run id, actor id or
     *  `comms.debrief` id (`comm-record`). */
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
    /** "How many have I not read" — the badge, re-asked on every stream signal.
     *  Partial: read rows are the bulk of the table and never counted. */
    index('notification_recipient_unread_idx')
      .on(t.recipientId)
      .where(sql`"read_at" IS NULL`),
    /** "Which read rows are past 90 days" — the hourly purge, `read_at < mark`.
     *  Partial: unread rows are never purged and `<` is false on NULL anyway. */
    index('notification_read_purge_idx')
      .on(t.readAt)
      .where(sql`"read_at" IS NOT NULL`),
    /** The twenty-six `NotificationKind` values, copied out for
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
                     'access-changed', 'password-reset-by-admin', 'google-link-broken',
                     'comm-record-late')`,
    ),
    /** The `NotificationSubject` values, copied out for the same reason. */
    check(
      'notification_subject_kind_known',
      sql`"subject_kind" IN ('lead', 'lead-pool', 'opportunity', 'approval', 'lead-scan', 'mail-run',
                             'user', 'google-link', 'comm-record')`,
    ),
  ],
)

export type NotificationRowDb = typeof notification.$inferSelect
export type NotificationValues = typeof notification.$inferInsert

/** One admin override of a kind's defaults (ADR 0093 §1). No row = the defaults
 *  in `NOTIFICATION_KIND_POLICY` (`@pv/contracts`), the ordinary state.
 *
 *  It stores MUTES, not grants, so a kind added later reaches everyone until
 *  somebody mutes it; the reverse, as in `role_permission`, would silence it.
 *  Locked kinds are refused by the API, not here: the locked set is contract
 *  data, and a CHECK copy would drift from it.
 *
 *  No index beyond the primary key: the hub asks "this kind's row" (the key)
 *  and the admin screen asks "every row", at most one per kind — a scan. */
export const notificationKindPolicy = platform.table(
  'notification_kind_policy',
  {
    kind: text('kind').$type<NotificationKind>().primaryKey(),

    /** `null` = follow the contract default, so saving a mute never freezes
     *  importance at today's default; only a deliberate switch stores a value. */
    important: boolean('important'),

    /** Roles that do not receive this kind. A person is dropped only when a role
     *  they hold is listed and every other one is listed or not applicable
     *  (ADR 0093 §2). Empty is normal: importance changed, nobody muted. */
    mutedRoleIds: text('muted_role_ids').array().$type<RoleId[]>().notNull().default([]),

    /** Who changed it. A real FK for `setting.updated_by`'s reason: only a
     *  signed-in `setting.manage` holder writes, and nobody's choice is no row. */
    updatedBy: text('updated_by')
      .notNull()
      .references(() => actor.id),

    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  () => [
    /** `notification_kind_known`'s list, copied by hand for the same reason. */
    check(
      'notification_kind_policy_kind_known',
      sql`"kind" IN ('lead-pooled', 'lead-received', 'lead-removed', 'lead-re-entered',
                     'lead-stopped', 'lead-scan-ready', 'lead-scan-committed',
                     'lead-scan-failed', 'opportunity-awaiting-accept', 'opportunity-lost',
                     'opportunity-accepted', 'opportunity-assigned', 'opportunity-unassigned',
                     'next-step-assigned', 'next-step-done', 'approval-waiting',
                     'approval-approved', 'approval-rejected', 'mail-run-sent',
                     'mail-run-cancelled', 'mail-failed', 'customer-replied',
                     'access-changed', 'password-reset-by-admin', 'google-link-broken',
                     'comm-record-late')`,
    ),
    /** `actor_role_ids_known`'s list: a typo'd role would mute nobody, silently. */
    check(
      'notification_kind_policy_muted_roles_known',
      sql`"muted_role_ids" <@ ARRAY['director', 'head-of-sales', 'marketing', 'bd', 'presales', 'sale', 'account-executive']::text[]`,
    ),
  ],
)

export type NotificationKindPolicyRowDb = typeof notificationKindPolicy.$inferSelect
export type NotificationKindPolicyValues = typeof notificationKindPolicy.$inferInsert
