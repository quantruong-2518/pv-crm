import { check, date, index, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { actor } from '@api/platform/db/platform.schema'
import { sales } from '../sales.schema'

/** A person away from KPI work, and who acts for them meanwhile (ADR 0117 §1).
 *
 *  Days are Vietnam calendar days, both ends inclusive, so `date` and not a
 *  timestamp: "away on the 24th" must not shift with the server's zone. A row
 *  is never deleted; cancelling stamps `cancelled_at`, and the bells already
 *  sent keep naming a real absence.
 *
 *  Two live absences of one person must not overlap. That is the service's
 *  check, not an exclusion constraint: one needs `btree_gist`, which no
 *  migration loads and PGlite has only when the client registers it.
 *  Every actor column is a real FK, for `kpi_target`'s reason: only a
 *  signed-in person declares, and the stand-in is picked from live actors. */
export const kpiAbsence = sales.table(
  'kpi_absence',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorId: text('actor_id')
      .notNull()
      .references(() => actor.id),
    fromDay: date('from_day').notNull(),
    toDay: date('to_day').notNull(),
    standInId: text('stand_in_id')
      .notNull()
      .references(() => actor.id),
    /** The person themself or a `kpi.set-target` holder (ADR 0117 §1). */
    declaredById: text('declared_by_id')
      .notNull()
      .references(() => actor.id),
    declaredAt: timestamp('declared_at', { withTimezone: true }).notNull().defaultNow(),
    /** NULL = live. Set, it ends the absence at once (ADR 0117 default 2). */
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  },
  (t) => [
    /** "Is this person away on day D", and the service's overlap check. */
    index('kpi_absence_actor_idx').on(t.actorId, t.fromDay),
    /** "Whom does this person stand in for" — the waiting lists and the bell. */
    index('kpi_absence_stand_in_idx').on(t.standInId),
    check('kpi_absence_days_ordered', sql`"from_day" <= "to_day"`),
    /** Standing in for yourself would leave the seat with nobody to act. */
    check('kpi_absence_stand_in_not_self', sql`"stand_in_id" <> "actor_id"`),
  ],
)

export type KpiAbsenceRowDb = typeof kpiAbsence.$inferSelect
export type KpiAbsenceValues = typeof kpiAbsence.$inferInsert
