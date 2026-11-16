import { bigint, check, date, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { sql, type SQL } from 'drizzle-orm'
import { actor } from '@api/platform/db/platform.schema'
import { sales } from '../sales.schema'
import { opportunity } from '../opportunity/opportunity.schema'
import { periodShape } from './kpi-allocation.schema'

/** Weekly forecast commits (ADR 0158): a person's pick per week and a unit's number per week.
 *
 *  Money is whole dong in `bigint`. `period` is the month the week belongs to and must equal
 *  its Monday's month, so a week never straddles two months. A later save replaces the row
 *  (UNIQUE key) until the week ends; nothing here is ever scored from a live value. */

/** The week's Monday and the month it belongs to, kept in step by the database. */
const weekShape = (): SQL => sql`extract(isodow from "week_start") = 1`
const periodMatchesWeek = (): SQL => sql`"period" = to_char("week_start", 'YYYY-MM')`
/** Wave 4 starts with the December 2026 cycle; older months have no commits. */
const periodFrom = (): SQL => sql`"period" >= '2026-12'`

export const kpiForecastCommit = sales.table(
  'kpi_forecast_commit',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    period: text('period').notNull(),
    weekStart: date('week_start').notNull(),
    actorId: text('actor_id')
      .notNull()
      .references(() => actor.id),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    savedAt: timestamp('saved_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /** "This person's commit for this week" and "their weeks, newest first": one commit per
     *  person per week; the key's prefix serves the per-person read. */
    unique('kpi_forecast_commit_actor_week_uq').on(t.actorId, t.weekStart),
    check('kpi_forecast_commit_period_shape', periodShape()),
    check('kpi_forecast_commit_week_monday', weekShape()),
    check('kpi_forecast_commit_period_matches_week', periodMatchesWeek()),
    check('kpi_forecast_commit_period_from', periodFrom()),
    check('kpi_forecast_commit_amount_nonneg', sql`"amount" >= 0`),
  ],
)

/** The opportunities behind a commit. `value` is frozen at pick time so the score never
 *  moves when the deal's amount is edited later. Deleting the commit deletes its lines. */
export const kpiForecastCommitLine = sales.table(
  'kpi_forecast_commit_line',
  {
    commitId: uuid('commit_id')
      .notNull()
      .references(() => kpiForecastCommit.id, { onDelete: 'cascade' }),
    opportunityCode: text('opportunity_code')
      .notNull()
      .references(() => opportunity.code),
    value: bigint('value', { mode: 'number' }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.commitId, t.opportunityCode] }),
    check('kpi_forecast_commit_line_value_nonneg', sql`"value" >= 0`),
  ],
)

/** A unit's committed number for one week, set by the acting seat. `unit_id` has no FK, like
 *  `kpi_assignment.unit_id`: units are a tree the door edits and deletes. */
export const kpiUnitCommit = sales.table(
  'kpi_unit_commit',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    period: text('period').notNull(),
    weekStart: date('week_start').notNull(),
    unitId: uuid('unit_id').notNull(),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    committedBy: text('committed_by')
      .notNull()
      .references(() => actor.id),
    committedAt: timestamp('committed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /** "This unit's commit for this week": one per unit per week. */
    unique('kpi_unit_commit_unit_week_uq').on(t.unitId, t.weekStart),
    check('kpi_unit_commit_period_shape', periodShape()),
    check('kpi_unit_commit_week_monday', weekShape()),
    check('kpi_unit_commit_period_matches_week', periodMatchesWeek()),
    check('kpi_unit_commit_period_from', periodFrom()),
    check('kpi_unit_commit_amount_nonneg', sql`"amount" >= 0`),
  ],
)

export type KpiForecastCommitRowDb = typeof kpiForecastCommit.$inferSelect
export type KpiForecastCommitLineRowDb = typeof kpiForecastCommitLine.$inferSelect
export type KpiUnitCommitRowDb = typeof kpiUnitCommit.$inferSelect
