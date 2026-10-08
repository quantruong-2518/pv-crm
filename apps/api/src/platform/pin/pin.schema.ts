import { check, index, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { PinSubject } from '@pv/contracts'
import { actor, platform } from '../db/platform.schema'

/** One person's pin on one lead or opportunity — moved off the browser so a
 *  pin follows its owner to another device.
 *
 *  Strictly private: every read MUST filter by `actor_id`, nobody sees another's pins.
 *
 *  `code` has no foreign key, for `touch.subject_code`'s reason: it points at
 *  two tables, and `platform.object`'s opportunity mirror is discipline rather
 *  than a fence. A pin on a code that later vanishes is a dead row the book
 *  simply never joins to — harmless, unlike a write refused for a missing mirror. */
export const userPin = platform.table(
  'user_pin',
  {
    /** CASCADE, like `google_link`: a pin is a personal preference, not history,
     *  and a removed person's pins mean nothing to anyone else. A real FK because
     *  only a signed-in actor ever writes one, so the row always exists. */
    actorId: text('actor_id')
      .notNull()
      .references(() => actor.id, { onDelete: 'cascade' }),
    subjectType: text('subject_type').$type<PinSubject>().notNull(),
    code: text('code').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /** One pin per person per object, which makes re-pinning idempotent. Also
     *  answers the book's `pinned` filter: "has THIS actor pinned THIS code". */
    primaryKey({ columns: [t.actorId, t.subjectType, t.code] }),
    /** "My pinned leads (or opportunities), newest pin first" — `GET /pins`.
     *  The primary key filters on the same prefix but cannot serve the order. */
    index('user_pin_actor_recent_idx').on(t.actorId, t.subjectType, t.createdAt.desc()),
    /** The two `PinSubject` values, copied out: a new pinnable kind must be a
     *  migration somebody reads. */
    check('user_pin_subject_type_known', sql`"subject_type" IN ('lead', 'opportunity')`),
  ],
)

export type UserPinRowDb = typeof userPin.$inferSelect
export type UserPinValues = typeof userPin.$inferInsert
