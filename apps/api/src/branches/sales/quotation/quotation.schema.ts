import {
  bigint,
  check,
  date,
  foreignKey,
  integer,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { sql, type SQL } from 'drizzle-orm'
import type { ContractKind, CurrencyCode, QuotationOutcome, QuotationSource } from '@pv/contracts'
import { actor } from '@api/platform/db/platform.schema'
import { configEntry } from '../config/config.schema'
import { contract } from '../contract/contract.schema'
import { opportunity } from '../opportunity/opportunity.schema'
import { sales } from '../sales.schema'
import { touch } from '../touch/touch.schema'

/** One quotation sent to a customer — the ledger every COUNT and GATE reads.
 *
 *  The `quotation-sent` row in `sales.touch` stays as the sentence on the
 *  timeline, exactly as `opportunity_stage_event` sits beside `stage-changed`:
 *  one row for the reader, one for the query, neither parsed into the other.
 *
 *  A NEGOTIATION is the rows sharing `(opportunity_code, kind, negotiation_no)`
 *  and holds at most one `pending` row. `kind` is NULL on mail-made and
 *  backfilled rows, and Postgres treats NULLs as distinct in a unique index, so
 *  both unique indexes below key on `coalesce("kind", '')`: every kind-less row
 *  of a deal falls into ONE group instead of each being its own. A writer's
 *  `ON CONFLICT` has to spell that same expression. */
export const quotation = sales.table(
  'quotation',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** CASCADE like the deal's other child tables: a round has no meaning
     *  once its deal is gone. */
    opportunityCode: text('opportunity_code')
      .notNull()
      .references(() => opportunity.code, { onDelete: 'cascade' }),

    /** What the paper is for: a `CONTRACT_KIND` config id ('CK-01'). NULL only
     *  off the hand door — see `quotation_manual_has_kind`. */
    kind: text('kind').$type<ContractKind>(),
    /** Key half only, same trick and reason as `contract.kind_list`. */
    kindList: text('kind_list').generatedAlwaysAs(
      (): SQL => sql`CASE WHEN "kind" IS NULL THEN NULL ELSE 'CONTRACT_KIND' END`,
    ),

    /** Both minted by the server under the deal lock, never by the browser. */
    negotiationNo: integer('negotiation_no').notNull(),
    roundNo: integer('round_no').notNull(),

    amount: bigint('amount', { mode: 'number' }),
    currency: text('currency').$type<CurrencyCode>(),

    sentAt: timestamp('sent_at', { withTimezone: true }).notNull(),
    /** Display only — passing it closes nothing. */
    validUntil: date('valid_until'),

    source: text('source').$type<QuotationSource>().notNull(),
    outcome: text('outcome').$type<QuotationOutcome>().notNull(),
    closedAt: timestamp('closed_at', { withTimezone: true }),

    /** A `QUOTE_REVISION_REASON` config id, or the virtual key `'other'`. NO
     *  foreign key, for `touch.reason_id`'s reason: `'other'` is never a config
     *  row, so a key into `config_entry` would refuse a legitimate close. */
    reasonId: text('reason_id'),
    /** The deal's own `stop_reason`, copied when the stop closed this row. */
    stopReasonKey: text('stop_reason_key'),
    reasonNote: text('reason_note'),

    /** The contract the negotiation ended in — on the `won` row and on the
     *  rows it superseded. No action on delete: a contract is never deleted. */
    contractCode: text('contract_code').references(() => contract.code),

    /** The timeline row written beside this one. SET NULL so wiping a touch
     *  cannot take a ledger row with it or be refused by one. */
    touchId: uuid('touch_id').references(() => touch.id, { onDelete: 'set null' }),

    /** NULL = the machine wrote it: a backfilled row copies `touch.actor_id`,
     *  which is NULL for a system touch. */
    createdBy: text('created_by').references(() => actor.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /** "Is this round number taken", and "the quotations of this deal" — it
     *  leads with the deal, so a separate index would be a second copy. */
    uniqueIndex('quotation_round_uq').on(
      t.opportunityCode,
      sql`coalesce("kind", '')`,
      t.negotiationNo,
      t.roundNo,
    ),
    /** "Is a quotation of this negotiation still waiting" — and the fence
     *  that makes the answer one row. */
    uniqueIndex('quotation_one_pending_uq')
      .on(t.opportunityCode, sql`coalesce("kind", '')`, t.negotiationNo)
      .where(sql`"outcome" = 'pending'`),
    /** "Has this touch been entered in the ledger" — what the gap backfill
     *  asks, and the fence against one touch counted as two quotations. */
    unique('quotation_touch_uq').on(t.touchId),

    /** Replaces `quotation_kind_known` (dropped in 0108), for the reason
     *  `contract_kind_fk` gives: the kind list is edited, not enumerated. */
    foreignKey({
      name: 'quotation_kind_fk',
      columns: [t.kind, t.kindList],
      foreignColumns: [configEntry.id, configEntry.list],
    }),
    /** `QuotationSource` and `QuotationOutcome`, copied out the same way. */
    check('quotation_source_known', sql`"source" IN ('manual', 'mail', 'backfill')`),
    check('quotation_outcome_known', sql`"outcome" IN ('pending', 'won', 'not-closed')`),
    /** A person typing a quotation knows what it is for; a mail template and
     *  an old touch do not, and the screen offers a door to fill it in. */
    check('quotation_manual_has_kind', sql`"source" <> 'manual' OR "kind" IS NOT NULL`),
    /** Same split for the author: only the machine writes an unsigned row. */
    check('quotation_manual_has_author', sql`"source" <> 'manual' OR "created_by" IS NOT NULL`),
    check('quotation_numbers_positive', sql`"negotiation_no" >= 1 AND "round_no" >= 1`),
    check('quotation_money_pair', sql`("amount" IS NULL) = ("currency" IS NULL)`),
    /** The UTC day, the loosest reading: it is never later than the sender's
     *  own calendar day, so no legitimate row is refused. Zod holds the rest. */
    check(
      'quotation_valid_after_sent',
      sql`"valid_until" IS NULL OR "valid_until" >= ("sent_at" AT TIME ZONE 'UTC')::date`,
    ),
    check('quotation_closed_pair', sql`("closed_at" IS NULL) = ("outcome" = 'pending')`),
    check('quotation_won_has_contract', sql`"outcome" <> 'won' OR "contract_code" IS NOT NULL`),
    /** A close by hand says why. Backfilled rows are exempt: nobody was asked
     *  on the day, and inventing a reason puts words in the seller's mouth. */
    check(
      'quotation_not_closed_has_reason',
      sql`"outcome" <> 'not-closed' OR "source" = 'backfill'
          OR "reason_id" IS NOT NULL OR "stop_reason_key" IS NOT NULL`,
    ),
    /** The other direction: a row still waiting, or won, carries no reason. */
    check(
      'quotation_reason_only_not_closed',
      sql`"outcome" = 'not-closed'
          OR ("reason_id" IS NULL AND "stop_reason_key" IS NULL AND "reason_note" IS NULL)`,
    ),
    /** `'other'` names nothing, so the sentence is the whole reason. */
    check(
      'quotation_other_has_note',
      sql`"reason_id" IS DISTINCT FROM 'other' OR "reason_note" IS NOT NULL`,
    ),
    /** Empty is NULL, never '' — the `lead_no_blank` convention. */
    check(
      'quotation_no_blank',
      sql`btrim("reason_id") <> '' AND btrim("stop_reason_key") <> '' AND btrim("reason_note") <> ''`,
    ),
  ],
)

export type QuotationRowDb = typeof quotation.$inferSelect
export type QuotationValues = typeof quotation.$inferInsert
