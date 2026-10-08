import { check, text, timestamp } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { actor, platform } from '../db/platform.schema'

/** One employee's link to their own Google account, for Calendar sync.
 *
 *  Per person, not per company: a meeting lands on the calendar of whoever
 *  booked it, so the token must be that person's. One row per actor — the
 *  primary key is `actor_id`, so reconnecting overwrites instead of piling up.
 *
 *  Lives in `platform` beside `actor`: it is identity plumbing no branch owns,
 *  and `sales.meeting` points at the owner by `actor.id`, never at this table. */
export const googleLink = platform.table(
  'google_link',
  {
    /** CASCADE is right here, unlike the business tables that reference `actor`:
     *  a link is a credential, not history. A removed person's refresh token
     *  must not outlive them in the database. */
    actorId: text('actor_id')
      .primaryKey()
      .references(() => actor.id, { onDelete: 'cascade' }),

    /** The Google account that was authorised — may differ from `actor.email`
     *  (a person can link a personal Gmail), so it is stored, not derived. */
    googleEmail: text('google_email').notNull(),

    /** AES-GCM CIPHERTEXT produced by the app (never plaintext), so a leaked
     *  dump or read-only DB credential does not yield a usable Google token.
     *  The database cannot tell ciphertext from plaintext and no CHECK could:
     *  the guarantee lives in the one service that writes this column. */
    refreshTokenEnc: text('refresh_token_enc').notNull(),

    /** The OAuth scope string Google actually granted, space-separated. Kept
     *  because a user can untick a box on the consent screen, and the sync
     *  must know whether it may write events before trying. */
    scope: text('scope').notNull(),

    connectedAt: timestamp('connected_at', { withTimezone: true }).notNull().defaultNow(),
  },
  () => [
    /** A shape check, not validation: it only refuses the empty string and
     *  obvious junk reaching the table from a bad migration or a hand edit. */
    check('google_link_email_has_at', sql`"google_email" LIKE '%@%'`),
  ],
)

export type GoogleLinkRowDb = typeof googleLink.$inferSelect
export type GoogleLinkValues = typeof googleLink.$inferInsert
