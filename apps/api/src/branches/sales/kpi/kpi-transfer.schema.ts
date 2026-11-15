import { check, date, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { actor } from '@api/platform/db/platform.schema'
import { sales } from '../sales.schema'
import { periodShape } from './kpi-allocation.schema'

/** A leaver's open KPI handed to a receiver from one day on (ADR 0156).
 *
 *  `to_actor_id` NULL = nobody receives it. Days are Vietnam calendar days, so
 *  `date`. Both actor columns are real FKs: only live actors leave or receive. */
export const kpiTransfer = sales.table(
  'kpi_transfer',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    period: text('period').notNull(),
    fromActorId: text('from_actor_id')
      .notNull()
      .references(() => actor.id),
    toActorId: text('to_actor_id').references(() => actor.id),
    fromDay: date('from_day').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /** "Was this leaver's month already handed over": one transfer per leaver per month.
     *  Its prefix (period, from) also serves the per-month read. */
    unique('kpi_transfer_period_from_uq').on(t.period, t.fromActorId),
    check('kpi_transfer_period_shape', periodShape()),
    /** Handing a month to yourself would leave it with nobody. */
    check('kpi_transfer_not_self', sql`"from_actor_id" <> "to_actor_id"`),
  ],
)

export type KpiTransferRowDb = typeof kpiTransfer.$inferSelect
export type KpiTransferValues = typeof kpiTransfer.$inferInsert
