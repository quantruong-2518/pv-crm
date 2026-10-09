import {
  boolean,
  check,
  index,
  text,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { actor } from '@api/platform/db/platform.schema'
import { contact } from '../contact/contact.schema'
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
    /** Random `ABC-123` shown in the partner book. Display only: leads point at `code`. */
    ref: text('ref').notNull(),
    /** "Which partners sit under origin X" is the picker's question, hence
     *  `partner_origin_idx`. */
    originId: text('origin_id')
      .notNull()
      .references(() => leadOrigin.id),
    /** The contact this referrer is, when already in the book. SET NULL on
     *  delete: the ref code outlives the contact row, leads keep naming it. */
    contactCode: text('contact_code').references((): AnyPgColumn => contact.code, {
      onDelete: 'set null',
    }),
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
    /** One contact, one ref code — what makes "pick a contact" idempotent. */
    uniqueIndex('partner_contact_unique')
      .on(t.contactCode)
      .where(sql`"contact_code" IS NOT NULL`),
    /** `{4,}` not `{4}`: `%04d` pads, it does not truncate, so REF-10000 is legal. */
    uniqueIndex('partner_ref_unique').on(t.ref),
    check('partner_ref_shape', sql`"ref" ~ '^[A-HJ-NP-Z2-9]{3}-[A-HJ-NP-Z2-9]{3}$'`),
    check('partner_code_shape', sql`"code" ~ '^REF-[0-9]{4,}$'`),
    check('partner_no_blank', sql`"name" <> ''`),
  ],
)

export type PartnerRowDb = typeof partner.$inferSelect
