import { bigint, check, date, index, text, timestamp } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { ContractPenaltyDirection } from '@pv/contracts'
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
 *  lead: all four now read it, and a termination writes no other row.
 *
 *  The penalty (ADR 0124, 0146) lives on this row, not in a child table: a
 *  termination is final and unique, so it carries at most one penalty. */
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

    /** Who pays whom: `'customer-pays' | 'company-pays'`. NULL = no penalty.
     *  Text + CHECK, not an enum type, so a third direction is a readable migration. */
    penaltyDirection: text('penalty_direction').$type<ContractPenaltyDirection>(),
    /** In the contract's currency, like `refunded_amount`. No ceiling against
     *  `collected_amount`: a penalty is a separate debt, not a slice of what came in. */
    penaltyAmount: bigint('penalty_amount', { mode: 'number' }),
    /** The calendar day the user says the money moved, possibly back-dated,
     *  never now(); a `Day` on the wire, so no timezone to drift. NULL = pending. */
    penaltySettledOn: date('penalty_settled_on'),
    /** Who recorded the settlement. Real fence: every signed-in person has an `actor` row. */
    penaltySettledById: text('penalty_settled_by_id').references(() => actor.id),

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
    check(
      'contract_termination_penalty_direction_known',
      sql`"penalty_direction" IN ('customer-pays', 'company-pays')`,
    ),
    check('contract_termination_penalty_amount_positive', sql`"penalty_amount" > 0`),
    /** A penalty is a direction AND an amount, or neither. */
    check(
      'contract_termination_penalty_direction_amount',
      sql`("penalty_direction" IS NULL) = ("penalty_amount" IS NULL)`,
    ),
    /** A settlement is a day AND a recorder, or neither. */
    check(
      'contract_termination_penalty_settled_pair',
      sql`("penalty_settled_on" IS NULL) = ("penalty_settled_by_id" IS NULL)`,
    ),
    /** Nothing to settle without a penalty. */
    check(
      'contract_termination_penalty_settled_needs_penalty',
      sql`"penalty_settled_on" IS NULL OR "penalty_direction" IS NOT NULL`,
    ),
  ],
)

export type ContractTerminationRowDb = typeof contractTermination.$inferSelect
export type ContractTerminationValues = typeof contractTermination.$inferInsert
