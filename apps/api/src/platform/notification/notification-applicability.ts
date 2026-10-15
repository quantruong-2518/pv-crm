import {
  NOTIFICATION_KIND_SUBJECTS,
  NOTIFICATION_KINDS_RING_WITHOUT_LINK,
  NOTIFICATION_SUBJECT_PERMISSION,
  RoleId,
  type NotificationKind,
  type NotificationSubject,
} from '@pv/contracts'
import type { Branch, Permission } from '@pv/engines'

/** Live grants per role, as `RolePermissionRepository.allGrants` reads them. */
export type Grants = Map<RoleId, Permission[]>

/** ADR 0093 §2, shared by the admin grid's "not applicable" cells and the
 *  hub's mute filter so both read one rule. A role is out only when EVERY
 *  subject of the kind is gated and it lacks that gate; one open or ungated
 *  subject keeps it in. Every role is walked, since a role holding nothing
 *  has no grant rows at all. A kind that rings without its link is never out:
 *  the hub's backstop lets it through, so the admin must be able to mute it. */
export function inapplicableRoles(kind: NotificationKind, grants: Grants): RoleId[] {
  if ((NOTIFICATION_KINDS_RING_WITHOUT_LINK as readonly NotificationKind[]).includes(kind)) {
    return []
  }
  const gates = NOTIFICATION_KIND_SUBJECTS[kind].map((s) => NOTIFICATION_SUBJECT_PERMISSION[s])
  return RoleId.options.filter((id) => {
    const held = grants.get(id) ?? []
    return gates.every((gate) => gate !== null && !held.includes(gate))
  })
}

/** Subjects whose page is a Sales route, so opening one also needs the Sales
 *  license (E2's first question). Keyed on the subject, not the permission,
 *  because the subject's route is what the reader opens. */
const SALES_SUBJECTS: ReadonlySet<NotificationSubject> = new Set<NotificationSubject>([
  'lead',
  'lead-pool',
  'opportunity',
  'lead-scan',
  'mail-run',
  'contract',
  'campaign',
  'kpi-target',
  'lead-batch',
  'opportunity-batch',
  'comm',
])

/** The hub's backstop (ADR 0093 §7): could this reader open the line's link?
 *  Scope is not asked; the emitters re-target lines a reader holds no part of. */
export function opensSubject(
  subject: NotificationSubject,
  reader: { roleIds: readonly RoleId[]; branches: readonly Branch[] },
  grants: Grants,
): boolean {
  const gate = NOTIFICATION_SUBJECT_PERMISSION[subject]
  if (gate === null) return true
  if (SALES_SUBJECTS.has(subject) && !reader.branches.includes('Sales')) return false
  return reader.roleIds.some((r) => grants.get(r)?.includes(gate))
}
