import {
  check,
  foreignKey,
  integer,
  numeric,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { sql, type SQL } from 'drizzle-orm'
import type { KpiMetricKey, RoleId } from '@pv/contracts'
import { actor } from '@api/platform/db/platform.schema'
import { sales } from '../sales.schema'

/** Per-person KPI allocation: one role's monthly package split across the
 *  people who hold it, each line acknowledged or countered by its holder.
 *
 *  An agreed package is never edited: a change is a new `version`, so a
 *  return reason and an agreed number stay on disk. A sent package that is
 *  not yet agreed may have a line settled in place (ADR 0098 §3). Only one
 *  package per (period, role) is live; `superseded` is the archive.
 *
 *  Every actor column is a real FK, for `kpi_target`'s reason: only a
 *  signed-in person writes here. The role, period and metric lists are hand
 *  copies of `kpi.schema.ts`'s, for the same reason those are hand copies. */

/** `actor_role_ids_known`'s seven values, in its order. */
const roleKnown = (): SQL =>
  sql`"role" IN ('director', 'head-of-sales', 'marketing', 'bd', 'presales', 'sale', 'account-executive')`

/** `KpiPeriodKey`'s regex: a month key only. */
const periodShape = (): SQL => sql`"period" ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'`

/** The fourteen `KpiMetricKey` values. The role-to-key pairing is
 *  `KPI_CATALOG`'s, enforced at the door, as on `kpi_target`. */
const metricKnown = (): SQL =>
  sql`"metric_key" IN ('leads-sourced', 'lead-to-opportunity-rate', 'sourced-signed-value',
                       'opportunities-opened', 'first-response-hours',
                       'opportunity-accept-rate', 'demos-joined', 'signed-value', 'win-rate',
                       'debriefs-closed', 'overdue-receivables', 'accept-lag-days',
                       'collected-value', 'approval-turnaround-hours')`

export const kpiAllocation = sales.table(
  'kpi_allocation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    period: text('period').notNull(),
    role: text('role').$type<RoleId>().notNull(),
    version: integer('version').notNull(),
    status: text('status')
      .$type<'draft' | 'submitted' | 'returned' | 'agreed' | 'superseded'>()
      .notNull(),
    /** The author and sender, set from the first draft. NOT NULL so the
     *  four-eyes CHECK below never passes on a missing sender. */
    submittedBy: text('submitted_by')
      .notNull()
      .references(() => actor.id),
    /** NULL exactly while `draft`: every other status was sent once. */
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    /** Who returned or agreed it. A return is a decision too, so it is fenced
     *  by the same four-eyes rule as an agreement. */
    decidedBy: text('decided_by').references(() => actor.id),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    /** Kept after the package is superseded: it is why the next version exists. */
    returnReason: text('return_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /** "Version N of role R in month P", and no two writers both make v2. */
    unique('kpi_allocation_version_uq').on(t.period, t.role, t.version),
    /** "The live package of role R in month P" — every screen's first read.
     *  Also the fence: re-allocating an agreed month supersedes it first. */
    uniqueIndex('kpi_allocation_one_live_uq')
      .on(t.period, t.role)
      .where(sql`"status" IN ('draft', 'submitted', 'returned', 'agreed')`),

    check('kpi_allocation_period_shape', periodShape()),
    check('kpi_allocation_role_known', roleKnown()),
    check('kpi_allocation_version_positive', sql`"version" >= 1`),
    check(
      'kpi_allocation_status_known',
      sql`"status" IN ('draft', 'submitted', 'returned', 'agreed', 'superseded')`,
    ),
    check('kpi_allocation_submitted_stamp', sql`("status" = 'draft') = ("submitted_at" IS NULL)`),
    /** Half a decision cannot be read: who without when, or the reverse. */
    check('kpi_allocation_decided_pair', sql`("decided_by" IS NULL) = ("decided_at" IS NULL)`),
    /** A returned or agreed package names its decider; a draft or a pending
     *  one cannot. `superseded` is free: it keeps whatever it had. */
    check(
      'kpi_allocation_decision_matches_status',
      sql`("status" NOT IN ('returned', 'agreed') OR "decided_at" IS NOT NULL)
          AND ("status" NOT IN ('draft', 'submitted') OR "decided_at" IS NULL)`,
    ),
    /** The four-eyes rule. The NULL arm passes a draft by statement. */
    check(
      'kpi_allocation_decided_by_another',
      sql`"decided_by" IS NULL OR "decided_by" <> "submitted_by"`,
    ),
    check(
      'kpi_allocation_returned_has_reason',
      sql`"status" <> 'returned' OR length(btrim(coalesce("return_reason", ''))) > 0`,
    ),
    /** The reverse: a reason means "returned", which `agreedLines` relies on to
     *  tell an agreed-then-superseded package from a returned one. */
    check(
      'kpi_allocation_reason_only_when_returned',
      sql`"status" NOT IN ('draft', 'submitted', 'agreed') OR "return_reason" IS NULL`,
    ),
  ],
)

export const kpiAllocationLine = sales.table(
  'kpi_allocation_line',
  {
    allocationId: uuid('allocation_id')
      .notNull()
      .references(() => kpiAllocation.id),
    actorId: text('actor_id')
      .notNull()
      .references(() => actor.id),
    metricKey: text('metric_key').$type<KpiMetricKey>().notNull(),
    /** No scale, for `kpi_target.value`'s reason: dong, ratios, hours, days. */
    value: numeric('value').notNull(),
    ackStatus: text('ack_status')
      .$type<'pending' | 'acknowledged' | 'countered'>()
      .notNull()
      .default('pending'),
    /** When the holder answered, either way. NULL exactly while `pending`. */
    ackedAt: timestamp('acked_at', { withTimezone: true }),
  },
  (t) => [
    /* No index beyond the key: "my lines this month" finds the live package
       through `kpi_allocation_one_live_uq`, then walks this key's prefix. */
    primaryKey({
      name: 'kpi_allocation_line_pk',
      columns: [t.allocationId, t.actorId, t.metricKey],
    }),
    check('kpi_allocation_line_metric_known', metricKnown()),
    check('kpi_allocation_line_value_not_negative', sql`"value" >= 0`),
    check(
      'kpi_allocation_line_ack_known',
      sql`"ack_status" IN ('pending', 'acknowledged', 'countered')`,
    ),
    check(
      'kpi_allocation_line_acked_stamp',
      sql`("ack_status" = 'pending') = ("acked_at" IS NULL)`,
    ),
  ],
)

export const kpiCounter = sales.table(
  'kpi_counter',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** With the two below, a composite FK to the line: a counter on a line
     *  that does not exist is refused, so no separate FK to the package. */
    allocationId: uuid('allocation_id').notNull(),
    actorId: text('actor_id').notNull(),
    metricKey: text('metric_key').$type<KpiMetricKey>().notNull(),
    proposedValue: numeric('proposed_value').notNull(),
    reason: text('reason').notNull(),
    status: text('status')
      .$type<'open' | 'accepted' | 'kept' | 'countered'>()
      .notNull()
      .default('open'),
    resolvedBy: text('resolved_by').references(() => actor.id),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    /** The manager's own number, only when they answer with one. */
    counterValue: numeric('counter_value'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'kpi_counter_line_fk',
      columns: [t.allocationId, t.actorId, t.metricKey],
      foreignColumns: [
        kpiAllocationLine.allocationId,
        kpiAllocationLine.actorId,
        kpiAllocationLine.metricKey,
      ],
    }),
    /** "The open counter on this line", capped at one. Its prefix also
     *  answers "open counters of package A" for the manager's queue. */
    uniqueIndex('kpi_counter_one_open_uq')
      .on(t.allocationId, t.actorId, t.metricKey)
      .where(sql`"status" = 'open'`),

    check('kpi_counter_status_known', sql`"status" IN ('open', 'accepted', 'kept', 'countered')`),
    check('kpi_counter_proposed_not_negative', sql`"proposed_value" >= 0`),
    check('kpi_counter_reason_present', sql`length(btrim("reason")) > 0`),
    check(
      'kpi_counter_resolved_pair',
      sql`("resolved_by" IS NULL) = ("resolved_at" IS NULL)
          AND ("status" = 'open') = ("resolved_at" IS NULL)`,
    ),
    /** A value only on `countered`, and never negative. */
    check(
      'kpi_counter_value_on_countered',
      sql`("status" = 'countered') = ("counter_value" IS NOT NULL)
          AND ("counter_value" IS NULL OR "counter_value" >= 0)`,
    ),
    /** The holder does not settle their own counter. */
    check(
      'kpi_counter_resolved_by_another',
      sql`"resolved_by" IS NULL OR "resolved_by" <> "actor_id"`,
    ),
  ],
)

export type KpiAllocationRowDb = typeof kpiAllocation.$inferSelect
export type KpiAllocationValues = typeof kpiAllocation.$inferInsert
export type KpiAllocationLineRowDb = typeof kpiAllocationLine.$inferSelect
export type KpiAllocationLineValues = typeof kpiAllocationLine.$inferInsert
export type KpiCounterRowDb = typeof kpiCounter.$inferSelect
export type KpiCounterValues = typeof kpiCounter.$inferInsert
