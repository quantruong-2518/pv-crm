import { boolean, check, index, text, timestamp } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { actor } from '@api/platform/db/platform.schema'
import { leadOrigin } from '../lead-origin/lead-origin.schema'
import { sales } from '../sales.schema'

/** Referrer code counter — `lead_code_seq`'s reasoning: two writers, one
 *  sequence. The repository formats `REF-%04d`; no rows are planted. */
export const partnerCodeSeq = sales.sequence('partner_code_seq', {
  startWith: 1,
  increment: 1,
  minValue: 1,
  cache: 1,
})

/** Who referred a lead, for the motions whose `motion_policy.asks` is
 *  `REFERRER`. The code is the ref code people quote, so it is the key.
 *
 *  Each partner sits under ONE `lead_origin` (level 2 — a dealer, a past customer),
 *  so a referred lead still rolls up into the origin breakdown. No delete: a
 *  retired partner is switched off, because leads keep naming its code. */
export const partner = sales.table(
  'partner',
  {
    code: text('code').primaryKey(),
    /** Display name as typed — content, not a key. Not UNIQUE: two referrers
     *  can share a name, and the code is what tells them apart. */
    name: text('name').notNull(),
    /** "Which partners sit under origin X" is the picker's question, hence
     *  `partner_origin_idx`. */
    originId: text('origin_id')
      .notNull()
      .references(() => leadOrigin.id),
    active: boolean('active').notNull().default(true),
    /** NULL = written by the machine. */
    createdBy: text('created_by').references(() => actor.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /** No name index: a referrer list is dozens of rows, and `ILIKE '%…%'`
     *  would not use a B-tree anyway. */
    index('partner_origin_idx').on(t.originId),
    /** `{4,}` not `{4}`: `%04d` pads, it does not truncate, so REF-10000 is legal. */
    check('partner_code_shape', sql`"code" ~ '^REF-[0-9]{4,}$'`),
    check('partner_no_blank', sql`"name" <> ''`),
  ],
)

export type PartnerRowDb = typeof partner.$inferSelect
