import { check, index, integer, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { LeadCategory } from '@pv/contracts'
import { objectRef } from '@api/platform/db/platform.schema'
import { sales } from '../sales.schema'

/** The customer COMPANY — the row every lead, contact and deal hangs off.
 *
 *  ------------------------------------------------------------------
 *  WHY THIS TABLE EXISTS WHEN `sales.lead` ALREADY HOLDS THE COMPANY
 *  ------------------------------------------------------------------
 *  Eight columns of `sales.lead` describe a company rather than an enquiry
 *  (`company` · `legal_name` · `tax_code` · `address` · `province` ·
 *  `category` · `headcount` · `plants`). That was right while one lead meant
 *  one company met once. It stops being right at the second enquiry from the
 *  same factory: the address gets retyped, one of the two spellings of the
 *  legal name is wrong, and "how many times have we sold to them" counts rows
 *  in a book that was never counting companies.
 *
 *  The rule that follows is the whole point of the table: a company is written
 *  down ONCE and pointed at from three places. `lead.account_code`,
 *  `opportunity.account_code` and `contact` (through its lead) all resolve to
 *  the same row, so the company's own facts have exactly one home.
 *
 *  ------------------------------------------------------------------
 *  THE EIGHT COLUMNS ON `sales.lead` STAY — THEY ARE NOT A SECOND SOURCE
 *  ------------------------------------------------------------------
 *  They stay for the reason `contact.ts` gives about the five contact columns:
 *  `lead.required_filled` / `lead.optional_filled` are
 *  `GENERATED ALWAYS AS … STORED` and a generated column cannot read another
 *  table. Dropping them turns the init-data gate dark in SQL. The operating
 *  rule also stands: a migration may not contain `DROP`.
 *
 *  What keeps the duplication honest is the same thing that keeps the contact
 *  duplication honest — ONE writer. The lead service writes the lead's company
 *  columns; the account service writes this row; a lead is attached to an
 *  account by code and never by copying fields back and forth. When the two
 *  disagree, THIS table is the answer, because it is the one a human edits on
 *  the account screen.
 *
 *  ------------------------------------------------------------------
 *  IDENTITY IS TAX CODE FIRST, NAME SECOND — ENFORCED, NOT REMEMBERED
 *  ------------------------------------------------------------------
 *  `account_identity_uniq` below indexes `coalesce(nullif(tax_code,''),
 *  lower(name))`, which states both halves of the merge rule in one line:
 *
 *   · a company WITH a tax code is that tax code, whatever it calls itself
 *     this week — 'DAS Vina' and 'Cty TNHH DAS Vina' collapse to one row;
 *   · a company WITHOUT one is its lower-cased name, so two enquiries typed
 *     the same way cannot become two customers.
 *
 *  Doing this in the index rather than in a find-or-create service function is
 *  what makes it survive a second writer and a psql session at midnight. The
 *  service still runs the same lookup first — the index is the net, not the
 *  plan. */
export const account = sales.table(
  'account',
  {
    /** `AC-0001`. Mirrored into `platform.object` like `lead.code` is, so E1's
     *  graph can walk company -> lead -> deal -> contract without the branch
     *  handing it a second kind of identifier. */
    code: text('code')
      .primaryKey()
      .references(() => objectRef.code),

    /** The name people say out loud. Editable; not a key of anything. */
    name: text('name').notNull(),
    /** The name on the paperwork, when somebody has bothered to write it down.
     *  Separate from `name` because invoices need one and nobody searches by
     *  it. */
    legalName: text('legal_name'),
    taxCode: text('tax_code'),

    address: text('address'),
    province: text('province'),
    category: text('category').$type<LeadCategory>(),

    headcount: integer('headcount'),
    plants: integer('plants'),

    /** What the account team knows that no column asks for. */
    note: text('note'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /** Empty is `NULL`, never `''` — the same convention `lead` and
     *  `config_entry` hold, and the reason the identity index below can use
     *  `nullif` on the tax code and get a truthful answer. */
    check('account_name_not_blank', sql`"name" <> ''`),

    /** The merge rule, stated once — see the file docblock.
     *
     *  `btrim` on both halves, and it is not belt-and-braces: `identityOf` in
     *  the mapper trims before it asks, so an index that did not trim would
     *  answer "no such company" for a row whose name ends in a space — then
     *  refuse the insert that follows on this very index. The two spellings of
     *  one rule have to agree character for character or they disagree exactly
     *  once, at the moment it matters. */
    uniqueIndex('account_identity_uniq').on(
      sql`coalesce(nullif(btrim("tax_code"), ''), lower(btrim("name")))`,
    ),

    index('account_province_idx').on(t.province),
    index('account_category_idx').on(t.category),
  ],
)

/** Code sequence for `AC-nnnn`.
 *
 *  Same shape and same reason as `opportunity_code_seq`: `SELECT max(code) + 1`
 *  hands the same number to two people opening a company at once, and the
 *  second one loses to the primary key.
 *
 *  ------------------------------------------------------------------
 *  STARTS AT 201, AND THE NUMBER IS NOT ARBITRARY
 *  ------------------------------------------------------------------
 *  `platform.object` already holds one `AC-` row — `AC-0142`, the DAS Vina
 *  company seeded with that scenario. A sequence starting at 1 would mint
 *  `AC-0001` upward, quietly work for the first 141 companies, and then hand
 *  out `AC-0142` to the 142nd and lose to the primary key of a seeded object.
 *
 *  That is the exact sleeping bug `opportunity_code_seq` starts at 5001 to
 *  avoid, and the backfill in migration 0026 walks right up to it: 124
 *  companies, which is 18 short. Eighteen rows of headroom is not headroom.
 *  Starting above the seeded block costs nothing — a code is not a counter, and
 *  gaps are normal. */
export const accountCodeSeq = sales.sequence('account_code_seq', {
  startWith: 201,
  increment: 1,
  minValue: 1,
  cache: 1,
})

export type AccountRowDb = typeof account.$inferSelect
