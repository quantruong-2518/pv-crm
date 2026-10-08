import { check, index, integer, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { SearchKind } from '@pv/contracts'
import { actor } from '@api/platform/db/platform.schema'
import { sales } from '../sales.schema'

/** One person's recent global searches and picks (`GET|POST /sales/search/recent`).
 *
 *  Two kinds of row share the table, told apart by `picked_code`:
 *   · a PICK (`picked_kind` + `picked_code` set): "I opened this record". One row
 *     per record per person, so re-picking moves `at` instead of adding a row.
 *   · a QUERY (both NULL): "I searched this and picked nothing". One row per
 *     query text per person; `result_count = 0` rows are the log of searches
 *     that found nothing.
 *
 *  `picked_code` has NO foreign key, for `touch.subject_code`'s reason: it
 *  points at five different tables. The read re-resolves kind + code through
 *  the search repository, so a deleted, disabled or no-longer-visible record
 *  just drops out of the list. The service says how many rows to keep; the write trims to that. */
export const searchRecent = sales.table(
  'search_recent',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** CASCADE: a person's search history has no meaning without the person. */
    actorId: text('actor_id')
      .notNull()
      .references(() => actor.id, { onDelete: 'cascade' }),
    /** The text as typed (trimmed). May be '' when a record was picked from the
     *  empty "recent" list, so no CHECK demands a non-blank value. */
    q: text('q').notNull(),
    /** The kind filter active at the time; NULL = all kinds. */
    kinds: text('kinds').array().$type<SearchKind[]>(),
    pickedKind: text('picked_kind').$type<SearchKind>(),
    /** The code of the record to OPEN (a contact hit carries its lead's code). */
    pickedCode: text('picked_code'),
    resultCount: integer('result_count').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /** "This person's newest rows" — the recent list and the 20-row trim. */
    index('search_recent_actor_at_idx').on(t.actorId, t.at.desc()),
    /** "Has this person already picked this record?" — the upsert target. */
    uniqueIndex('search_recent_pick_uq')
      .on(t.actorId, t.pickedKind, t.pickedCode)
      .where(sql`"picked_code" IS NOT NULL`),
    /** "Has this person already run this query without picking?" — the upsert target. */
    uniqueIndex('search_recent_query_uq')
      .on(t.actorId, t.q)
      .where(sql`"picked_code" IS NULL`),

    /** The six `SEARCH_KINDS`, copied out: the list growing must be a migration
     *  somebody reads. */
    check(
      'search_recent_picked_kind_known',
      sql`"picked_kind" IS NULL OR "picked_kind" IN ('lead', 'account', 'contact', 'opportunity', 'campaign', 'contract')`,
    ),
    /** A kind with no code, or a code with no kind, cannot be opened. */
    check('search_recent_pick_is_whole', sql`("picked_kind" IS NULL) = ("picked_code" IS NULL)`),
    check('search_recent_count_nonneg', sql`"result_count" >= 0`),
  ],
)

export type SearchRecentRowDb = typeof searchRecent.$inferSelect
export type SearchRecentValues = typeof searchRecent.$inferInsert
