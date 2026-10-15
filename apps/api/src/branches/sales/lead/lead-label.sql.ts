import { and, asc, eq, inArray, sql, type SQL, type SQLWrapper } from 'drizzle-orm'
import type { LeadLabel } from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import { configEntry } from '../config/config.schema'
import { leadLabel } from './lead.schema'

/** Waiting labels on leads (ADR 0097 §5), the reads every lead row shares.
 *  Module-free because `LeadRepository` is also provided bare in other modules
 *  (campaign, opportunity) and cannot grow a constructor dependency. */

/** Labels per lead, catalogue order — `productsOf`'s idiom: one query for a page. */
export async function labelsOf(
  handle: Db,
  codes: readonly string[],
): Promise<Map<string, LeadLabel[]>> {
  const out = new Map<string, LeadLabel[]>()
  if (codes.length === 0) return out
  const rows = await handle
    .select({ code: leadLabel.leadCode, id: configEntry.id, name: configEntry.name })
    .from(leadLabel)
    .innerJoin(
      configEntry,
      and(eq(configEntry.id, leadLabel.labelId), eq(configEntry.list, leadLabel.list)),
    )
    .where(inArray(leadLabel.leadCode, [...codes]))
    .orderBy(asc(configEntry.ord), asc(configEntry.id))
  for (const r of rows) out.set(r.code, [...(out.get(r.code) ?? []), { id: r.id, name: r.name }])
  return out
}

/** The lead carries ANY of these labels. `code` is the OUTER lead code. */
export const leadLabelledAny = (code: SQLWrapper, ids: readonly string[]): SQL =>
  sql`EXISTS (SELECT 1 FROM sales.lead_label ll_a WHERE ll_a.lead_code = ${code} AND ll_a.label_id IN (${sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  )}))`
