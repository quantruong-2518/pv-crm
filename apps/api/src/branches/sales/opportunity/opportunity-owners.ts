import { and, inArray, isNull } from 'drizzle-orm'
import { isSellerRole } from '@pv/contracts'
import type { RoleId } from '@pv/engines'
import type { Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import { conflict, invalid } from '@api/platform/http/problem'
import { handStepOver } from '../next-step/next-step.handover'
import type { TouchService } from '../touch/touch.service'
import { NOTE, type RefOwner } from './opportunity.mapper'
import type { OpportunityRead } from './opportunity.repository'

/** The owner rules every door that sets a deal's people applies (ADR 0071).
 *
 *  1 · Nobody is added to the SALE lane unless they are an active seller
 *      (`isSellerRole`, the contracts' one definition). Only ADDED ids are
 *      judged, so a migrated row with a head on SALE stays editable.
 *  2 · No deal is ownerless: `holderOf` must name someone — a seller, the
 *      acceptor, or a BD. A deal nobody answers for is the failure 0071 fixes.
 *
 *  3 · Past `new` the SALE lane has ONE door, `sale-owners`: the profile PATCH
 *      refuses any change to it, whoever calls.
 *
 *  Plain functions over `tx`, like `opportunity-handover.ts`: the create,
 *  PATCH, accept and assign doors call them, and the import check repeats rule
 *  1 and 2 per row from the staff book it already holds. */

export const NOT_SELLER = 'Chỉ người vai Sale hoặc Account Executive đứng làn Sale được.'
export const NO_OWNER = 'Cơ hội cần ít nhất một người đứng đơn — BD hoặc Sale.'
export const ASSIGN_ONLY = 'Đã nhận PIC — đổi Sale qua nút Giao Sale.'

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

/** Rule 3: refuses with 409 on `saleOwners` when the PATCH body changes the SALE
 *  lane of an accepted deal. Same lane = no refusal. Judge it on a read taken
 *  under the deal's row lock, so an accept landing meanwhile is seen. */
export function assertSaleLaneKept(
  found: Pick<OpportunityRead, 'row' | 'owners'>,
  saleOwners: readonly string[],
): void {
  const accepted = found.row.stage !== 'new' || found.row.acceptedById !== null
  if (!accepted) return
  const before = new Set(found.owners.filter((o) => o.role === 'SALE').map((o) => o.id))
  const same = before.size === saleOwners.length && saleOwners.every((id) => before.has(id))
  if (!same) throw conflict(ASSIGN_ONLY, { saleOwners: [ASSIGN_ONLY] })
}

/** What an owners change leaves, in the door's tx: ONE touch naming who was
 *  given and who was taken off the SALE lane, if anyone was; and whenever the
 *  holder changes, a `handed-over` touch with both ends (the holder chain, as
 *  `opportunity-handover.ts` writes it) and the old holder's open step follows
 *  the new one. */
export async function recordSaleLane(
  tx: Db,
  touch: TouchService,
  change: {
    code: string
    added: readonly RefOwner[]
    removed: readonly RefOwner[]
    from: RefOwner | null
    to: RefOwner | null
    by: RefOwner
    at: Date
  },
): Promise<void> {
  if (change.added.length > 0 || change.removed.length > 0) {
    await touch.record(tx, [
      {
        subjectCode: change.code,
        subjectKind: 'opportunity',
        kind: 'field-filled',
        by: change.by.name,
        actorId: change.by.id,
        note: NOTE.saleLane(
          change.added.map((o) => o.name),
          change.removed.map((o) => o.name),
        ),
        at: change.at,
      },
    ])
  }
  const { from, to } = change
  if (to && from?.id !== to.id) {
    const role = (await actorRoles(tx, [to.id])).get(to.id)
    await touch.record(tx, [
      {
        subjectCode: change.code,
        subjectKind: 'opportunity',
        kind: 'handed-over',
        by: change.by.name,
        actorId: change.by.id,
        ...(from ? { from: { actorId: from.id, name: from.name } } : {}),
        to: { actorId: to.id, name: to.name, ...(role ? { role } : {}) },
        note: NOTE.handedOver(from?.name ?? null, to.name),
        at: change.at,
      },
    ])
  }
  if (from && to && from.id !== to.id) await handStepOver(tx, change.code, from.id, to.id)
}

/** The PATCH's owners change as `recordSaleLane` reads it: SALE ids added and
 *  removed against the deal as read, and the holder before and after. */
export function saleLaneChange(
  found: Pick<OpportunityRead, 'row' | 'owners' | 'holder'>,
  saleOwners: readonly string[],
  names: ReadonlyMap<string, string>,
  to: RefOwner | null,
  who: RefOwner,
): Parameters<typeof recordSaleLane>[2] {
  const before = found.owners.filter((o) => o.role === 'SALE')
  return {
    code: found.row.code,
    added: saleOwners
      .filter((id) => !before.some((o) => o.id === id))
      .map((id) => ({ id, name: names.get(id) ?? id })),
    removed: before.filter((o) => !saleOwners.includes(o.id)),
    from: found.holder,
    to,
    by: { id: who.id, name: who.name },
    at: new Date(),
  }
}
