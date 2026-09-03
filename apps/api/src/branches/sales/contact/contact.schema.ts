import { boolean, check, index, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { ContactChannel } from '@pv/contracts'
import { actor, objectRef } from '@api/platform/db/platform.schema'
import { lead } from '../lead/lead.schema'
import { sales } from '../sales.schema'

/** People on the CUSTOMER's side.
 *
 *  The reasoning for this table — why it exists at all, why `email` is optional
 *  here while `lead.email` stays `NOT NULL`, and why the primary contact is a
 *  property of the SET rather than of a row — is written once, in the contract
 *  at `packages/contracts/src/sales/contact.ts`. This file states only what the
 *  columns and constraints are, plus the two things a reader of the SQL cannot
 *  find over there.
 *
 *  ------------------------------------------------------------------
 *  THIS DECLARATION WAS WRITTEN TO MATCH A TABLE THAT ALREADY EXISTED
 *  ------------------------------------------------------------------
 *  The table was created and backfilled by migration 0018 on 28/08 — every
 *  seeded row still carries `by = 'backfill 0018'`. That migration's `.sql` file
 *  is NO LONGER IN THIS TREE; it went missing when two migrations numbered 0024
 *  were untangled during a master merge, which is why the drizzle snapshot had
 *  no record of the table and the next generated migration tried to create it a
 *  second time.
 *
 *  So every name below — `contact_no_blank`, `contact_channel_known`,
 *  `contact_primary_idx`, `contact_email_idx` on `lower(email)` — is copied
 *  from what production actually has, not chosen. Renaming any of them makes
 *  the next `db:generate` emit an ALTER against a live table for no reason.
 *
 *  ------------------------------------------------------------------
 *  THE ROW HANGS OFF THE LEAD, NOT OFF THE ACCOUNT
 *  ------------------------------------------------------------------
 *  `sales.account` landed later, so "why not `account_code`" is the first
 *  question anyone will ask. Two reasons, both of which bite in SQL rather than
 *  in TypeScript:
 *
 *   · THE MIRROR RULE NEEDS A LEAD. Writing a primary contact also writes the
 *     five contact columns of `sales.lead`, because `lead.required_filled` and
 *     `lead.optional_filled` are `GENERATED ALWAYS AS … STORED` over three of
 *     them. "Primary contact of an ACCOUNT" cannot drive that write — an
 *     account has many leads and the gate is measured per lead.
 *   · A DERIVED COLUMN IS A COLUMN THAT DRIFTS. The account of a contact is
 *     `lead.account_code` of its lead, one join away and indexed. Copying it
 *     here would create a second answer to a question that already has one, and
 *     re-pointing a lead at a merged account would silently leave the copies
 *     behind.
 *
 *  So the account screen asks "who do we know at this company" as
 *  `contact JOIN lead USING (lead_code) WHERE lead.account_code = $1`, and
 *  there is exactly one place the answer comes from. */
export const contact = sales.table(
  'contact',
  {
    /** `CT-1001`. Mirrored into `platform.object` like `lead.code`, because a
     *  contact is a first-class object a person reads out loud — that is the
     *  whole reason the single-row endpoints address a `CT-…` code instead of
     *  hanging off the lead's. */
    code: text('code')
      .primaryKey()
      .references(() => objectRef.code),

    leadCode: text('lead_code')
      .notNull()
      .references(() => lead.code),

    name: text('name').notNull(),
    title: text('title'),

    /** Optional here, `NOT NULL` on the lead — see the contract's docblock. */
    email: text('email'),
    phone: text('phone'),
    /** Which channel this person actually answers on. Same vocabulary a
     *  campaign fires through, so "reached them on X" and "sent through X" are
     *  one enum rather than two lists that drift. */
    channel: text('channel').$type<ContactChannel>(),

    isPrimary: boolean('is_primary').notNull().default(false),

    note: text('note'),

    /** Who wrote the row down, as a NAME, snapshotted at write time — the same
     *  rule `touch.by` and `meeting_attendee` hold. Joining `platform.actor` on
     *  read would make an old row adopt somebody's new name, and render nothing
     *  at all for a person who has since left the book.
     *
     *  Every row seeded by migration 0018 carries the literal `'backfill 0018'`
     *  here, which is the honest answer: no person wrote those down. */
    by: text('by').notNull(),

    /** Who wrote it, as an ACTOR ID — the fenced half of the pair above.
     *
     *  NULLABLE, and it has to be: the 123 rows the backfill wrote have nobody
     *  to credit, and the public intake door is anonymous by design. A name
     *  without an id is still a usable record; an invented id is a foreign key
     *  pointing at the wrong person. */
    createdBy: text('created_by').references(() => actor.id),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('contact_lead_idx').on(t.leadCode),
    /** On `lower(email)`, not on the raw column: the question this index serves
     *  is "have we met this person before", and mailboxes are compared without
     *  case. A raw index would sit unused by the only query that wants it. */
    index('contact_email_idx').on(sql`lower("email")`),

    /** ONE check across eight columns rather than eight checks.
     *
     *  Empty is `NULL`, never `''` — the same convention `lead` and
     *  `config_entry` hold. Written as a single constraint because that is what
     *  production has; splitting it would be an ALTER on a live table to buy
     *  nothing. */
    check(
      'contact_no_blank',
      sql`"lead_code" <> '' AND "name" <> '' AND "by" <> '' AND "title" <> '' AND "email" <> '' AND "phone" <> '' AND "channel" <> '' AND "note" <> ''`,
    ),

    /** The channel vocabulary, pinned at the table.
     *
     *  `$type<ContactChannel>` above is a TypeScript claim and stops nothing at
     *  runtime; this is the fence. Seven values, the same seven a campaign can
     *  fire through. */
    check(
      'contact_channel_known',
      sql`"channel" IS NULL OR "channel" IN ('email', 'zalo-oa', 'telegram', 'in-app', 'linkedin', 'facebook', 'website')`,
    ),

    /** AT MOST ONE primary per lead, held by the index rather than by the
     *  service remembering to demote the incumbent first. A rule in service
     *  code holds until the second writer appears; this one holds against a
     *  psql session at midnight too.
     *
     *  "At least one" is the half an index cannot state — a lead with zero
     *  contacts is legitimate — so "the first contact written becomes primary"
     *  stays a service rule by necessity. */
    uniqueIndex('contact_primary_idx')
      .on(t.leadCode)
      .where(sql`"is_primary"`),
  ],
)

/** Code sequence for `CT-nnnn`, created by migration 0018 alongside the table.
 *
 *  `startWith` is 1001 because that is where the 0018 backfill began — the live
 *  rows run `CT-1001` … `CT-1123`. The declaration exists so drizzle knows the
 *  sequence is there; on the live database it is already well past this number,
 *  and the value only matters when a fresh database is built from migrations. */
export const contactCodeSeq = sales.sequence('contact_code_seq', {
  startWith: 1001,
  increment: 1,
  minValue: 1,
  cache: 1,
})

export type ContactRowDb = typeof contact.$inferSelect
