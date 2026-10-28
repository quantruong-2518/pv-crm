import { and, asc, eq, inArray, sql, type SQL, type SQLWrapper } from 'drizzle-orm'
import type { LeadIndustry } from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import { invalid } from '@api/platform/http/problem'
import { configEntry } from '../config/config.schema'
import { leadIndustry } from './lead.schema'

/** A lead's category and industries (0154): the reads every lead row shares and
 *  the one write rule. Module-free for `lead-label.sql.ts`'s reason —
 *  `LeadRepository` is provided bare in other modules. */

/** Industries per lead in config order — `labelsOf`'s idiom: one query a page. */
export async function industriesOf(
  handle: Db,
  codes: readonly string[],
): Promise<Map<string, LeadIndustry[]>> {
  const out = new Map<string, LeadIndustry[]>()
  if (codes.length === 0) return out
  const rows = await handle
    .select({
      code: leadIndustry.leadCode,
      id: configEntry.id,
      name: configEntry.name,
      categoryId: configEntry.parentId,
    })
    .from(leadIndustry)
    .innerJoin(
      configEntry,
      and(
        eq(configEntry.id, leadIndustry.industryId),
        eq(configEntry.list, leadIndustry.industryList),
      ),
    )
    .where(inArray(leadIndustry.leadCode, [...codes]))
    .orderBy(asc(configEntry.ord), asc(configEntry.id))
  for (const { code, ...industry } of rows) out.set(code, [...(out.get(code) ?? []), industry])
  return out
}

/** The lead carries this industry. `code` is the OUTER lead code. */
export const leadInIndustry = (code: SQLWrapper, id: string): SQL =>
  sql`EXISTS (SELECT 1 FROM sales.lead_industry li_f WHERE li_f.lead_code = ${code} AND li_f.industry_id = ${id})`

/** The name of a live CATEGORY, or a 400 on `categoryId`. A retired one stays on
 *  the leads that hold it but is never a new pick, like a retired label. */
export async function liveCategoryName(handle: Db, id: string): Promise<string> {
  const [row] = await handle
    .select({ name: configEntry.name })
    .from(configEntry)
    .where(
      and(eq(configEntry.list, 'CATEGORY'), eq(configEntry.id, id), eq(configEntry.active, true)),
    )
  if (row) return row.name
  throw invalid({ categoryId: ['Không tìm thấy nhóm ngành này. Chọn lại.'] })
}

/** Which of `ids` are live INDUSTRY rows of `categoryId` — the only new picks. */
export async function pickable(
  tx: Db,
  categoryId: string,
  ids: readonly string[],
): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const rows = await tx
    .select({ id: configEntry.id })
    .from(configEntry)
    .where(
      and(
        eq(configEntry.list, 'INDUSTRY'),
        eq(configEntry.active, true),
        eq(configEntry.parentId, categoryId),
        inArray(configEntry.id, [...ids]),
      ),
    )
  return new Set(rows.map((r) => r.id))
}

/** Settle one lead's industry set on `tx`.
 *
 *  `want` absent keeps the stored set. Every id the lead does not hold yet must
 *  be a live INDUSTRY of `categoryId`; a held one may stay whatever it is. On a
 *  category change a held link goes only when its industry sits in ANOTHER
 *  category; uncategorised links always stay. Held links are never re-inserted,
 *  so one a merge moved away meanwhile does not come back. */
export async function settleIndustries(
  tx: Db,
  s: { code: string; categoryId: string | null; want?: readonly string[]; recategorised: boolean },
): Promise<void> {
  const held = await tx
    .select({ id: leadIndustry.industryId, parentId: configEntry.parentId })
    .from(leadIndustry)
    .innerJoin(configEntry, eq(configEntry.id, leadIndustry.industryId))
    .where(eq(leadIndustry.leadCode, s.code))
  const parentOf = new Map(held.map((h) => [h.id, h.parentId]))
  const next = s.want ?? [...parentOf.keys()]
  const fresh = next.filter((id) => !parentOf.has(id))

  if (fresh.length > 0) {
    if (s.categoryId === null) {
      throw invalid({ industryIds: ['Chọn nhóm ngành trước khi thêm ngành.'] })
    }
    const ok = await pickable(tx, s.categoryId, fresh)
    if (ok.size < fresh.length) {
      throw invalid({ industryIds: ['Chỉ chọn được ngành thuộc nhóm ngành của lead.'] })
    }
  }

  const stays = (id: string) => {
    const parent = parentOf.get(id)
    return !s.recategorised || parent === null || parent === undefined || parent === s.categoryId
  }
  const kept = next.filter(stays)
  const gone = [...parentOf.keys()].filter((id) => !kept.includes(id))
  if (gone.length > 0) {
    await tx
      .delete(leadIndustry)
      .where(and(eq(leadIndustry.leadCode, s.code), inArray(leadIndustry.industryId, gone)))
  }
  if (fresh.length === 0) return
  await tx
    .insert(leadIndustry)
    .values(fresh.map((industryId) => ({ leadCode: s.code, industryId })))
    .onConflictDoNothing()
}
