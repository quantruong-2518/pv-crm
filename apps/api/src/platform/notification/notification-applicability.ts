import {
  NOTIFICATION_KIND_SUBJECTS,
  NOTIFICATION_SUBJECT_PERMISSION,
  RoleId,
  type NotificationKind,
} from '@pv/contracts'
import type { Permission } from '@pv/engines'

/** Live grants per role, as `RolePermissionRepository.allGrants` reads them. */
export type Grants = Map<RoleId, Permission[]>

/** ADR 0093 §2, shared by the admin grid's "not applicable" cells and the
 *  hub's mute filter so both read one rule. A role is out only when EVERY
 *  subject of the kind is gated and it lacks that gate; one open or ungated
 *  subject keeps it in. Every role is walked, since a role holding nothing
 *  has no grant rows at all. */
export function inapplicableRoles(kind: NotificationKind, grants: Grants): RoleId[] {
  const gates = NOTIFICATION_KIND_SUBJECTS[kind].map((s) => NOTIFICATION_SUBJECT_PERMISSION[s])
  return RoleId.options.filter((id) => {
    const held = grants.get(id) ?? []
    return gates.every((gate) => gate !== null && !held.includes(gate))
  })
}
