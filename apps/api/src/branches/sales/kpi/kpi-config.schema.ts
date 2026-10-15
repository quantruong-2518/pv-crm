import { boolean, check, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
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
 *  Every actor column is a real FK, for `kpi_target`'s reason. The role,
 *  period and metric lists are hand copies of `kpi.schema.ts`'s. */

/** `actor_role_ids_known`'s seven values, in its order. */
const roleKnown = (): SQL =>
  sql`"role" IN ('director', 'head-of-sales', 'marketing', 'bd', 'presales', 'sale', 'account-executive')`

/** The fourteen `KpiMetricKey` values. The role-to-key pairing is
 *  `KPI_CATALOG`'s, enforced at the door, as on `kpi_target`. */
const metricKnown = (): SQL =>
  sql`"metric_key" IN ('leads-sourced', 'lead-to-opportunity-rate', 'sourced-signed-value',
                       'opportunities-opened', 'first-response-hours',
                       'opportunity-accept-rate', 'demos-joined', 'signed-value', 'win-rate',
                       'debriefs-closed', 'overdue-receivables', 'accept-lag-days',
                       'collected-value', 'approval-turnaround-hours')`

export const kpiRoleMetric = sales.table(
  'kpi_role_metric',
  {
    role: text('role').$type<RoleId>().notNull(),
    metricKey: text('metric_key').$type<KpiMetricKey>().notNull(),
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
    /* The key answers both reads: "overrides of role R" walks its prefix, and
       "every override" is at most 98 rows. */
    primaryKey({ name: 'kpi_role_metric_pk', columns: [t.role, t.metricKey] }),
    /** "Which metric is role R's primary", and the fence that there is one. */
    uniqueIndex('kpi_role_metric_one_primary_uq')
      .on(t.role)
      .where(sql`"is_primary"`),

    check('kpi_role_metric_role_known', roleKnown()),
    check('kpi_role_metric_metric_known', metricKnown()),
    /** A switched-off metric is not scored, so it cannot be the headline. */
    check('kpi_role_metric_primary_enabled', sql`NOT "is_primary" OR "enabled"`),
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
export type KpiAlertSentRowDb = typeof kpiAlertSent.$inferSelect
export type KpiAlertSentValues = typeof kpiAlertSent.$inferInsert
