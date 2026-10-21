import type { Actor, RoleId } from '@pv/engines'
import type { RefOwner } from '../opportunity/opportunity.mapper'
import { denied } from '@api/platform/http/problem'

/** Who may write a signed contract (ADR 0110 §2): its closer (`owner_id`), the
 *  head of sales or the director. ONE copy, asked by every contract write door
 *  and by the journey's and the profile's `canEdit`, so a button and the door
 *  behind it never disagree. */

const OVER_EVERY_CONTRACT: readonly RoleId[] = ['director', 'head-of-sales']

export const mayWriteContract = (who: Actor, ownerId: string | null): boolean =>
  (ownerId !== null && who.id === ownerId) ||
  who.roleIds.some((r) => OVER_EVERY_CONTRACT.includes(r))

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
