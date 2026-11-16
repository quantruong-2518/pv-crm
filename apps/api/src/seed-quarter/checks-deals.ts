import { sql, type SQL } from 'drizzle-orm'
import { VN_DAY } from './checks-day'

/** Guarantee checks of the `deals` emitter: key as in `scenarios.ts`, value a
 *  `SELECT count(*)` over the seeded rows. Same key as `checks.ts` overrides it.
 *
 *  `hold:open-due-deal` reads the run day off the database clock. */

export const CHECKS_DEALS: Record<string, SQL> = {
  'opportunity:primary-changed': sql.raw(
    `SELECT count(DISTINCT subject_code)::int AS n FROM sales.touch
      WHERE subject_kind = 'opportunity' AND kind = 'handed-over'`,
  ),
  'hold:open-due-deal': sql.raw(
    `SELECT count(*)::int AS n FROM sales.hold
      WHERE subject_type = 'opportunity' AND ended_at IS NULL AND until_day = ${VN_DAY}`,
  ),
}
