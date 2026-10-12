import { and, inArray, isNull } from 'drizzle-orm'
import { isSellerRole, type OpportunityOwner } from '@pv/contracts'
import type { RoleId } from '@pv/engines'
import type { Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import { conflict, invalid } from '@api/platform/http/problem'
import type { NotificationHub } from '@api/platform/notification/notification.hub'
import { handStepOver } from '../next-step/next-step.handover'
import type { TouchService } from '../touch/touch.service'
import { byNameThenId, holderOf, NOTE, type RefOwner } from './opportunity.mapper'
import type { OpportunityRead } from './opportunity.repository'

/** The owner rules every door that sets a deal's people applies (ADR 0071).
 *
 *  1 · Nobody is added to the SALE lane unless they are an active seller
 *      (`isSellerRole`, the contracts' one definition). Only ADDED ids are
 *      judged, so a migrated row with a head on SALE stays editable.
 *  2 · No deal is ownerless: `holderOf` must name someone — a seller, the
 *      acceptor, or a BD. A deal nobody answers for is the failure 0071 fixes.
 *  3 · Past `new` the SALE lane has ONE door, `sale-owners`: the profile PATCH
 *      refuses any change to it. The stated exception is the lead hand-over,
 *      which swaps a person (and so may move the primary) under the lead's grant.
 *  4 · A non-empty SALE lane has ONE primary (`salePrimaryOf`, ADR 0086).
 *
 *  Plain functions over `tx`, like `opportunity-handover.ts`: every door that
 *  writes owners calls them; the import check repeats rules 1 and 2 per row. */

export const NOT_SELLER = 'Sale đứng đơn phải có vai Sale hoặc Account Executive.'
export const NO_OWNER = 'Cơ hội cần ít nhất một Sale đứng đơn hoặc BD mở cửa.'
export const ASSIGN_ONLY = 'Đã nhận PIC. Đổi Sale bằng nút Giao Sale.'
export const PRIMARY_OFF_LANE = 'Sale chính phải là một người trong danh sách Sale đứng đơn'
export const PRIMARY_NOT_SELLER = 'Sale chính phải là người vai Sale hoặc Account Executive.'
export const PRIMARY_REASON_NEEDED = 'Nêu lý do đổi Sale chính.'

/** One person of a SALE lane as `salePrimaryOf` reads them. */
export type LanePerson = RefOwner & { roleIds: readonly RoleId[] | null }

/** Rule 4 — the ONE choice of the SALE primary, for the lane as it will stand
 *  after the write: the requested person; else the current primary if still
 *  fit; else the first seller by `holderOf`'s order; else the first person.
 *  While the lane holds a seller only a seller is fit, so the primary and
 *  `holderOf` never name two people. `null` only for an empty lane. */
export function salePrimaryOf(
  lane: readonly LanePerson[],
  current: string | null,
  requested?: string,
): string | null {
  const sorted = [...lane].sort(byNameThenId)
  const firstSeller = sorted.find((o) => isSellerRole(o.roleIds))
  const fit = (id: string) =>
    lane.some((o) => o.id === id && (!firstSeller || isSellerRole(o.roleIds)))
  if (requested !== undefined) {
    const why = lane.some((o) => o.id === requested) ? PRIMARY_NOT_SELLER : PRIMARY_OFF_LANE
    if (!fit(requested)) throw invalid({ salePrimary: [why] }, why)
    return requested
  }
  if (current !== null && fit(current)) return current
  return (firstSeller ?? sorted[0])?.id ?? null
}

/** The stored primary of a deal as read; `null` = none (empty lane, or rows
 *  written by pre-0100 code). */
export const primaryOf = (owners: readonly { id: string; primary: boolean }[]): string | null =>
  owners.find((o) => o.primary)?.id ?? null

/** A SALE lane's people by id, for `salePrimaryOf` — ids the actor book does
 *  not know are skipped (their insert dies on the owner foreign key). */
export async function lanePeople(tx: Db, ids: readonly string[]): Promise<LanePerson[]> {
  if (ids.length === 0) return []
  return tx
    .select({ id: actor.id, name: actor.name, roleIds: actor.roleIds })
    .from(actor)
    .where(inArray(actor.id, [...ids]))
}

/** The roles of each actor — what the holder rule and the sign door turn on.
 *  A key a decision reads, kept apart from `actorNames`, the label a screen prints. */
export async function actorRoles(tx: Db, ids: readonly string[]): Promise<Map<string, RoleId[]>> {
  if (ids.length === 0) return new Map()
  const rows = await tx
    .select({ id: actor.id, roleIds: actor.roleIds })
    .from(actor)
    .where(inArray(actor.id, [...ids]))
  return new Map(rows.map((r) => [r.id, r.roleIds]))
}

/** Refuses with 400 on `saleOwners` when any id is not an active seller. */
export async function assertSellers(tx: Db, added: readonly string[]): Promise<void> {
  if (added.length === 0) return
  const rows = await tx
    .select({ id: actor.id, roleIds: actor.roleIds })
    .from(actor)
    .where(and(inArray(actor.id, [...added]), isNull(actor.disabledAt)))
  const sellers = new Set(rows.filter((r) => isSellerRole(r.roleIds)).map((r) => r.id))
  if (added.some((id) => !sellers.has(id))) throw invalid({ saleOwners: [NOT_SELLER] }, NOT_SELLER)
}

/** Refuses with 400 on `bdOwners` when the holder rule finds nobody. */
export function assertHeld(holder: RefOwner | null): void {
  if (holder === null) throw invalid({ bdOwners: [NO_OWNER] }, NO_OWNER)
}

/** Rule 3: refuses with 409 on `saleOwners` when the PATCH body changes the SALE
 *  lane of an accepted deal — its people, or (on `salePrimary`) its primary.
 *  Same lane = no refusal. Judge it on a read taken under the deal's row lock,
 *  so an accept landing meanwhile is seen. */
export function assertSaleLaneKept(
  found: Pick<OpportunityRead, 'row' | 'owners'>,
  saleOwners: readonly string[],
  salePrimary?: string,
): void {
  const accepted = found.row.stage !== 'new' || found.row.acceptedById !== null
  if (!accepted) return
  const before = new Set(found.owners.filter((o) => o.role === 'SALE').map((o) => o.id))
  const same = before.size === saleOwners.length && saleOwners.every((id) => before.has(id))
  if (!same) throw conflict(ASSIGN_ONLY, { saleOwners: [ASSIGN_ONLY] })
  if (salePrimary !== undefined && salePrimary !== primaryOf(found.owners)) {
    throw conflict(ASSIGN_ONLY, { salePrimary: [ASSIGN_ONLY] })
  }
}

/** What an owners change leaves, in the door's tx: ONE touch naming who was
 *  given and who was taken off the SALE lane, if anyone was; and whenever the
 *  holder changes, a `handed-over` touch with both ends (the holder chain, as
 *  `opportunity-handover.ts` writes it) and the old holder's open step follows
 *  the new one. `primary` = the primary moved with a stated reason: its own
 *  touch, because a lane with no seller changes primary without changing holder.
 *  Answers the id of the touch it wrote, if any — the occurrence
 *  `announceOwners` (`opportunity-bell.ts`) keys its bell line on. */
export async function recordSaleLane(
  tx: Db,
  { touch, hub }: { touch: TouchService; hub: NotificationHub },
  change: {
    code: string
    /** The deal's name, for the bell line of a step that follows the holder. */
    label: string
    added: readonly RefOwner[]
    removed: readonly RefOwner[]
    from: RefOwner | null
    to: RefOwner | null
    by: RefOwner
    at: Date
    primary?: { from: string | null; to: string; reason: string } | undefined
  },
): Promise<string | undefined> {
  let touchId: string | undefined
  if (change.added.length > 0 || change.removed.length > 0) {
    ;[touchId] = await touch.record(tx, [
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
  const { from, to, primary } = change
  if (primary) {
    await touch.record(tx, [
      {
        subjectCode: change.code,
        subjectKind: 'opportunity',
        kind: 'field-filled',
        by: change.by.name,
        actorId: change.by.id,
        note: NOTE.salePrimary(primary.from, primary.to, primary.reason),
        at: change.at,
      },
    ])
  }
  if (to && from?.id !== to.id) {
    /* `touch.to_role` holds one role: the receiver's first. */
    const role = (await actorRoles(tx, [to.id])).get(to.id)?.[0]
    const [handedId] = await touch.record(tx, [
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
    touchId ??= handedId
  }
  if (from && to && from.id !== to.id) {
    const bell = { hub, actorId: change.by.id, label: change.label }
    await handStepOver(tx, change.code, from.id, to.id, bell)
  }
  return touchId
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
    label: found.row.name,
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

/** A body's SALE lane as `salePrimaryOf` reads it, names and roles resolved. */
export const saleLaneOf = (
  ids: readonly string[],
  names: ReadonlyMap<string, string>,
  roles: ReadonlyMap<string, RoleId[]>,
): LanePerson[] =>
  ids.map((id) => ({ id, name: names.get(id) ?? id, roleIds: roles.get(id) ?? null }))

/** The answer's owners straight off the write: SALE with its primary first
 *  (the read order), then BD. */
export function ownersOfIds(
  body: { saleOwners: readonly string[]; bdOwners: readonly string[] },
  names: ReadonlyMap<string, string>,
  salePrimary: string | null,
): OpportunityOwner[] {
  const lane = (ids: readonly string[], role: 'SALE' | 'BD') =>
    ids.map((id) => ({
      id,
      name: names.get(id) ?? id,
      role,
      primary: role === 'SALE' && id === salePrimary,
    }))
  const sale = lane(body.saleOwners, 'SALE')
  return [
    ...sale.filter((o) => o.primary),
    ...sale.filter((o) => !o.primary),
    ...lane(body.bdOwners, 'BD'),
  ]
}

/** `holderOf` over a body's owner ids, with names and roles resolved first so
 *  it applies its own order, not the body's; ids the actor book does not know
 *  are skipped (their insert dies on the owner foreign key). */
export function holderOfIds(
  body: { saleOwners: readonly string[]; bdOwners: readonly string[] },
  names: ReadonlyMap<string, string>,
  roles: ReadonlyMap<string, RoleId[]>,
  acceptor: RefOwner | null,
  salePrimary: string | null,
): RefOwner | null {
  const lane = (ids: readonly string[], role: 'SALE' | 'BD') =>
    ids.flatMap((id) => {
      const name = names.get(id)
      const primary = role === 'SALE' && id === salePrimary
      return name === undefined ? [] : [{ id, name, role, primary, roleIds: roles.get(id) ?? null }]
    })
  return holderOf([...lane(body.saleOwners, 'SALE'), ...lane(body.bdOwners, 'BD')], acceptor)
}
