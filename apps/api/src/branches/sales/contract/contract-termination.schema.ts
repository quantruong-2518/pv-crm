import { bigint, check, index, text, timestamp } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { actor } from '@api/platform/db/platform.schema'
import { sales } from '../sales.schema'
import { contract } from './contract.schema'

/** A signed contract that fell apart afterwards (ADR 0107) — one row, final.
 *
 *  A row here, not a `state` column on `contract`: the contract and its
 *  installments stay exactly as signed, and readers that must count only live
 *  contracts anti-join this table. "Kept" money is `collected - refunded`,
 *  derived on read, so the two stored numbers can never disagree with a third.
 *
 *  Joins the `pv_change` map (0128) as contract, opportunity, workstream and
 *  lead: all four now read it, and a termination writes no other row. */
export const contractTermination = sales.table(
  'contract_termination',
  {
    /** The key is the "at most once" fence: a second termination is 23505.
     *  Cascades for `contract_participant`'s reason — no meaning without it. */
    contractCode: text('contract_code')
      .primaryKey()
      .references(() => contract.code, { onDelete: 'cascade' }),

    /** A `CONTRACT_TERMINATION_REASON` config id, or the virtual `'other'`.
     *  No FK, `opportunity.stop_reason`'s convention: `'other'` has no
     *  catalogue row, so a key would refuse the one answer every list allows. */
    reasonKey: text('reason_key').notNull(),
    /** This contract's own sentence; required only under `'other'`. */
    note: text('note'),

    /** Paid installments summed at the moment of termination, in the
     *  contract's currency. A snapshot: an undo later must not rewrite it. */
    collectedAmount: bigint('collected_amount', { mode: 'number' }).notNull(),
    refundedAmount: bigint('refunded_amount', { mode: 'number' }).notNull(),

    terminatedAt: timestamp('terminated_at', { withTimezone: true }).notNull(),
    /** Real fence: only a signed-in head of sales or director reaches the
     *  door, and every signed-in person has an `actor` row. */
    terminatedById: text('terminated_by_id')
      .notNull()
      .references(() => actor.id),
  },
  (t) => [
    /** "How many contracts were terminated in this span" — the dashboard's
     *  reasons panel counts on the event date (ADR 0107 §3). */
    index('contract_termination_at_idx').on(t.terminatedAt),
    /** `'other'` is a catalogue entry with no words of its own; blank is no answer. */
    check(
      'contract_termination_other_has_note',
      sql`"reason_key" <> 'other' OR btrim(coalesce("note", '')) <> ''`,
    ),
    check('contract_termination_collected_nonneg', sql`"collected_amount" >= 0`),
    check('contract_termination_refunded_nonneg', sql`"refunded_amount" >= 0`),
    /** A refund cannot exceed what came in; otherwise "kept" goes negative. */
    check(
      'contract_termination_refund_within_collected',
      sql`"refunded_amount" <= "collected_amount"`,
    ),
  ],
)

export type ContractTerminationRowDb = typeof contractTermination.$inferSelect
export type ContractTerminationValues = typeof contractTermination.$inferInsert
