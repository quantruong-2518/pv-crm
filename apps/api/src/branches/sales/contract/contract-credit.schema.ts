import { check, index, integer, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { actor } from '@api/platform/db/platform.schema'
import { sales } from '../sales.schema'
import { contract } from './contract.schema'

/** Who shares the KPI credit of one contract, in basis points (ADR 0155).
 *
 *  "Sum of a contract's rows = 10000" and "at most 3 rows" are the service's
 *  checks: a CHECK sees one row and cannot see its siblings. Both keys are real
 *  FKs: a contract always has its `sales.contract` row, and credit goes only to
 *  a signed-in person, never to free text. */
export const contractCredit = sales.table(
  'contract_credit',
  {
    contractCode: text('contract_code')
      .notNull()
      .references(() => contract.code),
    actorId: text('actor_id')
      .notNull()
      .references(() => actor.id),
    /** 1..10000 = 0.01%..100%. Integer so a split never drifts by rounding. */
    shareBp: integer('share_bp').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'contract_credit_pk', columns: [t.contractCode, t.actorId] }),
    /** "Which contracts does this person hold credit on": the KPI sums per actor. */
    index('contract_credit_actor_idx').on(t.actorId),
    check('contract_credit_share_range', sql`"share_bp" BETWEEN 1 AND 10000`),
  ],
)

export type ContractCreditRowDb = typeof contractCredit.$inferSelect
export type ContractCreditValues = typeof contractCredit.$inferInsert
