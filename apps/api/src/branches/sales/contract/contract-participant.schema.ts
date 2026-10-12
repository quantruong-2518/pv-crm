import { boolean, check, primaryKey, text, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { OpportunityOwnerRole } from '@pv/contracts'
import { actor } from '@api/platform/db/platform.schema'
import { sales } from '../sales.schema'
import { contract } from './contract.schema'

/** Who stood on the deal the day it was signed (ADR 0086) — a snapshot.
 *
 *  `opportunity_owner` answers "whose deal is this TODAY" and keeps moving:
 *  a hand-over after signing rewrites it. Commission and credit are owed to
 *  the people of the signing day, so the sign door copies the list here and
 *  nothing updates it afterwards. That immutability is the writers'
 *  discipline, not a fence: no trigger refuses an UPDATE.
 *
 *  Same shape and same fences as `opportunity_owner` on purpose, so the copy
 *  is a plain INSERT … SELECT and a reader learns one model. Ids, not names:
 *  the list is joined to `actor` on read, unlike `touch.by`.
 *
 *  Rows of contracts signed before 0100 are the deal's owners on MIGRATION
 *  day, not signing day — the best record that existed. */
export const contractParticipant = sales.table(
  'contract_participant',
  {
    /** Safe to fence, and cascades: a participant has no meaning without its
     *  contract, the same call `contract_installment` made. */
    contractCode: text('contract_code')
      .notNull()
      .references(() => contract.code, { onDelete: 'cascade' }),
    actorId: text('actor_id')
      .notNull()
      .references(() => actor.id),
    /** `'SALE' | 'BD'` — the lane the person stood on at signing. */
    role: text('role').$type<OpportunityOwnerRole>().notNull(),
    /** The accountable seller at signing; at most one per contract. */
    isPrimary: boolean('is_primary').notNull().default(false),
  },
  (t) => [
    /** Three columns for `opportunity_owner_pk`'s reason: one person may have
     *  stood on both lanes. Leads with the contract, so it also answers
     *  "the participants of this contract" without a second index. */
    primaryKey({
      name: 'contract_participant_pk',
      columns: [t.contractCode, t.actorId, t.role],
    }),
    /** "Who was accountable for this contract" — one row, or the fence refuses. */
    uniqueIndex('contract_participant_one_primary_idx')
      .on(t.contractCode)
      .where(sql`"is_primary"`),
    /** `OpportunityOwnerRole.options`, copied out for `touch_kind_known`'s reason. */
    check('contract_participant_role_known', sql`"role" IN ('SALE', 'BD')`),
    check('contract_participant_primary_is_sale', sql`NOT "is_primary" OR "role" = 'SALE'`),
  ],
)

export type ContractParticipantRowDb = typeof contractParticipant.$inferSelect
export type ContractParticipantValues = typeof contractParticipant.$inferInsert
