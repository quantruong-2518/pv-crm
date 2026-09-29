import { and, inArray, isNotNull, sql, type SQL } from 'drizzle-orm'
import type { Db } from '@api/platform/db/db.module'
import { lead } from '../lead/lead.schema'
import { leadDealsAllLost, leadSigned } from '../open-deal'

/** How a run stands, re-derived from its lead inside the caller's transaction,
 *  so a run's end is written with the row that caused it (ADR 0069 §3).
 *
 *  WON when the lead is signed (`leadSigned`) at its latest signature; LOST when
 *  every deal of a PARKED lead (`nurturing`/`disqualified`, or `new` — the pool,
 *  where an unheld lead lands) is lost with nothing signed, at its last stop, or when a lead with no deal is `disqualified`, at
 *  `exited_at`; else OPEN — which also REOPENS a closed run, so re-warming the
 *  lead or opening a new deal brings the same run back. `CHURNED` is never
 *  derived. Only rows whose pair actually changes are written.
 *
 *  Plain functions over `tx`, apart from `WorkstreamRepository`: the lead state
 *  writer calls `syncLeadRuns`, and the repository's file imports the lead's. */

export async function syncClosed(tx: Db, workstreamCodes: readonly string[]): Promise<void> {
  if (workstreamCodes.length === 0) return
  await tx.execute(SYNC_CLOSED(workstreamCodes))
}

/** The runs of these leads — for a lead state move, which knows leads, not runs. */
export async function syncLeadRuns(tx: Db, leadCodes: readonly string[]): Promise<void> {
  if (leadCodes.length === 0) return
  const rows = await tx
    .select({ code: lead.workstreamCode })
    .from(lead)
    .where(and(inArray(lead.code, [...leadCodes]), isNotNull(lead.workstreamCode)))
  await syncClosed(
    tx,
    rows.flatMap((r) => (r.code === null ? [] : [r.code])),
  )
}

/** One UPDATE for `syncClosed`. The `CASE` around `greatest` is load-bearing:
 *  `greatest` skips NULLs, so an open run would otherwise get `opened_at`. */
function SYNC_CLOSED(codes: readonly string[]): SQL {
  const list = sql.join(
    codes.map((c) => sql`${c}`),
    sql`, `,
  )

  return sql`
    UPDATE sales.workstream w
       SET closed_at = v.closed_at, close_reason = v.close_reason
      FROM (
        SELECT w2.code,
               CASE WHEN x.won THEN greatest(x.signed_at, w2.opened_at)
                    WHEN x.lost_at IS NOT NULL THEN greatest(x.lost_at, w2.opened_at)
               END AS closed_at,
               CASE WHEN x.won THEN 'WON'
                    WHEN x.lost_at IS NOT NULL THEN 'LOST'
               END AS close_reason
          FROM sales.workstream w2
          JOIN LATERAL (
            SELECT ${leadSigned(sql`l.code`)} AS won,
                   (SELECT max(k.signed_at) FROM sales.contract k WHERE k.lead_code = l.code) AS signed_at,
                   CASE WHEN l.state IN ('nurturing', 'disqualified', 'new') AND ${leadDealsAllLost(sql`l.code`)}
                          THEN greatest(
                                 (SELECT max(o.closed_at) FROM sales.opportunity o WHERE o.lead_code = l.code),
                                 CASE l.state WHEN 'disqualified' THEN l.exited_at END)
                        WHEN l.state = 'disqualified'
                             AND NOT EXISTS (SELECT 1 FROM sales.opportunity o WHERE o.lead_code = l.code)
                          THEN l.exited_at
                   END AS lost_at
              FROM sales.lead l
             WHERE l.workstream_code = w2.code
          ) x ON true
         WHERE w2.code IN (${list})
      ) v
     WHERE w.code = v.code
       AND (w.closed_at, w.close_reason) IS DISTINCT FROM (v.closed_at, v.close_reason)
  `
}
