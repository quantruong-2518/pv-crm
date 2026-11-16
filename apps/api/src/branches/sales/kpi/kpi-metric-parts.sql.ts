import { sql, type SQL } from 'drizzle-orm'
import type { OpportunityOwnerRole } from '@pv/contracts'
import { OnDay, toVndSql } from '../money'
import { contractTerminated, dealLost, dealTerminated, dealWon } from '../open-deal'

/** The pieces every KPI basis is built from (`kpi-readings.repository.ts` says
 *  what a basis and a total are). Their own file so the v1 and v2 metric sets
 *  share one copy without importing each other. Aliases are private: `k` is the
 *  counted record, `l` its live lead, `i` an installment. */

/** Appends "and only these actors"; nothing when the whole room is read. */
export type Only = (column: SQL) => SQL
export type Basis = (only: Only) => SQL
/** `total` folds the basis rows, aliased `b`, into the one figure. */
export type KpiMetricSql = { basis: Basis; total: SQL }

export const COUNT = sql`count(*)`
export const SUM = sql`COALESCE(SUM(b.value), 0)`
/** A share's rows carry 1 or 0, so the denominator is exactly the rows. */
export const SHARE = sql`(count(*) FILTER (WHERE b.value = 1))::float8 / NULLIF(count(*), 0)`
export const MEDIAN = sql`percentile_cont(0.5) WITHIN GROUP (ORDER BY b.value)`

export const within = (column: SQL): SQL =>
  sql`${column} >= (SELECT lo FROM span) AND ${column} < (SELECT hi FROM span)`

export const LIVE = sql`JOIN sales.lead l ON l.code = k.lead_code AND l.disabled_at IS NULL`
/** A terminated contract is no sale (ADR 0107): out of signed and overdue.
 *  Collected keeps its cash and books the refund instead (`collected-value`).
 *  Only live readings move; a closed month reads its frozen copy. */
export const KEPT = sql`NOT ${contractTerminated(sql`k.code`)}`
export const contractVnd = toVndSql(sql`k.amount`, sql`k.currency`, sql`k.signed_at`)
/* A snapshot at `as_of`: a month read after its end keeps the rate of its own last day. */
export const installmentVnd = toVndSql(
  sql`i.amount`,
  sql`k.currency`,
  new OnDay(sql`(SELECT as_of FROM span)`),
)
/** "Won" has ONE reading in KPI: the deal has a live contract. Terminated sits
 *  in the win-rate denominator beside lost (ADR 0107 §3). */
const WON = dealWon(sql`k.code`)
const LOST = dealLost(sql`k.code`, sql`k.state`)
const TERMINATED = dealTerminated(sql`k.code`)
export const CLOSED = sql`(${WON} OR ${LOST} OR ${TERMINATED})`
export const seconds = (span: SQL, per: number): SQL =>
  sql`EXTRACT(EPOCH FROM ${span}) / ${sql.raw(String(per))}`

/** The `(value, tag)` tail of a basis row: a bare count, an amount, or a
 *  yes/no answer of a share. Casts, because a bare `$n` in a CASE has no type. */
export const tally = (tag: string): SQL => sql`NULL::float8 AS value, ${tag}::text AS tag`
export const worth = (value: SQL, tag: string): SQL => sql`${value} AS value, ${tag}::text AS tag`
export const flag = (yes: SQL, on: string, off: string): SQL =>
  sql`CASE WHEN ${yes} THEN 1 ELSE 0 END::float8 AS value,
      CASE WHEN ${yes} THEN ${on}::text ELSE ${off}::text END AS tag`
/** A closed deal as a share row: won counts 1, lost and terminated 0. */
export const OUTCOME = sql`CASE WHEN ${WON} THEN 1 ELSE 0 END::float8 AS value,
  CASE WHEN ${WON} THEN 'won' WHEN ${TERMINATED} THEN 'terminated' ELSE 'lost' END AS tag`

/** An installment has no code of its own; `contract/no` is its page's address. */
export const INSTALLMENT = sql`'installment' AS kind, k.code || '/' || i.no AS code`

/** The marketing cohort: leads created in the period, by who sourced them. */
export const sourced =
  (tail: SQL): Basis =>
  (only) => sql`
    SELECT k.marketing_owner_id AS actor_id, 'lead' AS kind, k.code, k.created_at AS at, ${tail}
    FROM sales.lead k
    WHERE k.disabled_at IS NULL AND k.marketing_owner_id IS NOT NULL
      AND ${within(sql`k.created_at`)}${only(sql`k.marketing_owner_id`)}`

/** Deals with the actor on one lane (`null` = SALE or BD, as before the PRESALES
 *  lane, so v1 counts do not move), fenced on one of the deal's own dates; `also`
 *  narrows which deals count. DISTINCT: a person on two lanes of one deal is one deal. */
export const onLane = (
  lane: OpportunityOwnerRole | null,
  date: SQL,
  tail: SQL,
  also?: SQL,
): Basis => {
  const seat = lane ? sql`w.role = ${lane} AND ` : sql`w.role IN ('SALE', 'BD') AND `
  const kept = also ? sql`${also} AND ` : sql``
  return (
    only,
  ) => sql`SELECT DISTINCT w.actor_id, 'opportunity' AS kind, k.code, ${date} AS at, ${tail}
    FROM sales.opportunity_owner w
    JOIN sales.opportunity k ON k.code = w.opportunity_code ${LIVE}
    WHERE ${seat}${kept}${within(date)}${only(sql`w.actor_id`)}`
}
