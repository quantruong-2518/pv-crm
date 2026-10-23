import { asc, desc, sql, type SQL } from 'drizzle-orm'
import type { LeadBookQuery, RecareCountsResponse } from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import { VN_TODAY } from '../after-sale/after-sale.sql'
import { lead } from './lead.schema'

/** The four groups of the re-contact tab (ADR 0125): the lead book's
 *  `recontact` / `replied` filters and the counts beside them read ONE
 *  predicate each, so a tab's count is always the length of its list. A group
 *  names its own state, so it replaces the book's state filter rather than
 *  ANDing with a default (`active`) that would empty it. "Today" is the
 *  Vietnam day off the DB clock, the same day `vnDay` prints. */

const RECARE = {
  replied: sql`(${lead.state} = 'new' AND ${lead.repliedFromPoolAt} IS NOT NULL)`,
  due: sql`(${lead.state} = 'nurturing' AND ${lead.recontactOn} <= ${VN_TODAY})`,
  later: sql`(${lead.state} = 'nurturing' AND ${lead.recontactOn} > ${VN_TODAY})`,
  none: sql`(${lead.state} = 'nurturing' AND ${lead.recontactOn} IS NULL)`,
} satisfies Record<keyof RecareCountsResponse, SQL>

type Asked = Pick<LeadBookQuery, 'recontact' | 'replied'>

/** The group predicates asked for, or `undefined` when the book asks none. */
export function recareFilter(q: Asked): SQL[] | undefined {
  const parts = [
    ...(q.replied ? [RECARE.replied] : []),
    ...(q.recontact ? [RECARE[q.recontact]] : []),
  ]
  return parts.length > 0 ? parts : undefined
}

/** A group's own order: the soonest call first, else the latest event first. */
export function recareOrder(q: Asked): SQL[] | undefined {
  if (q.replied) return [desc(lead.repliedFromPoolAt)]
  if (q.recontact === 'none') return [desc(lead.exitedAt)]
  if (q.recontact) return [asc(lead.recontactOn)]
  return undefined
}

/** All four sizes in one statement, over the fence the caller passes. */
export async function recareCounts(db: Db, fence: SQL | undefined): Promise<RecareCountsResponse> {
  const n = (group: SQL) => sql<number>`(count(*) FILTER (WHERE ${group}))::int`
  const [row] = await db
    .select({
      replied: n(RECARE.replied),
      due: n(RECARE.due),
      later: n(RECARE.later),
      none: n(RECARE.none),
    })
    .from(lead)
    .where(fence)
  return row ?? { replied: 0, due: 0, later: 0, none: 0 }
}
