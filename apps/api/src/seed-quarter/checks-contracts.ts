import { sql, type SQL } from 'drizzle-orm'
import { careRuns } from '@api/branches/sales/after-sale/after-sale.sql'
import { journeyInGrowth } from '@api/branches/sales/open-deal'
import { VN_DAY } from './checks-day'

/** Guarantee checks of the `contracts` emitter: key as in `scenarios.ts`, value a
 *  `SELECT count(*)` over the seeded rows. Same key as `checks.ts` overrides it.
 *
 *  Day-relative keys read the run day off the database clock, as the two
 *  after-sale keys do: they run the product's own SQL (`journeyInGrowth`,
 *  `careRuns` with the default cycles). */

const TODAY = VN_DAY
const dayOf = (col: string): string => `((${col} AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)`
const LIVE = `NOT EXISTS (SELECT 1 FROM sales.contract_termination t WHERE t.contract_code = k.code)`

const unpaid = (cond: string): SQL =>
  sql.raw(
    `SELECT count(*)::int AS n FROM sales.contract_installment i
       JOIN sales.contract k ON k.code = i.contract_code
      WHERE i.paid_at IS NULL AND ${LIVE} AND ${cond}`,
  )

export const CHECKS_CONTRACTS: Record<string, SQL> = {
  'contract:collected': sql.raw(
    `SELECT count(*)::int AS n FROM sales.contract k
      WHERE ${LIVE}
        AND EXISTS (SELECT 1 FROM sales.contract_installment i WHERE i.contract_code = k.code)
        AND NOT EXISTS (SELECT 1 FROM sales.contract_installment i
                         WHERE i.contract_code = k.code AND i.paid_at IS NULL)`,
  ),
  'contract:overdue': sql.raw(
    `SELECT count(DISTINCT k.code)::int AS n FROM sales.contract_installment i
       JOIN sales.contract k ON k.code = i.contract_code
      WHERE i.paid_at IS NULL AND ${LIVE} AND ${dayOf('i.due')} < ${TODAY}`,
  ),
  'contract:terminated': sql.raw(`SELECT count(*)::int AS n FROM sales.contract_termination`),
  /* A second contract is one signed after another on the same account (a growth journey). */
  'contract:second': sql.raw(
    `SELECT count(*)::int AS n FROM sales.contract k
       JOIN sales.workstream w ON w.code = k.workstream_code
      WHERE EXISTS (SELECT 1 FROM sales.contract k0
                      JOIN sales.workstream w0 ON w0.code = k0.workstream_code
                     WHERE w0.account_code = w.account_code AND k0.signed_at < k.signed_at)`,
  ),
  'contract:usd': sql.raw(`SELECT count(*)::int AS n FROM sales.contract WHERE currency = 'USD'`),
  'installment:overdue': unpaid(`${dayOf('i.due')} < ${TODAY}`),
  'installment:long-overdue': unpaid(`${dayOf('i.due')} <= ${TODAY} - 15`),
  'installment:due-soon': unpaid(`${dayOf('i.due')} BETWEEN ${TODAY} + 1 AND ${TODAY} + 7`),
  'workstream:growth': sql`SELECT count(*)::int AS n FROM sales.workstream w
    WHERE ${journeyInGrowth(sql`w.code`)}`,
  'after-sale:due': sql`SELECT count(*)::int AS n
    FROM ${careRuns({ hotDays: 14, warmDays: 45, coldDays: 90 })} WHERE care_due`,
}
