import { check, integer, numeric, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'
import { sql, type SQL } from 'drizzle-orm'
import type { KpiMetricKey, RoleId } from '@pv/contracts'
import { actor } from '@api/platform/db/platform.schema'
import { sales } from '../sales.schema'

/** KPI by role: the agreed, versioned target and who has acknowledged it.
 *
 *  Readings are NOT here — they are computed on read, so there is no snapshot
 *  table to drift from the book. Only the two things a person decides are
 *  stored: a target (proposed by one manager, agreed by a DIFFERENT one) and
 *  a holder's "I have received it".
 *
 *  A target is never edited once agreed: a change is a new `version`, so the
 *  version IS part of the key and the effective target is the highest agreed
 *  one. Both four-eyes rules are CHECKs, not rules a service remembers.
 *
 *  Every actor column is a REAL foreign key, for `setting.updated_by`'s
 *  reason: only a signed-in person writes here, so the `actor` row exists. */

/** The seven `RoleId` values, copied by hand in `actor_role_ids_known`'s
 *  order: a role added to the contract must be a migration somebody reads. */
const roleKnown = (): SQL =>
  sql`"role" IN ('director', 'head-of-sales', 'marketing', 'bd', 'presales', 'sale', 'account-executive')`

/** `KpiPeriodKey`'s regex, repeated here so no writer can bypass the door:
 *  a month key only, so `2026-13` and a quarter key are both refused. */
const periodShape = (): SQL => sql`"period" ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'`

export const kpiTarget = sales.table(
  'kpi_target',
  {
    role: text('role').$type<RoleId>().notNull(),
    period: text('period').notNull(),
    /** Fenced by `kpi_target_metric_known` below. Whether the key belongs to
     *  THIS role's catalog is the propose door's rule, not the table's. */
    metricKey: text('metric_key').$type<KpiMetricKey>().notNull(),
    version: integer('version').notNull(),
    /** No precision or scale: one column holds dong, ratios, hours and days,
     *  so any fixed scale would be an invented rounding rule. */
    value: numeric('value').notNull(),
    proposedById: text('proposed_by_id')
      .notNull()
      .references(() => actor.id),
    /** No DEFAULT: replacing a pending version moves this stamp, so the
     *  writer always states it. */
    proposedAt: timestamp('proposed_at', { withTimezone: true }).notNull(),
    /** NULL while pending. Set together with `agreed_at`, once. */
    agreedById: text('agreed_by_id').references(() => actor.id),
    agreedAt: timestamp('agreed_at', { withTimezone: true }),
  },
  (t) => [
    primaryKey({
      name: 'kpi_target_pk',
      columns: [t.role, t.period, t.metricKey, t.version],
    }),

    /* No index beyond the primary key: both reads — "targets of one period"
       and "highest agreed version of one metric" — are a few dozen rows, and
       the second walks the key's own (role, period, metric_key) prefix. */

    check('kpi_target_role_known', roleKnown()),
    check('kpi_target_period_shape', periodShape()),
    /** The fourteen `KpiMetricKey` values, copied by hand for
     *  `setting_key_known`'s reason: the key list is the shape of the table.
     *  The role-to-key pairing stays in `KPI_CATALOG`, as per-key bounds do. */
    check(
      'kpi_target_metric_known',
      sql`"metric_key" IN ('leads-sourced', 'lead-to-opportunity-rate', 'sourced-signed-value',
                           'opportunities-opened', 'first-response-hours',
                           'opportunity-accept-rate', 'demos-joined', 'signed-value', 'win-rate',
                           'debriefs-closed', 'overdue-receivables', 'accept-lag-days',
                           'collected-value', 'approval-turnaround-hours')`,
    ),
    check('kpi_target_version_positive', sql`"version" >= 1`),
    /** Zero is a real target ("no overdue receivables"); negative is a typo. */
    check('kpi_target_value_not_negative', sql`"value" >= 0`),
    /** Half an agreement cannot be read: who without when, or the reverse. */
    check('kpi_target_agreed_pair', sql`("agreed_by_id" IS NULL) = ("agreed_at" IS NULL)`),
    /** The four-eyes rule. The NULL arm is explicit so a pending row passes
     *  by statement, not by a CHECK treating UNKNOWN as true. */
    check(
      'kpi_target_agreed_by_another',
      sql`"agreed_by_id" IS NULL OR "agreed_by_id" <> "proposed_by_id"`,
    ),
  ],
)

export const kpiAcknowledgement = sales.table(
  'kpi_acknowledgement',
  {
    actorId: text('actor_id')
      .notNull()
      .references(() => actor.id),
    /** Not checked against `actor.role_ids`: a role can be taken away later,
     *  and the row must keep saying what was acknowledged on the day. */
    role: text('role').$type<RoleId>().notNull(),
    period: text('period').notNull(),
    /** Moved by acknowledging again. Staleness is NOT stored: it is this
     *  stamp compared with the newest `agreed_at`, at read time. */
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({
      name: 'kpi_acknowledgement_pk',
      columns: [t.actorId, t.role, t.period],
    }),

    /* No index beyond the primary key. "Who acknowledged role R in period P"
       has no actor to lead with, but the whole table is one row per holder per
       month — a scan until a screen proves otherwise. */

    check('kpi_acknowledgement_role_known', roleKnown()),
    check('kpi_acknowledgement_period_shape', periodShape()),
  ],
)

export type KpiTargetRowDb = typeof kpiTarget.$inferSelect
export type KpiTargetValues = typeof kpiTarget.$inferInsert
export type KpiAcknowledgementRowDb = typeof kpiAcknowledgement.$inferSelect
export type KpiAcknowledgementValues = typeof kpiAcknowledgement.$inferInsert
