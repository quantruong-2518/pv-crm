import { and, inArray, isNull } from 'drizzle-orm'
import { isSellerRole } from '@pv/contracts'
import type { RoleId } from '@pv/engines'
import type { Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import { invalid } from '@api/platform/http/problem'
import type { RefOwner } from './opportunity.mapper'

/** The owner rules every door that sets a deal's people applies (ADR 0071).
 *
 *  1 · Nobody is added to the SALE lane unless they are an active seller
 *      (`isSellerRole`, the contracts' one definition). Only ADDED ids are
 *      judged, so a migrated row with a head on SALE stays editable.
 *  2 · No deal is ownerless: `holderOf` must name someone — a seller, the
 *      acceptor, or a BD. A deal nobody answers for is the failure 0071 fixes.
 *
 *  Plain functions over `tx`, like `opportunity-handover.ts`: the create,
 *  PATCH and accept doors call them, and the import check repeats rule 1 and 2
 *  per row from the staff book it already holds. */

export const NOT_SELLER = 'Chỉ người vai Sale hoặc Account Executive đứng làn Sale được.'
export const NO_OWNER = 'Cơ hội cần ít nhất một người đứng đơn — BD hoặc Sale.'

/** The role of each actor — what the holder rule and the sign door turn on.
 *  A key a decision reads, kept apart from `actorNames`, the label a screen prints. */
export async function actorRoles(tx: Db, ids: readonly string[]): Promise<Map<string, RoleId>> {
  if (ids.length === 0) return new Map()
  const rows = await tx
    .select({ id: actor.id, roleId: actor.roleId })
    .from(actor)
    .where(inArray(actor.id, [...ids]))
  return new Map(rows.map((r) => [r.id, r.roleId]))
}

/** Refuses with 400 on `saleOwners` when any id is not an active seller. */
export async function assertSellers(tx: Db, added: readonly string[]): Promise<void> {
  if (added.length === 0) return
  const rows = await tx
    .select({ id: actor.id, roleId: actor.roleId })
    .from(actor)
    .where(and(inArray(actor.id, [...added]), isNull(actor.disabledAt)))
  const sellers = new Set(rows.filter((r) => isSellerRole(r.roleId)).map((r) => r.id))
  if (added.some((id) => !sellers.has(id))) throw invalid({ saleOwners: [NOT_SELLER] }, NOT_SELLER)
}

/** Refuses with 400 on `bdOwners` when the holder rule finds nobody. */
export function assertHeld(holder: RefOwner | null): void {
  if (holder === null) throw invalid({ bdOwners: [NO_OWNER] }, NO_OWNER)
}
