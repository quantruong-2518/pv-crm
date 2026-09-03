import { sql, type SQL, type SQLWrapper } from 'drizzle-orm'
import { CURRENCIES } from '@pv/contracts'

/** An amount converted to dong, computed in SQL from `CURRENCIES` — the same
 *  rate table the screens print with, so a sum and the figure beside it cannot
 *  drift.
 *
 *  A function rather than a constant because three tables need it on their own
 *  columns (`contract`, `contract` by month, `opportunity` under the
 *  leaderboard). `opportunity.repository.ts` keeps its own copy of this
 *  expression, written before this file existed; both read the one table.
 *
 *  NULL, never 0, for a row with no amount or an unknown currency: "this row
 *  carries no money" is reported as its own count, and a zero would bury it
 *  inside the sum. */
export function dongOf(amount: SQLWrapper, currency: SQLWrapper): SQL<number | null> {
  return sql`CASE ${currency} ${sql.join(
    /* `sql.raw` for the rate, a bound parameter for the code: Postgres cannot
       infer the type of `$1` inside a CASE branch, and the rates are our own
       constants rather than anything a user typed. */
    CURRENCIES.map((c) => sql`WHEN ${c.code} THEN ${amount} * ${sql.raw(String(c.rate))}`),
    sql` `,
  )} END`
}
