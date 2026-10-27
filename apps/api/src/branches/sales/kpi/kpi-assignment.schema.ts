import {
  boolean,
  check,
  integer,
  numeric,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { KpiMetricKey, RoleId } from '@pv/contracts'
import { actor } from '@api/platform/db/platform.schema'
import { sales } from '../sales.schema'
import { metricKnown, periodShape, roleKnown } from './kpi-allocation.schema'

/** Tiered KPI assignment (ADR 0120): what the head of one unit hands down for
 *  one role in month P (the month targeted), as lines to child units and people.
 *
 *  Sending is final, so a change is a new `version`: a draft v2 sits beside the
 *  sent v1, which stays in force until v2 is sent and only then turns
 *  `superseded`, in the same transaction. Sets are never deleted. Unit ids have no FK: they live in `platform.org_node`
 *  under a (from_period, unit_id) key, and the door may delete a unit from the
 *  version in force while a set naming it is still a draft (the tree floor
 *  counts sent sets only), so a fence there would refuse a legitimate edit.
 *  Actor columns are real FKs, `kpi_target`'s reason. Lists are hand copies. */

export const kpiAssignment = sales.table(
  'kpi_assignment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    period: text('period').notNull(),
    role: text('role').$type<RoleId>().notNull(),
    /** The assigning unit, which is the receiver of the set above it. */
    unitId: uuid('unit_id').notNull(),
    version: integer('version').notNull(),
    status: text('status').$type<'draft' | 'sent' | 'superseded'>().notNull(),
    /** Written by the late sweep at last month's figures (ADR 0120 §6), not by a head. */
    byDefault: boolean('by_default').notNull().default(false),
    sentBy: text('sent_by').references(() => actor.id),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    /** NULL only on a sweep-written set: the sweep has no actor of its own. */
    createdBy: text('created_by').references(() => actor.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /** "Version N of unit U's set for role R in month P", and no two writers both make v2. */
    uniqueIndex('kpi_assignment_version_uq').on(t.period, t.role, t.unitId, t.version),
    /** "The set in force for unit U, role R, month P" — every reader's first read,
     *  capped at one. Its prefix answers the close gate's "every sent set of month P". */
    uniqueIndex('kpi_assignment_one_sent_uq')
      .on(t.period, t.role, t.unitId)
      .where(sql`"status" = 'sent'`),
    /** "The head's open draft for that slot", capped at one: two drafts would race to v2. */
    uniqueIndex('kpi_assignment_one_draft_uq')
      .on(t.period, t.role, t.unitId)
      .where(sql`"status" = 'draft'`),

    check('kpi_assignment_period_shape', periodShape()),
    check('kpi_assignment_role_known', roleKnown()),
    check('kpi_assignment_version_positive', sql`"version" >= 1`),
    check('kpi_assignment_status_known', sql`"status" IN ('draft', 'sent', 'superseded')`),
    /** Every status but `draft` was sent once, so `superseded` keeps its stamp. */
    check('kpi_assignment_sent_stamp', sql`("status" = 'draft') = ("sent_at" IS NULL)`),
    /** The sweep only ever writes a sent set: a default draft would wait for nobody. */
    check('kpi_assignment_default_is_sent', sql`NOT "by_default" OR "status" <> 'draft'`),
    /** A human send names its sender; a draft or a sweep-written set cannot. */
    check(
      'kpi_assignment_sender_matches',
      sql`("status" = 'draft' OR "by_default") = ("sent_by" IS NULL)`,
    ),
    check('kpi_assignment_author_unless_default', sql`"by_default" OR "created_by" IS NOT NULL`),
  ],
)

export const kpiAssignmentLine = sales.table(
  'kpi_assignment_line',
  {
    assignmentId: uuid('assignment_id')
      .notNull()
      .references(() => kpiAssignment.id),
    metricKey: text('metric_key').$type<KpiMetricKey>().notNull(),
    /** `total` is what the unit itself received, carried only on the company's set. */
    kind: text('kind').$type<'total' | 'unit' | 'person'>().notNull(),
    childUnitId: uuid('child_unit_id'),
    personId: text('person_id').references(() => actor.id),
    /** No scale, for `kpi_target.value`'s reason: dong, ratios, hours, days. */
    value: numeric('value').notNull(),
    /** The holder's confirmation, cleared by a resend that changes the value. */
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  },
  (t) => [
    /** "Line of metric M for this child or person in set S", and the fence: one
     *  each. The `''` arm keeps one `total` per metric, which a NULL key would fork.
     *  "My lines" finds the live set first, then walks this prefix. */
    uniqueIndex('kpi_assignment_line_uq').on(
      t.assignmentId,
      t.metricKey,
      t.kind,
      sql`coalesce("child_unit_id"::text, "person_id", '')`,
    ),
    check('kpi_assignment_line_metric_known', metricKnown()),
    check('kpi_assignment_line_kind_known', sql`"kind" IN ('total', 'unit', 'person')`),
    /** Each kind names exactly the receiver it is for. */
    check(
      'kpi_assignment_line_receiver_matches_kind',
      sql`("kind" = 'total' AND "child_unit_id" IS NULL AND "person_id" IS NULL)
          OR ("kind" = 'unit' AND "child_unit_id" IS NOT NULL AND "person_id" IS NULL)
          OR ("kind" = 'person' AND "person_id" IS NOT NULL AND "child_unit_id" IS NULL)`,
    ),
    check('kpi_assignment_line_value_not_negative', sql`"value" >= 0`),
    /** Only a person confirms; a unit's head answers by sending its own set. */
    check(
      'kpi_assignment_line_confirmed_by_person',
      sql`"confirmed_at" IS NULL OR "kind" = 'person'`,
    ),
  ],
)

export type KpiAssignmentRowDb = typeof kpiAssignment.$inferSelect
export type KpiAssignmentValues = typeof kpiAssignment.$inferInsert
export type KpiAssignmentLineRowDb = typeof kpiAssignmentLine.$inferSelect
export type KpiAssignmentLineValues = typeof kpiAssignmentLine.$inferInsert
