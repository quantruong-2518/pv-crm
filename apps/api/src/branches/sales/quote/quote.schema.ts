import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { CurrencyCode, QuoteStatus } from '@pv/contracts'
import { actor } from '@api/platform/db/platform.schema'
import { opportunity } from '../opportunity/opportunity.schema'
import { sales } from '../sales.schema'

/** Quotations — module 4 of the Sales branch.
 *
 *  ------------------------------------------------------------------
 *  ONE ROW, ONE CODE, PER VERSION
 *  ------------------------------------------------------------------
 *  `BG-5001` is the first draft; the round after it is `BG-5002`, a wholly new
 *  primary key. `version` is a reading aid, never a key. A superseded row is
 *  never UPDATEd back into shape — it stays exactly as it was, with a status
 *  saying it has been replaced, because that row is the paper the customer is
 *  holding. The full argument, and the two things this shape hands back (a
 *  two-column foreign key for the contract, and mail keys that differ per
 *  version for free), is in `packages/contracts/src/sales/quote.ts`.
 *
 *  ------------------------------------------------------------------
 *  THREE MONEY INVARIANTS ARE FENCED HERE, NOT REMEMBERED IN A SERVICE
 *  ------------------------------------------------------------------
 *   · one deal, at most ONE accepted version — a partial unique index;
 *   · a contract may only point at an accepted version, and that version cannot
 *     then be walked back — the `(code, status)` unique below is the anchor the
 *     contract's composite foreign key lands on, so leaving `khach-chot` while
 *     a contract references the row is a `23503` rather than a bug waiting to
 *     be found;
 *   · a version that has left the building has a send timestamp, and one that
 *     has not, has not.
 *
 *  The last one is a CHECK rather than a convention because both halves of the
 *  pair get written from different doors, and the pair is what the read path
 *  trusts: a screen may test either `status = 'nhap'` or `sent_at IS NULL` and
 *  cannot get two different answers.
 *
 *  There is NO `het-han` status. Expiry is `valid_until < today`, decided when
 *  read. Freezing it into a column rebuilds the `days_here` mistake the lead
 *  schema notes already record once — a number that moves with the clock,
 *  stored where only a nightly job could keep it honest. */
export const quote = sales.table(
  'quote',
  {
    code: text('code').primaryKey(),

    /** Which round of negotiation this is, within its deal.
     *
     *  NOT derivable from the code: `BG-5002` may be round 2 of this deal or
     *  round 1 of another, because the sequence belongs to the whole system
     *  rather than to one deal. It is `max(version)+1` among the versions of the
     *  same `opportunity_code`, assigned at insert time inside the transaction —
     *  outside one, two people drafting at once both read the same maximum and
     *  the second loses the unique below. */
    version: integer('version').notNull(),

    opportunityCode: text('opportunity_code').notNull(),
    /** Carried beside the deal code and anchored with it by the composite
     *  foreign key below — the same denormalise-the-KEY move `contract` makes,
     *  and safe for the same reason: the pair cannot drift, because Postgres
     *  refuses an INSERT whose two columns do not name one real deal. */
    leadCode: text('lead_code').notNull(),

    status: text('status').$type<QuoteStatus>().notNull(),

    /** When it left the building. Paired with `status = 'nhap'` by a CHECK. */
    sentAt: timestamp('sent_at', { withTimezone: true }),
    /** When the customer answered. NULL until they do. */
    decidedAt: timestamp('decided_at', { withTimezone: true }),

    /** How long the numbers hold. A `date`, not a moment: "valid until the 15th"
     *  is what is printed on the paper, and expiry is a comparison against
     *  today rather than a stored status. */
    validUntil: date('valid_until').notNull(),

    currency: text('currency').$type<CurrencyCode>().notNull(),

    /* The four totals are SUMS ACROSS LINES, which is the one thing a GENERATED
       column cannot express — a generated expression may only read its own row.
       So the service writes them, in the same transaction that changed a line,
       and the formulas live once in `@pv/contracts` where the compose modal
       reads them too.

       Written rather than computed on read, and that is the load-bearing half:
       the number a contract is signed for has to be the number frozen when the
       customer accepted it, not one recomputed every time somebody opens a
       screen and possibly with a rate table that has moved since. */
    subtotal: bigint('subtotal', { mode: 'number' }).notNull(),
    discountTotal: bigint('discount_total', { mode: 'number' }).notNull(),
    vatTotal: bigint('vat_total', { mode: 'number' }).notNull(),
    total: bigint('total', { mode: 'number' }).notNull(),

    /** What the customer reads at the top of the page. */
    title: text('title').notNull(),
    note: text('note'),

    createdBy: text('created_by')
      .notNull()
      .references(() => actor.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'quote_opportunity_fk',
      columns: [t.opportunityCode, t.leadCode],
      foreignColumns: [opportunity.code, opportunity.leadCode],
    }),

    /** Which round of which deal — one row per pair, always. */
    unique('quote_opportunity_version_key').on(t.opportunityCode, t.version),

    /** AT MOST ONE ACCEPTED VERSION PER DEAL.
     *
     *  A partial unique index rather than a rule the decide door remembers.
     *  Two accepted versions is two answers to "what is this deal worth", and
     *  the contract door would pick one of them without anybody choosing. */
    uniqueIndex('quote_one_accepted_idx')
      .on(t.opportunityCode)
      .where(sql`"status" = 'khach-chot'`),

    /** The landing pad for the contract's composite foreign key.
     *
     *  `code` is already the primary key, so this pair is redundant as a
     *  uniqueness claim — it exists purely to give Postgres somewhere to anchor
     *  a two-column reference, exactly the trick `opportunity_code_lead_key`
     *  plays one table over. That reference plus a CHECK on the referring side
     *  is what makes "a contract points only at an accepted version, and that
     *  version cannot be walked back" a matter for the database. */
    unique('quote_code_status_key').on(t.code, t.status),

    check(
      'quote_status_known',
      sql`"status" IN ('nhap', 'da-gui', 'khach-chot', 'khach-tu-choi', 'thay-the')`,
    ),

    /** Draft and un-sent are ONE fact, spelled in two columns.
     *
     *  Without this, a row can say `da-gui` with no send timestamp — and every
     *  read path that filters on one column disagrees with every read path that
     *  filters on the other. */
    check('quote_sent_pair', sql`("sent_at" IS NULL) = ("status" = 'nhap')`),

    /** Postgres does not index a foreign key on its own, and "every version of
     *  this deal" is the question the deal profile asks on every open. */
    index('quote_opportunity_idx').on(t.opportunityCode),
  ],
)

