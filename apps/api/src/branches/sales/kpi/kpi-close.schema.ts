import { check, numeric, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql, type SQL } from 'drizzle-orm'
import type { KpiMetricKey, RoleId } from '@pv/contracts'
import { actor } from '@api/platform/db/platform.schema'
import { sales } from '../sales.schema'

/** Month close: a frozen copy of every reading a month's cards showed.
 *
 *  A month with no `kpi_month_close` row is live. Closing inserts the close
 *  row and every value in one transaction; there is no unlock, so nothing
 *  here is updated or deleted by the api (ADR 0100). The period, role and
 *  metric lists are hand copies of `kpi-allocation.schema.ts`'s, for the same
 *  reason those are hand copies. `closed_by_id` is a real FK, for
 *  `kpi_target`'s reason. */

const roleKnown = (): SQL =>
  sql`"role" IN ('director', 'head-of-sales', 'marketing', 'bd', 'presales', 'sale', 'account-executive')`

const periodShape = (): SQL => sql`"period" ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'`

const metricKnown = (): SQL =>
  sql`"metric_key" IN ('leads-sourced', 'lead-to-opportunity-rate', 'sourced-signed-value',
                       'opportunities-opened', 'first-response-hours',
                       'opportunity-accept-rate', 'demos-joined', 'signed-value', 'win-rate',
                       'debriefs-closed', 'overdue-receivables', 'accept-lag-days',
                       'collected-value', 'approval-turnaround-hours')`

export const kpiMonthClose = sales.table(
  'kpi_month_close',
  {
    /** The key IS the identity: a month closes once. */
    period: text('period').primaryKey(),
    closedById: text('closed_by_id')
      .notNull()
      .references(() => actor.id),
    closedAt: timestamp('closed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  () => [check('kpi_month_close_period_shape', periodShape())],
)

export const kpiMonthValue = sales.table(
  'kpi_month_value',
  {
    period: text('period')
      .notNull()
      .references(() => kpiMonthClose.period),
    role: text('role').$type<RoleId>().notNull(),
    /** NULL = a room seat (the role's company-wide reading). */
    actorId: text('actor_id').references(() => actor.id),
    metricKey: text('metric_key').$type<KpiMetricKey>().notNull(),
    /** No scale, for `kpi_target.value`'s reason. NULL = no data that month. */
    value: numeric('value'),
  },
  (t) => [
    /** "A month's frozen values" (leads with period) and one reading per seat.
     *  The expression makes two room seats collide, which a plain UNIQUE would
     *  not (NULLs differ); actor ids are text, so '' stands for the room. */
    uniqueIndex('kpi_month_value_seat_uq').on(
      t.period,
      t.role,
      sql`coalesce("actor_id", '')`,
      t.metricKey,
    ),

    check('kpi_month_value_period_shape', periodShape()),
    check('kpi_month_value_role_known', roleKnown()),
    check('kpi_month_value_metric_known', metricKnown()),
  ],
)

export type KpiMonthCloseRowDb = typeof kpiMonthClose.$inferSelect
export type KpiMonthCloseValues = typeof kpiMonthClose.$inferInsert
export type KpiMonthValueRowDb = typeof kpiMonthValue.$inferSelect
export type KpiMonthValueValues = typeof kpiMonthValue.$inferInsert
