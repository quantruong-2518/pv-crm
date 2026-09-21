import { boolean, check, primaryKey, text, timestamp, type AnyPgColumn } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { LeadMotion } from '@pv/contracts'
import { actor } from '@api/platform/db/platform.schema'
import { sales } from '../sales.schema'

/** Origin id counter — `lead_code_seq`'s reasoning: two writers, one sequence.
 *  The repository formats `LO-%04d`. Migration 0057 plants LO-0001…LO-0022 and
 *  moves the counter past them with `setval`. */
export const leadOriginCodeSeq = sales.sequence('lead_origin_code_seq', {
  startWith: 1,
  increment: 1,
  minValue: 1,
  cache: 1,
})

/** Level 2 of a lead's origin: WHERE it came from, under `lead.motion` (level 1,
 *  who moved first). Unlike motion this list is OPEN — users add to it — so the
 *  risk flips from "an other bucket" to "the same place typed five ways".
 *
 *  `key` is the fence against that: `originKey()` in `@pv/contracts` folds a
 *  name (case, diacritics, the barred d, spaces, domain suffix) to `[a-z0-9]+`,
 *  and the UNIQUE here makes "Zalo OA" and "zalo-oa" one row. The DB does not
 *  normalise; it only refuses a key that is not already normalised.
 *
 *  No delete: a wrong or duplicate origin is MERGED (`merged_into`) and switched
 *  off, so leads already pointing at it stay readable. */
export const leadOrigin = sales.table(
  'lead_origin',
  {
    id: text('id').primaryKey(),
    /** Display label as typed — may be Vietnamese; it is content, not a key. */
    name: text('name').notNull(),
    key: text('key').notNull().unique('lead_origin_key_unique'),
    active: boolean('active').notNull().default(true),
    /** The survivor of a merge. The service repoints leads and aliases; this
     *  column is what lets a late write under the old id be followed. */
    mergedInto: text('merged_into').references((): AnyPgColumn => leadOrigin.id),
    /** NULL = planted by a migration or written by the machine. */
    createdBy: text('created_by').references(() => actor.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  () => [
    /** A blank key is already refused by `lead_origin_key_shape` (`+`). */
    check('lead_origin_no_blank', sql`"name" <> ''`),
    /** The output alphabet of `originKey()`, copied out so a key that skipped
     *  the normaliser cannot land and later miss its own duplicate. */
    check('lead_origin_key_shape', sql`"key" ~ '^[a-z0-9]+$'`),
    check('lead_origin_not_self_merged', sql`"merged_into" <> "id"`),
    /** A merged origin must not stay pickable — two live rows for one place is
     *  the duplicate the merge was meant to remove. */
    check('lead_origin_merged_inactive', sql`"merged_into" IS NULL OR "active" = false`),
  ],
)

/** Extra keys that resolve to an origin ("fb" → Facebook), so a typed synonym
 *  finds the existing row instead of minting a new one.
 *
 *  NOT fenced here, and known: a key may not be both an origin's `key` and an
 *  alias of ANOTHER origin. Two tables cannot share a UNIQUE without a trigger,
 *  so the service checks both before writing either. */
export const leadOriginAlias = sales.table(
  'lead_origin_alias',
  {
    key: text('key').primaryKey(),
    originId: text('origin_id')
      .notNull()
      .references(() => leadOrigin.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  () => [check('lead_origin_alias_key_shape', sql`"key" ~ '^[a-z0-9]+$'`)],
)

/** Which motions an origin is offered under. n:m — LinkedIn is both INBOUND
 *  (they wrote to us) and OUTBOUND (we wrote to them). */
export const leadOriginMotion = sales.table(
  'lead_origin_motion',
  {
    originId: text('origin_id')
      .notNull()
      .references(() => leadOrigin.id),
    motion: text('motion').$type<LeadMotion>().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.originId, t.motion] }),
    /** The six, copied by hand for `motion_policy_motion_known`'s reason. */
    check(
      'lead_origin_motion_motion_known',
      sql`"motion" IN ('INBOUND', 'OUTBOUND', 'EVENT', 'REFERRAL', 'PARTNER', 'RECYCLE')`,
    ),
  ],
)

export type LeadOriginRowDb = typeof leadOrigin.$inferSelect
export type LeadOriginAliasRowDb = typeof leadOriginAlias.$inferSelect
export type LeadOriginMotionRowDb = typeof leadOriginMotion.$inferSelect
