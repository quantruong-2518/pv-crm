import { and, arrayOverlaps, eq, exists, inArray, not, or, sql, type SQL } from 'drizzle-orm'
import { OWNER_NONE, SELLER_ROLES, StageKey } from '@pv/contracts'
import { csvOf } from '@api/platform/db/book-filter'
import type { Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import { opportunity, opportunityOwner } from './opportunity.schema'

/** The `stage` list's keys, in the column type `inArray` needs. */
export const stagesOf = (csv: string): StageKey[] =>
  StageKey.options.filter((s) => csvOf(csv).includes(s))

/** Filter by who stands on the deal, ONE role per call; `csv` is a comma list of actor ids.
 *
 *  `OWNER_NONE` is the wire's word for "nobody", so it becomes `NOT EXISTS` (a
 *  missing join row), not an equality; beside real ids the two halves are
 *  ORed, as the lead book's `byActor` does. `EXISTS` and not `JOIN`: a deal
 *  with three people would be tripled by a join and `COUNT` would count three. */
export function ownerFilter(db: Db, role: 'SALE' | 'BD', csv: string | undefined): SQL | undefined {
  if (!csv) return undefined
  const ids = csvOf(csv)
  const named = ids.filter((id) => id !== OWNER_NONE)

  const held = (extra?: SQL) =>
    exists(
      db
        .select({ one: sql`1` })
        .from(opportunityOwner)
        .innerJoin(actor, eq(actor.id, opportunityOwner.actorId))
        .where(
          and(
            eq(opportunityOwner.opportunityCode, opportunity.code),
            eq(opportunityOwner.role, role),
            extra,
          ),
        ),
    )
  const byId = held(inArray(opportunityOwner.actorId, named))

  if (!ids.includes(OWNER_NONE)) return byId
  /* No SALE owner means no SELLER there (ADR 0071 §4): a head left on the lane is not one. */
  const none = not(
    held(role === 'SALE' ? arrayOverlaps(actor.roleIds, [...SELLER_ROLES]) : undefined),
  )
  return named.length ? or(none, byId) : none
}
