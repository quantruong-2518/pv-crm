import { sql, type SQL } from 'drizzle-orm'
import { VN_DAY } from './checks-day'

/** Guarantee checks of the `kpi` emitter: key as in `scenarios.ts`, value a
 *  `SELECT count(*)` over the seeded rows. Same key as `checks.ts` overrides it.
 *
 *  The 2026-12 sets count only where the org tree has the unit, the packages sit on
 *  2026-11 because allocations accept old months only (see `emit-kpi-packages.ts`). */

const count = (table: string, where: string): SQL =>
  sql.raw(`SELECT count(*)::int AS n FROM sales.${table} WHERE ${where}`)

const NOV = `period = '2026-11'`
const ALLOC = (status: string) => count('kpi_allocation', `${NOV} AND status = '${status}'`)
const COUNTER = (status: string) => count('kpi_counter', `status = '${status}'`)
const SET = (status: string) =>
  count('kpi_assignment', `period = '2026-12' AND status = '${status}'`)
const MONTH = (period: string) => count('kpi_target', `period = '${period}'`)

export const CHECKS_KPI: Record<string, SQL> = {
  'kpi:target-2026-08': MONTH('2026-08'),
  'kpi:target-2026-09': MONTH('2026-09'),
  'kpi:target-2026-10': MONTH('2026-10'),
  'kpi:target-2026-11': MONTH('2026-11'),
  'kpi:ack-agreed': count('kpi_acknowledgement', `period <= '2026-11'`),
  'kpi:absence': count('kpi_absence', `true`),
  'kpi:absence-cancelled': count('kpi_absence', `cancelled_at IS NOT NULL`),
  'kpi:absence-covers-today': count(
    'kpi_absence',
    `cancelled_at IS NULL AND from_day <= ${VN_DAY} AND to_day >= ${VN_DAY}`,
  ),
  'kpi:team': count('kpi_team', `true`),
  'kpi:team-member': count('kpi_team_member', `true`),
  'kpi:team-roster': count('kpi_team_roster', `true`),
  'kpi:allocation-draft': ALLOC('draft'),
  'kpi:allocation-submitted': ALLOC('submitted'),
  'kpi:allocation-returned': ALLOC('returned'),
  'kpi:allocation-agreed': ALLOC('agreed'),
  'kpi:allocation-superseded': ALLOC('superseded'),
  'kpi:line-lapsed': count(
    'kpi_allocation_line',
    `ack_status = 'acknowledged' AND acked_by_default`,
  ),
  'kpi:line-pending': count('kpi_allocation_line', `ack_status = 'pending'`),
  'kpi:counter-open': COUNTER('open'),
  'kpi:counter-accepted': COUNTER('accepted'),
  'kpi:counter-kept': COUNTER('kept'),
  'kpi:counter-countered': COUNTER('countered'),
  'kpi:assignment-sent': SET('sent'),
  'kpi:assignment-draft': SET('draft'),
  'kpi:assignment-superseded': SET('superseded'),
  'kpi:assignment-person-confirmed': count(
    'kpi_assignment_line',
    `kind = 'person' AND confirmed_at IS NOT NULL`,
  ),
  'kpi:assignment-person-open': count(
    'kpi_assignment_line',
    `kind = 'person' AND confirmed_at IS NULL`,
  ),
  'kpi:marketing-budget': count('kpi_marketing_budget', `period >= '2026-12'`),
}

/** What the report must show above zero for this emitter. */
export const KPI_GUARANTEES: string[] = Object.keys(CHECKS_KPI)
