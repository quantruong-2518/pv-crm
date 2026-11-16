import { sql, type SQL } from 'drizzle-orm'
import { VN_DAY } from './checks-day'

/** Guarantee checks of the `leads` emitter: key as in `scenarios.ts`, value a
 *  `SELECT count(*)` over the seeded rows. Same key as `checks.ts` overrides it.
 *
 *  The hold and next-step keys read the run day off the database clock.
 *  A merge is recorded as the product does: a `re-entered` touch and a new
 *  colleague on the lead at the same instant. */

const TODAY = VN_DAY

const holds = (where: string): SQL =>
  sql.raw(`SELECT count(*)::int AS n FROM sales.hold WHERE subject_type = 'lead' AND ${where}`)

export const CHECKS_LEADS: Record<string, SQL> = {
  'lead:merged': sql.raw(
    `SELECT count(DISTINCT t.subject_code)::int AS n FROM sales.touch t
      JOIN sales.contact c ON c.lead_code = t.subject_code AND NOT c.is_primary AND c.created_at = t.at
      WHERE t.subject_kind = 'lead' AND t.kind = 're-entered'`,
  ),
  'hold:open-due-soon': holds(
    `ended_at IS NULL AND until_day > ${TODAY} AND until_day <= ${TODAY} + 6`,
  ),
  'hold:open-overdue': holds(`ended_at IS NULL AND until_day < ${TODAY}`),
  'hold:ended-touch': holds(`end_kind = 'touch'`),
  'hold:ended-to-waiting': holds(`end_kind = 'to-waiting'`),
  'next_step:overdue': sql.raw(
    `SELECT count(*)::int AS n FROM sales.next_step WHERE subject_code LIKE 'LD-%' AND due < ${TODAY}`,
  ),
}
