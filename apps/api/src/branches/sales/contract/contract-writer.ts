import type { AccessControl, Actor, RoleId } from '@pv/engines'
import type { RefOwner } from '../opportunity/opportunity.mapper'
import { denied } from '@api/platform/http/problem'

/** Who may write a signed contract (ADR 0110 §2): its closer (`owner_id`), the
 *  head of sales or the director. ONE copy, asked by every contract write door
 *  and by the journey's and the profile's `canEdit`, so a button and the door
 *  behind it never disagree. Collecting money has its own seat, `mayCollect`:
 *  the payment PIC (`collector_id`) or the same two seats. The closer collects
 *  only when also named PIC; ADR 0110 does not cover the collector. */

const OVER_EVERY_CONTRACT: readonly RoleId[] = ['director', 'head-of-sales']

export const mayWriteContract = (who: Actor, ownerId: string | null): boolean =>
  (ownerId !== null && who.id === ownerId) ||
  who.roleIds.some((r) => OVER_EVERY_CONTRACT.includes(r))

export const mayCollect = (who: Actor, collectorId: string | null): boolean =>
  (collectorId !== null && who.id === collectorId) ||
  who.roleIds.some((r) => OVER_EVERY_CONTRACT.includes(r))

/** The `canCollect` flag every contract read returns, the same three terms as
 *  the deal's `can.recordPayment` (`deal-money.ts`): the seat, the permission
 *  the door demands, and a paper still live. */
export const mayRecordPayment = (
  access: AccessControl,
  who: Actor,
  collectorId: string | null,
  terminated: boolean,
): boolean =>
  !terminated && mayCollect(who, collectorId) && access.allows(who, 'contract.record-payment')

/** Swapping the payment PIC after signing (ADR 0111 §8, owner's call
 *  22/10/2026): the two seats over every contract only, never the closer or
 *  the PIC — the person who leaves is the reason the door exists. */
export const mayChangeCollector = (
  access: AccessControl,
  who: Actor,
  terminated: boolean,
): boolean =>
  !terminated &&
  who.roleIds.some((r) => OVER_EVERY_CONTRACT.includes(r)) &&
  access.allows(who, 'contract.edit')

/** The penalty door's own gate (ADR 0124): its permission, the contract write
 *  seat it asserts, and a paper already terminated — the reverse of the rest. */
export const mayEditPenalty = (
  access: AccessControl,
  who: Actor,
  ownerId: string | null,
  terminated: boolean,
): boolean =>
  terminated && mayWriteContract(who, ownerId) && access.allows(who, 'contract.terminate')

export function assertMayChangeCollector(who: Actor): void {
  if (who.roleIds.some((r) => OVER_EVERY_CONTRACT.includes(r))) return
  throw denied('permission-denied', 'Chỉ trưởng phòng hoặc giám đốc được đổi người thu tiền.')
}

/** `markPaid` and `undoPaid` ask this instead of `assertMayWriteContract`. */
export function assertMayCollect(who: Actor, collectorId: string | null): void {
  if (mayCollect(who, collectorId)) return
  throw denied(
    'permission-denied',
    'Chỉ người thu tiền của hợp đồng, trưởng phòng hoặc giám đốc được ghi thu.',
  )
}

/** The refusal every write door throws, asked AFTER its permission and scope
 *  fences: past those the reader may see the contract, so 403 leaks nothing. */
export function assertMayWriteContract(who: Actor, ownerId: string | null): void {
  if (mayWriteContract(who, ownerId)) return
  throw denied(
    'permission-denied',
    'Chỉ người chốt hợp đồng, trưởng phòng hoặc giám đốc được sửa hợp đồng này.',
  )
}

/** Who a deal edit writes as a contract's closer: nobody, unless the paper is
 *  a live legacy one with no closer, which then adopts the deal's holder. A
 *  closer off the deal's lane stays (ADR 0110 §1). */
export const closerOnDealEdit = (
  ownerId: string | null,
  terminated: boolean,
  holder: RefOwner | null,
): RefOwner | null => (ownerId === null && !terminated ? holder : null)
