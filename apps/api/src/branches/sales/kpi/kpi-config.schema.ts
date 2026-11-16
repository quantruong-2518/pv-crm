import {
  bigint,
  boolean,
  check,
  integer,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { sql, type SQL } from 'drizzle-orm'
import type { KpiMetricKey, RoleId } from '@pv/contracts'
import { actor } from '@api/platform/db/platform.schema'
import { sales } from '../sales.schema'

/** KPI configuration a director edits, and the alert sweeper's memory.
 *
 *  `kpi_role_metric` is an overlay on `KPI_CATALOG`, as `platform.setting` is
 *  on `SETTING_REGISTRY`: a missing row means the code default, a row is only
 *  ever an override. So a catalog change needs no data migration, and a role
 *  nobody has touched has no rows at all.
 *
 *  `kpi_alert_sent` is one row per alert rung, so the daily sweep never rings
 *  the same person about the same metric and flag twice in one month.
 *
 *  From 2027-01 (ADR 0160) an overlay is a SET per role, versioned by month:
 *  a month reads the latest `from_period` at or before it.
 *
 *  Every actor column is a real FK, for `kpi_target`'s reason. The role,
 *  period and metric lists are hand copies of `kpi.schema.ts`'s. */

/** `actor_role_ids_known`'s seven values, in its order. */
const roleKnown = (): SQL =>
  sql`"role" IN ('director', 'head-of-sales', 'marketing', 'bd', 'presales', 'sale', 'account-executive')`

/** The twenty-two `KpiMetricKey` values. The role-to-key pairing is
 *  `KPI_CATALOG`'s, enforced at the door, as on `kpi_target`. */
const metricKnown = (): SQL =>
  sql`"metric_key" IN ('leads-sourced', 'lead-to-opportunity-rate', 'sourced-signed-value',
                       'opportunities-opened', 'first-response-hours',
                       'opportunity-accept-rate', 'demos-joined', 'signed-value', 'win-rate',
                       'debriefs-closed', 'overdue-receivables', 'accept-lag-days',
                       'collected-value', 'approval-turnaround-hours', 'quotes-sent',
                       'sales-cycle-days', 'mql-reached', 'lead-to-mql-rate', 'cost-per-mql',
                       'presales-signed-value', 'on-time-collection-rate', 'solution-days')`

export const kpiRoleMetric = sales.table(
  'kpi_role_metric',
  {
    role: text('role').$type<RoleId>().notNull(),
    metricKey: text('metric_key').$type<KpiMetricKey>().notNull(),
    /** First month the set applies. Rows from before 0171 hold '2000-01',
     *  earlier than any real month, so they keep applying to every v1 month;
     *  a v2 month never reads a set older than 2027-01. No DEFAULT: a writer
     *  that forgets the month must fail, not write a v1 set. */
    fromPeriod: text('from_period').notNull(),
    /** Percent of the role's score, whole numbers. NULL = not stated, which
     *  reads as the default split (primary 50 %, the rest equal). "The set
     *  sums to 100" spans rows, so the service keeps it. */
    weight: integer('weight'),
    /** No DEFAULT on either flag: an override states both, so a row never
     *  silently means "the table's default" instead of the code's. */
    enabled: boolean('enabled').notNull(),
    /** The headline metric of the role. The table caps it at one per role
     *  among ROWS; a code default left without a row is the service's to
     *  override explicitly when another metric is promoted. */
    isPrimary: boolean('is_primary').notNull(),
    /** The proposer of the approved change, as on `setting.updated_by`. */
    updatedBy: text('updated_by')
      .notNull()
      .references(() => actor.id),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /* Leads with (role, from_period) so "the latest set of role R at or before
       month P" walks a prefix; as a uniqueness it is (role, metric, from_period). */
    primaryKey({
      name: 'kpi_role_metric_pk',
      columns: [t.role, t.fromPeriod, t.metricKey],
    }),
    /** "Which metric is role R's primary in this set", and the fence that there is one. */
    uniqueIndex('kpi_role_metric_one_primary_uq')
      .on(t.role, t.fromPeriod)
      .where(sql`"is_primary"`),

    check('kpi_role_metric_role_known', roleKnown()),
    check('kpi_role_metric_metric_known', metricKnown()),
    check('kpi_role_metric_from_period_shape', sql`"from_period" ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'`),
    check('kpi_role_metric_weight_percent', sql`"weight" IS NULL OR "weight" BETWEEN 0 AND 100`),
    /** A switched-off metric is not scored, so it cannot be the headline. */
    check('kpi_role_metric_primary_enabled', sql`NOT "is_primary" OR "enabled"`),
  ],
)

/** Funnel step targets of one role's set (ADR 0160 §7): shown beside the real
 *  rate, never scored. A missing row is "not drawn". The step-to-role pairing
 *  is the door's, as the metric-to-role pairing is. */
export const kpiFunnelTarget = sales.table(
  'kpi_funnel_target',
  {
    role: text('role').$type<RoleId>().notNull(),
    /** Same month as the role's `kpi_role_metric` set it was approved with. */
    fromPeriod: text('from_period').notNull(),
    stepKey: text('step_key')
      .$type<
        | 'lead'
        | 'mql'
        | 'sql'
        | 'opportunity'
        | 'lead-received'
        | 'contacted'
        | 'accepted'
        | 'met'
        | 'solution'
        | 'quotation'
        | 'signed'
        | 'new'
        | 'assigned'
        | 'engaged'
      >()
      .notNull(),
    /** Basis points of the step before it: 10000 = every one passes. */
    ratioBp: integer('ratio_bp').notNull(),
    updatedBy: text('updated_by')
      .notNull()
      .references(() => actor.id),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /* "Every step target of role R's set" is the key's own prefix. */
    primaryKey({
      name: 'kpi_funnel_target_pk',
      columns: [t.role, t.fromPeriod, t.stepKey],
    }),
    check('kpi_funnel_target_role_known', roleKnown()),
    check(
      'kpi_funnel_target_from_period_shape',
      sql`"from_period" ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'`,
    ),
    /** Fourteen distinct keys of ADR 0160 §7; `sql`, `opportunity`, `quotation` repeat across roles. */
    check(
      'kpi_funnel_target_step_known',
      sql`"step_key" IN ('lead', 'mql', 'sql', 'opportunity', 'lead-received', 'contacted',
                         'accepted', 'met', 'solution', 'quotation', 'signed', 'new',
                         'assigned', 'engaged')`,
    ),
    check('kpi_funnel_target_ratio_bp_range', sql`"ratio_bp" BETWEEN 0 AND 10000`),
  ],
)

/** One Marketing budget per unit and month (ADR 0160 §8), shown beside the
 *  spend, never scored. `unit_id` has no FK, for `kpi_assignment.unit_id`'s
 *  reason: `org_node` is keyed (from_period, unit_id), so the id alone is not
 *  unique there. Whole dong in `bigint`, like `source_cost.amount` it is read against. */
export const kpiMarketingBudget = sales.table(
  'kpi_marketing_budget',
  {
    unitId: uuid('unit_id').notNull(),
    period: text('period').notNull(),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    setBy: text('set_by')
      .notNull()
      .references(() => actor.id),
    setAt: timestamp('set_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /* "Budget of unit U in month P" is the key; a month's few units need no index. */
    primaryKey({ name: 'kpi_marketing_budget_pk', columns: [t.unitId, t.period] }),
    check('kpi_marketing_budget_period_shape', sql`"period" ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'`),
    check('kpi_marketing_budget_amount_nonneg', sql`"amount" >= 0`),
  ],
)

export const kpiAlertSent = sales.table(
  'kpi_alert_sent',
  {
    period: text('period').notNull(),
    /** The person rung. A real FK although a machine writes the row: the
     *  recipient is read from `kpi_allocation_line.actor_id`, itself an FK. */
    actorId: text('actor_id')
      .notNull()
      .references(() => actor.id),
    /** Part of the key: one person holding two roles is scored per role. */
    role: text('role').$type<RoleId>().notNull(),
    metricKey: text('metric_key').$type<KpiMetricKey>().notNull(),
    /** `slip` = forecast below target, `hit` = target reached (ADR 0098). */
    flag: text('flag').$type<'slip' | 'hit'>().notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /* "Has this person been told about this metric and flag this month?" is
       the whole key. The sweep's anti-join leads with `period`, its prefix. */
    primaryKey({
      name: 'kpi_alert_sent_pk',
      columns: [t.period, t.actorId, t.role, t.metricKey, t.flag],
    }),

    check('kpi_alert_sent_period_shape', sql`"period" ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'`),
    check('kpi_alert_sent_role_known', roleKnown()),
    check('kpi_alert_sent_metric_known', metricKnown()),
    check('kpi_alert_sent_flag_known', sql`"flag" IN ('slip', 'hit')`),
  ],
)

export type KpiRoleMetricRowDb = typeof kpiRoleMetric.$inferSelect
export type KpiRoleMetricValues = typeof kpiRoleMetric.$inferInsert
export type KpiFunnelTargetRowDb = typeof kpiFunnelTarget.$inferSelect
export type KpiFunnelTargetValues = typeof kpiFunnelTarget.$inferInsert
export type KpiMarketingBudgetRowDb = typeof kpiMarketingBudget.$inferSelect
export type KpiMarketingBudgetValues = typeof kpiMarketingBudget.$inferInsert
export type KpiAlertSentRowDb = typeof kpiAlertSent.$inferSelect
export type KpiAlertSentValues = typeof kpiAlertSent.$inferInsert
