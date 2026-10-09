import { sql, type SQL, type SQLWrapper } from 'drizzle-orm'

/** THE one definition of "open deal", "lost deal", "signed lead" and "lost
 *  lead" on the server, the rule migration 0048 wrote into its backfill. The
 *  lead book, the leaderboard, the live-deal reads, the stop door, the hand-over,
 *  reopen and the run sync all ask through here, so no caller grows its own.
 *
 *  Raw SQL with private aliases rather than Drizzle builders: the fragments ride
 *  inside queries whose outer FROM may be `sales.opportunity` or `sales.contract`
 *  itself, and an unaliased inner table would capture the outer column. */

/** A deal still being worked: not stopped, and no contract signed on it. */
export const dealOpen = (code: SQLWrapper, state: SQLWrapper): SQL =>
  sql`(${state} = 'open' AND NOT EXISTS (SELECT 1 FROM sales.contract od_k WHERE od_k.opportunity_code = ${code}))`

/** Won = a contract row stands on the deal, whatever `state` still reads. */
export const dealWon = (code: SQLWrapper): SQL =>
  sql`EXISTS (SELECT 1 FROM sales.contract od_w WHERE od_w.opportunity_code = ${code})`

/** Stopped for good (ADR 0069 §1) with nothing signed: won and lost never
 *  count one deal twice, a contract beats whatever `state` still reads. */
export const dealLost = (code: SQLWrapper, state: SQLWrapper): SQL =>
  sql`(${state} = 'lost' AND NOT EXISTS (SELECT 1 FROM sales.contract od_k WHERE od_k.opportunity_code = ${code}))`

/** A `contract-sign` request is waiting on the deal — the predicate of
 *  `approval_contract_sign_waiting_uq`, so a move never races the apply step. */
export const dealSignWaiting = (code: SQLWrapper): SQL =>
  sql`EXISTS (SELECT 1 FROM platform.approval od_a WHERE od_a.kind = 'contract-sign' AND od_a.state = 'waiting' AND od_a.payload->>'opportunityCode' = ${code})`

/** The lead has at least one open deal. `leadCode` is the OUTER column. */
export const leadHasOpenDeal = (leadCode: SQLWrapper): SQL =>
  sql`EXISTS (SELECT 1 FROM sales.opportunity od_o WHERE od_o.lead_code = ${leadCode} AND ${dealOpen(sql`od_o.code`, sql`od_o.state`)})`

/** THE deal-scope rule (ADR 0071): `actorId` stands on the deal in either lane
 *  or accepted it. Every `ownOnly` cut over deals asks through here. `code` is
 *  the OUTER deal code. */
export const dealStoodBy = (code: SQLWrapper, actorId: string): SQL =>
  sql`(EXISTS (SELECT 1 FROM sales.opportunity_owner od_s WHERE od_s.opportunity_code = ${code} AND od_s.actor_id = ${actorId})
       OR EXISTS (SELECT 1 FROM sales.opportunity od_a WHERE od_a.code = ${code} AND od_a.accepted_by_id = ${actorId}))`

/** `actorId` stands on (`dealStoodBy`) an open deal of the lead — the reach a
 *  deal's people get over the lead it hangs off. `leadCode` is the OUTER column. */
export const leadDealHeldBy = (leadCode: SQLWrapper, actorId: string): SQL =>
  sql`EXISTS (SELECT 1 FROM sales.opportunity od_h WHERE od_h.lead_code = ${leadCode} AND ${dealOpen(sql`od_h.code`, sql`od_h.state`)} AND ${dealStoodBy(sql`od_h.code`, actorId)})`

export const leadHasContract = (leadCode: SQLWrapper): SQL =>
  sql`EXISTS (SELECT 1 FROM sales.contract od_c WHERE od_c.lead_code = ${leadCode})`

/** The lead stands `converted`: a deal still open, or something signed. A lead
 *  whose deals were all lost does not — reopen reads it (`stateOnReopen`). */
export const leadConverted = (leadCode: SQLWrapper): SQL =>
  sql`(${leadHasOpenDeal(leadCode)} OR ${leadHasContract(leadCode)})`

/** Signed = a contract AND no deal still open, so a lead with one deal signed
 *  and a sibling still being worked keeps running. */
export const leadSigned = (leadCode: SQLWrapper): SQL =>
  sql`(${leadHasContract(leadCode)} AND NOT ${leadHasOpenDeal(leadCode)})`

/** Lost = nothing signed, at least one deal, and every deal stopped (ADR 0069
 *  §3). A lead that never had a deal is not lost by this rule. */
export const leadDealsAllLost = (leadCode: SQLWrapper): SQL =>
  sql`(NOT ${leadHasContract(leadCode)}
       AND EXISTS (SELECT 1 FROM sales.opportunity od_l WHERE od_l.lead_code = ${leadCode})
       AND NOT EXISTS (SELECT 1 FROM sales.opportunity od_l WHERE od_l.lead_code = ${leadCode} AND od_l.state <> 'lost'))`
