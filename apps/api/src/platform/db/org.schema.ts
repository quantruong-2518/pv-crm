import {
  boolean,
  check,
  foreignKey,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { OrgUnitKind } from '@pv/contracts'
import { actor, platform } from './platform.schema'

/** The org tree (ADR 0118): Company → Department → Team, versioned by month the
 *  way `kpi-team.schema.ts` versions the KPI roster. A header per month it changed
 *  (`org_version`) plus that month's units and members; the tree in force for
 *  month P is the header with the greatest `from_period <= P`. Platform, not
 *  sales: KPI reads it now, lead/opportunity visibility later.
 *
 *  Unit ids are stable across versions and have no table of their own; a team
 *  unit carries its `kpi_team.id` so `kpi_allocation.team_id` keeps resolving.
 *  The database holds every invariant of ADR 0118 §3 but the kind ladder (a team
 *  under a department or the company), which the door checks. Every actor column
 *  is a real FK, `kpi_team`'s reason: only a signed-in person writes here. */

/** Hand copy of `kpi_team_roster_period_shape`: a month key only. */
const periodShape = sql`"from_period" ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'`

export const orgVersion = platform.table(
  'org_version',
  {
    /** One header per month, so two writers saving the same month collide. */
    fromPeriod: text('from_period').primaryKey(),
    savedBy: text('saved_by')
      .notNull()
      .references(() => actor.id),
    savedAt: timestamp('saved_at', { withTimezone: true }).notNull().defaultNow(),
  },
  () => [check('org_version_period_shape', periodShape)],
)

export const orgNode = platform.table(
  'org_node',
  {
    /** CASCADE only keeps a hand clean-up of a header from orphaning rows; the
     *  api never deletes a header. */
    fromPeriod: text('from_period')
      .notNull()
      .references(() => orgVersion.fromPeriod, { onDelete: 'cascade' }),
    unitId: uuid('unit_id').notNull(),
    kind: text('kind').$type<OrgUnitKind>().notNull(),
    name: text('name').notNull(),
    /** NULL exactly on the company. A unit, not a node row: the parent is looked
     *  up in the same version, so moving a team is one changed column. */
    parentId: uuid('parent_id'),
  },
  (t) => [
    primaryKey({ name: 'org_node_pk', columns: [t.fromPeriod, t.unitId] }),
    /** A parent exists in the same version. NO ACTION, not CASCADE: deleting a
     *  unit that still has children is refused here, not only at the door. */
    foreignKey({
      name: 'org_node_parent_fk',
      columns: [t.fromPeriod, t.parentId],
      foreignColumns: [t.fromPeriod, t.unitId],
    }),
    /** "The root of version P", capped at one company per version. */
    uniqueIndex('org_node_one_company_uq')
      .on(t.fromPeriod)
      .where(sql`"kind" = 'company'`),
    /** The three `kind` values, copied by hand: a new level is a migration someone reads. */
    check('org_node_kind_known', sql`"kind" IN ('company', 'department', 'team')`),
    /** The company is the root and only the root: a parentless team would be a
     *  second tree the reader never walks to. */
    check('org_node_root_is_company', sql`("kind" = 'company') = ("parent_id" IS NULL)`),
    /** Shown on screen and in a bell, like `kpi_team_name_length`. */
    check('org_node_name_length', sql`length(btrim("name")) BETWEEN 1 AND 80`),
  ],
)

export const orgMember = platform.table(
  'org_member',
  {
    /** CASCADE with the header, as `org_node`; the unit FK below is NO ACTION. */
    fromPeriod: text('from_period')
      .notNull()
      .references(() => orgVersion.fromPeriod, { onDelete: 'cascade' }),
    actorId: text('actor_id')
      .notNull()
      .references(() => actor.id),
    unitId: uuid('unit_id').notNull(),
    /** A flag on the member row, so "the head is a member of that unit" is true
     *  by shape: a head with no membership cannot be written. Not a role (0118 §4). */
    head: boolean('head').notNull().default(false),
  },
  (t) => [
    /* "Which unit is person X in, in version P" — and the fence: one unit per
       person per version. "The tree of version P" reads this key's prefix. */
    primaryKey({ name: 'org_member_pk', columns: [t.fromPeriod, t.actorId] }),
    /** The unit exists in the same version. NO ACTION, so deleting a unit that
     *  still has members is refused; a header delete cascades both tables at once. */
    foreignKey({
      name: 'org_member_unit_fk',
      columns: [t.fromPeriod, t.unitId],
      foreignColumns: [orgNode.fromPeriod, orgNode.unitId],
    }),
    /** "Who heads unit U in version P", capped at one head per unit. */
    uniqueIndex('org_member_one_head_uq')
      .on(t.fromPeriod, t.unitId)
      .where(sql`"head"`),
  ],
)

export type OrgVersionRowDb = typeof orgVersion.$inferSelect
export type OrgVersionValues = typeof orgVersion.$inferInsert
export type OrgNodeRowDb = typeof orgNode.$inferSelect
export type OrgNodeValues = typeof orgNode.$inferInsert
export type OrgMemberRowDb = typeof orgMember.$inferSelect
export type OrgMemberValues = typeof orgMember.$inferInsert
