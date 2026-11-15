import { sql, type SQL } from 'drizzle-orm'
import { CREDIT_TOTAL_BP } from '@pv/contracts'

/** The signed-value split of ADR 0155 as SQL, spelled once for the KPI basis and
 *  the leaderboard. Raw fragments over `sales.contract` aliased `k`, because the
 *  KPI basis is raw SQL with private aliases.
 *
 *  Same rule as `splitByCredits` in `@pv/contracts`: every non-closer part is
 *  floored to whole dong and the closer takes the remainder, so the parts of a
 *  contract always sum to its value. A contract with no rows stays on the
 *  owner at 100 %, which keeps every older reading byte-identical. */

/** The contract has no credit rows: the owner holds all of it. */
export const NO_CREDIT = sql`NOT EXISTS (
  SELECT 1 FROM sales.contract_credit nc WHERE nc.contract_code = k.code)`

/** One row per credited person; `cr` is that person's row. */
export const CREDIT_ROWS = sql`JOIN sales.contract_credit cr ON cr.contract_code = k.code`

/** Binds the contract's dong value as `v.vnd`, so the split reads it once. */
export const creditValue = (vnd: SQL): SQL => sql`CROSS JOIN LATERAL (SELECT ${vnd} AS vnd) v`

/** `cr`'s part of `v.vnd`; NULL money stays NULL. */
export const CREDIT_PART = sql`CASE WHEN cr.actor_id = k.owner_id
  THEN v.vnd - COALESCE((SELECT sum(floor(v.vnd * o.share_bp / ${CREDIT_TOTAL_BP}))
                           FROM sales.contract_credit o
                          WHERE o.contract_code = k.code AND o.actor_id <> k.owner_id), 0)
  ELSE floor(v.vnd * cr.share_bp / ${CREDIT_TOTAL_BP}) END`
