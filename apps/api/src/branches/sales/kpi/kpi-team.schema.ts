import { boolean, check, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { sql, type SQL } from 'drizzle-orm'
import { actor } from '@api/platform/db/platform.schema'
import { sales } from '../sales.schema'

/** KPI teams (ADR 0101): a named group of people whose target the head splits
 *  as one share and whose lead splits it again across the members.
 *
 *  Membership is versioned by month, not edited in place. A roster is a header
 *  row per month it changed (`kpi_team_roster`) plus its members; the roster in
 *  force for month P is the one with the greatest `from_period <= P`. The header
 *  exists so an emptied roster (every team deleted) still overrides the older
 *  one, and so a month whose packages were already sent keeps the roster it was
 *  sent under. A team row is kept for history even after it loses its members.
 *
 *  Teams are KPI-only: nothing here widens lead, opportunity or contract access.
 *  Every actor column is a real FK, for `kpi_target`'s reason: only a signed-in
 *  person writes here. */

/** `KpiPeriodKey`'s regex: a month key only. Hand copy of `kpi-allocation.schema.ts`'s. */
const periodShape = (): SQL => sql`"from_period" ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'`

export const kpiTeam = sales.table(
  'kpi_team',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => actor.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  () => [
    /** The name is a label on screen and in the bell: blank or a paragraph is refused. */
    check('kpi_team_name_length', sql`length(btrim("name")) BETWEEN 1 AND 80`),
  ],
)

export const kpiTeamRoster = sales.table(
  'kpi_team_roster',
  {
    /** The first month this roster applies to. One header per month, so two
     *  writers saving the same month collide instead of both winning. */
    fromPeriod: text('from_period').primaryKey(),
    savedBy: text('saved_by')
      .notNull()
      .references(() => actor.id),
    savedAt: timestamp('saved_at', { withTimezone: true }).notNull().defaultNow(),
  },
  () => [check('kpi_team_roster_period_shape', periodShape())],
)

export const kpiTeamMember = sales.table(
  'kpi_team_member',
  {
    /** CASCADE: a roster header is never deleted by the api; the cascade only
     *  keeps a hand clean-up from orphaning member rows. */
    fromPeriod: text('from_period')
      .notNull()
      .references(() => kpiTeamRoster.fromPeriod, { onDelete: 'cascade' }),
    actorId: text('actor_id')
      .notNull()
      .references(() => actor.id),
    teamId: uuid('team_id')
      .notNull()
      .references(() => kpiTeam.id),
    /** A flag on one member, not a role: the lead keeps their own roles and
     *  gets rights only inside this team (ADR 0101 D2). */
    lead: boolean('lead').notNull().default(false),
  },
  (t) => [
    /* "The roster of month P" reads this key's prefix; the key itself is the
       fence: a person is in at most one team per roster. */
    primaryKey({ name: 'kpi_team_member_pk', columns: [t.fromPeriod, t.actorId] }),
    /** "Who leads team T in roster P", capped at one lead per team. */
    uniqueIndex('kpi_team_member_one_lead_uq')
      .on(t.fromPeriod, t.teamId)
      .where(sql`"lead"`),
  ],
)

export type KpiTeamRowDb = typeof kpiTeam.$inferSelect
export type KpiTeamValues = typeof kpiTeam.$inferInsert
export type KpiTeamRosterRowDb = typeof kpiTeamRoster.$inferSelect
export type KpiTeamRosterValues = typeof kpiTeamRoster.$inferInsert
export type KpiTeamMemberRowDb = typeof kpiTeamMember.$inferSelect
export type KpiTeamMemberValues = typeof kpiTeamMember.$inferInsert
