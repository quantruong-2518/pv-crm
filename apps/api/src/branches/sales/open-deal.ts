import { sql, type SQL, type SQLWrapper } from 'drizzle-orm'

/** THE one definition of "open deal" and "signed lead" on the server, the rule
 *  migration 0048 wrote into its backfill. The lead book, the leaderboard, the
 *  live-deal reads and the run sync all ask through here, so a sixth caller
 *  cannot grow a sixth reading.
 *
 *  Raw SQL with private aliases rather than Drizzle builders: the fragments ride
 *  inside queries whose outer FROM may be `sales.opportunity` or `sales.contract`
 *  itself, and an unaliased inner table would capture the outer column. */

/** A deal still being worked: not in the care list, and no contract signed on it. */
export const dealOpen = (code: SQLWrapper, state: SQLWrapper): SQL =>
  sql`(${state} <> 'care' AND NOT EXISTS (SELECT 1 FROM sales.contract od_k WHERE od_k.opportunity_code = ${code}))`

/** The lead has at least one open deal. `leadCode` is the OUTER column. */
export const leadHasOpenDeal = (leadCode: SQLWrapper): SQL =>
  sql`EXISTS (SELECT 1 FROM sales.opportunity od_o WHERE od_o.lead_code = ${leadCode} AND ${dealOpen(sql`od_o.code`, sql`od_o.state`)})`

export const leadHasContract = (leadCode: SQLWrapper): SQL =>
  sql`EXISTS (SELECT 1 FROM sales.contract od_c WHERE od_c.lead_code = ${leadCode})`

/** Signed = a contract AND no deal still open, so a lead with one deal signed
 *  and a sibling still being worked keeps running. */
export const leadSigned = (leadCode: SQLWrapper): SQL =>
  sql`(${leadHasContract(leadCode)} AND NOT ${leadHasOpenDeal(leadCode)})`
