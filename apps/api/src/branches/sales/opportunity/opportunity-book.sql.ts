import { sql, type SQL } from 'drizzle-orm'
import type { StageKey } from '@pv/contracts'
import type { Actor } from '@pv/engines'
import type { StageConfig } from '../ladder'
import { dealStoodBy } from '../open-deal'
import { opportunity } from './opportunity.schema'

/** The book's one clock for "late in its column", built from limits ALREADY
 *  resolved by `stageConfigOf`: a stage key pairs with its configuration row by
 *  ordinal position, a fence SQL cannot apply, so the limits arrive as a CASE.
 *  A stage with no configured limit falls through the CASE to NULL and never
 *  matches — `rotting: 0` beside `limitDays: null` reads "nothing can be late". */

/** Whole days in the current column the way `pipelinePosition` counts them:
 *  `daysUntil` truncates both instants to their UTC calendar date, so
 *  `daysInStage − limitDays` IS `position.overdueBy` on every row. NULL, not 0,
 *  with no `stage_since`: a closed deal stands in no column. */
export const DAYS_IN_STAGE = sql<
  number | null
>`CASE WHEN ${opportunity.stageSince} IS NULL THEN NULL
  ELSE GREATEST(0, (now() AT TIME ZONE 'UTC')::date - (${opportunity.stageSince} AT TIME ZONE 'UTC')::date) END`

/** `CASE stage WHEN … THEN limit END`, or `null` when no column has a limit —
 *  an empty CASE is not valid SQL. */
function limitOf(config: Map<StageKey, StageConfig>): SQL | null {
  const limits: [StageKey, number][] = []
  for (const [key, c] of config) if (c.limitDays !== null) limits.push([key, c.limitDays])
  if (limits.length === 0) return null
  return sql`CASE ${opportunity.stage} ${sql.join(
    limits.map(([key, n]) => sql`WHEN ${key} THEN ${sql.raw(String(n))}`),
    sql` `,
  )} END`
}

/** `position.overdueBy > 0` in SQL — the book's `overdue` filter AND the
 *  histogram's rotting count, so filter, row and bar cannot disagree. */
export function overdueIn(config: Map<StageKey, StageConfig>): SQL {
  const days = limitOf(config)
  if (days === null) return sql`false`
  return sql`${DAYS_IN_STAGE} > ${days}`
}

/** THE deal book's scope axis: an `ownOnly` reader sees the deals they stand
 *  on. Outside `OpportunityRepository` so the pin reach asks this predicate
 *  rather than spelling the `ownOnly` rule a second time. */
export function dealScope(who: Pick<Actor, 'id' | 'ownOnly'>, scoped: boolean): SQL | undefined {
  return scoped && who.ownOnly ? dealStoodBy(opportunity.code, who.id) : undefined
}