/** The quote number sequence.
 *
 *  ------------------------------------------------------------------
 *  STARTS AT 5001, AND IT IS THE SEQUENCE THAT BURNS NUMBERS FASTEST
 *  ------------------------------------------------------------------
 *  Not 1, for a reason that is already on disk: `seed.ts` loads
 *  `dasVina.objects` into `platform.object`, and that list contains `BG-1077`.
 *  A sequence starting at 1 collides with that mirror row at quote number 1077
 *  — the same sleeping failure the deal and contract sequences each dodged with
 *  the same number.
 *
 *  And one code per version means this sequence is consumed faster than any
 *  other in the system: a deal that goes three rounds eats three numbers. Gaps
 *  are free — a code is not a counter — but the starting point has to clear
 *  everything the frozen book already occupies. */
export const quoteCodeSeq = sales.sequence('quote_code_seq', {
  startWith: 5001,
  increment: 1,
  minValue: 1,
  cache: 1,
})

/** One line of a quotation — what is being sold, and for how much.
 *
 *  ------------------------------------------------------------------
 *  `line_total` IS A GENERATED COLUMN, AND IT ROUNDS TWICE
 *  ------------------------------------------------------------------
 *  The expression reads only columns of its own row, which is exactly what
 *  Postgres allows a stored generated column to do — so the printed cell cannot
 *  drift from the numbers it is printed beside, ever, by any write path.
 *
 *  Two roundings, each landing on a whole dong: once after the discount, once
 *  after VAT. The customer adds up the printed column by hand, and the grand
 *  total the machine prints has to match that addition. Summing first and
 *  rounding once at the end differs by a few dong, and a few dong on a
 *  billion-dong document is a phone call.
 *
 *  `lineTotalOf` in `@pv/contracts` MUST stay identical to this expression. It
 *  is not a duplicate that drifted: the compose modal has to show a total before
 *  anything is written, and there is no row to read it off yet.
 *
 *  ------------------------------------------------------------------
 *  VAT IS PER LINE
 *  ------------------------------------------------------------------
 *  A software licence is taxed at 10% while training may not be. Per-line covers
 *  per-document — set the same percentage on every row — and the reverse does
 *  not open back up without a migration. */
export const quoteLine = sales.table(
  'quote_line',
  {
    quoteCode: text('quote_code')
      .notNull()
      .references(() => quote.code, { onDelete: 'cascade' }),
    lineNo: integer('line_no').notNull(),

    description: text('description').notNull(),
    unit: text('unit'),

    /** `numeric(12,2)` because half a man-month is a real quantity. Arrives back
     *  in Node as a STRING — numeric has more precision than a JS number, so the
     *  driver refuses to lose any of it — and the mapper is the one place that
     *  converts. */
    qty: numeric('qty', { precision: 12, scale: 2 }).notNull(),
    unitPrice: bigint('unit_price', { mode: 'number' }).notNull(),
    discountPct: numeric('discount_pct', { precision: 5, scale: 2 }).notNull(),
    vatPct: numeric('vat_pct', { precision: 5, scale: 2 }).notNull(),

    lineTotal: bigint('line_total', { mode: 'number' })
      .notNull()
      .generatedAlwaysAs(
        sql`round(round("qty" * "unit_price" * (1 - "discount_pct" / 100)) * (1 + "vat_pct" / 100))`,
      ),
  },
  (t) => [
    primaryKey({ name: 'quote_line_pk', columns: [t.quoteCode, t.lineNo] }),
    check('quote_line_qty_positive', sql`"qty" > 0`),
    check('quote_line_price_nonneg', sql`"unit_price" >= 0`),
    /** Both percentages inside 0…100. A discount above 100 turns a line total
     *  negative, and the two-stage rounding above would carry that all the way
     *  into the printed grand total without anything going red. */
    check(
      'quote_line_pct_range',
      sql`"discount_pct" BETWEEN 0 AND 100 AND "vat_pct" BETWEEN 0 AND 100`,
    ),
  ],
)

export type QuoteRowDb = typeof quote.$inferSelect
export type QuoteLineRowDb = typeof quoteLine.$inferSelect
