import {
  boolean,
  check,
  index,
  jsonb,
  numeric,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { sql, type SQL } from 'drizzle-orm'
import type { KpiCloseGateSnapshot, KpiMetricKey, RoleId } from '@pv/contracts'
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
    /** The close copied its basis (ADR 0115 §1). A marker, not a row count: a
     *  quiet month has no basis rows yet must not pass for a close made before
     *  0136, which is never reconciled (ADR 0115 default 1). */
    basisFrozen: boolean('basis_frozen').notNull().default(false),
    /** What the close gate showed when the month was closed (ADR 0116 §3):
     *  counts and flagged codes, frozen with the close and never rewritten.
     *  NULL = closed before 0137. */
    gate: jsonb('gate').$type<KpiCloseGateSnapshot>(),
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

/** A seat's series as `seriesKey` names it (`key[@role]|scope`). A length
 *  fence, not a list: the catalog grows in code, and a copy of it here would
 *  refuse a close the day a metric is added. */
const seriesSane = (): SQL => sql`char_length("series") BETWEEN 3 AND 120`

/** Every basis row behind a closed month's seats, frozen in the close's
 *  transaction (ADR 0115 §1): the lists and the reconcile pass read it once
 *  the books have drifted. Append-only like `kpi_month_value` — a frozen copy
 *  that moves is no copy. No UNIQUE: two debriefs on one lead share its code,
 *  so a basis repeats keys, and the reconcile sums by key anyway. */
export const kpiMonthBasis = sales.table(
  'kpi_month_basis',
  {
    period: text('period')
      .notNull()
      .references(() => kpiMonthClose.period),
    series: text('series').notNull(),
    /** NULL on a room series: a room basis credits no one. Every basis source
     *  column is itself an actor FK, so this one cannot refuse a close. */
    actorId: text('actor_id').references(() => actor.id),
    /** Nullable: a debrief's kind is looked up from `platform.object` and can
     *  miss; a NOT NULL here would fail the whole close over one label. */
    kind: text('kind'),
    code: text('code').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull(),
    value: numeric('value'),
    tag: text('tag'),
  },
  (t) => [
    /** "A closed month's frozen basis for one series" — the list and the
     *  reconcile both read a whole series of one month. */
    index('kpi_month_basis_series_idx').on(t.period, t.series),
    check('kpi_month_basis_series_sane', seriesSane()),
  ],
)

/** A change found after the close, written into the running month (ADR 0115
 *  §2). Append-only: a closed month never moves, so a correction of an
 *  adjustment is a further adjustment, never an edit. */
export const kpiAdjustment = sales.table(
  'kpi_adjustment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourcePeriod: text('source_period')
      .notNull()
      .references(() => kpiMonthClose.period),
    /** Shape-checked, not an FK: the running month has no close row yet. */
    appliedPeriod: text('applied_period').notNull(),
    series: text('series').notNull(),
    /** NULL on a room series, `kpi_month_basis.actor_id`'s reason. */
    actorId: text('actor_id').references(() => actor.id),
    /** The kind on the basis row the reconcile saw, live or frozen, so readers
     *  need not derive it again; nullable, `kpi_month_basis.kind`'s reason. */
    kind: text('kind'),
    /** The compared basis row's tag, as with `kind`, so readers need not look it up. */
    tag: text('tag'),
    code: text('code').notNull(),
    /** Signed; no scale, for `kpi_target.value`'s reason. */
    delta: numeric('delta').notNull(),
    cause: text('cause').$type<'appeared' | 'vanished' | 'changed'>().notNull(),
    detectedAt: timestamp('detected_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /** "What lands in the running month for this series" — its figure and list. */
    index('kpi_adjustment_applied_idx').on(t.appliedPeriod, t.series),
    /** "What has already been written for this record of that month" — the
     *  reconcile's sum; '' stands for the room, `kpi_month_value_seat_uq`'s way. */
    index('kpi_adjustment_source_idx').on(
      t.sourcePeriod,
      t.series,
      sql`coalesce("actor_id", '')`,
      t.code,
    ),
    check(
      'kpi_adjustment_applied_period_shape',
      sql`"applied_period" ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'`,
    ),
    /** Zero-padded YYYY-MM sorts as text, so a string compare orders months. */
    check('kpi_adjustment_applies_later', sql`"applied_period" > "source_period"`),
    check('kpi_adjustment_series_sane', seriesSane()),
    check('kpi_adjustment_cause_known', sql`"cause" IN ('appeared', 'vanished', 'changed')`),
  ],
)

export type KpiMonthCloseRowDb = typeof kpiMonthClose.$inferSelect
export type KpiMonthCloseValues = typeof kpiMonthClose.$inferInsert
export type KpiMonthValueRowDb = typeof kpiMonthValue.$inferSelect
export type KpiMonthValueValues = typeof kpiMonthValue.$inferInsert
export type KpiMonthBasisRowDb = typeof kpiMonthBasis.$inferSelect
export type KpiMonthBasisValues = typeof kpiMonthBasis.$inferInsert
export type KpiAdjustmentRowDb = typeof kpiAdjustment.$inferSelect
export type KpiAdjustmentValues = typeof kpiAdjustment.$inferInsert
