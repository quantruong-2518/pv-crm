import { and, eq, sql } from 'drizzle-orm'
import type { Db } from '@api/platform/db/db.module'
import { lead } from '../lead/lead.schema'
import { leadLive } from '../lead/lead-scope'
import { dealOpen, leadHasContract } from '../open-deal'
import type { OpportunityRead } from './opportunity.repository'

/** The profile's `parksLead` (ADR 0109): this open deal is the last live one
 *  of a `converted` lead with no live contract, so stopping it parks the lead.
 *  Read outside any lock, for one hint line; the stop door judges the same
 *  fact again under its own (`OpportunityMoves.stop`). */
export async function parksLead(db: Db, found: OpportunityRead): Promise<boolean> {
  if (found.row.state !== 'open' || found.signed) return false
  const [last] = await db
    .select({ code: lead.code })
    .from(lead)
    .where(
      and(
        eq(lead.code, found.row.leadCode),
        eq(lead.state, 'converted'),
        leadLive,
        sql`NOT ${leadHasContract(lead.code)}`,
        sql`NOT EXISTS (SELECT 1 FROM sales.opportunity sl_o WHERE sl_o.lead_code = ${lead.code} AND sl_o.code <> ${found.row.code} AND ${dealOpen(sql`sl_o.code`, sql`sl_o.state`)})`,
      ),
    )
  return last !== undefined
}
