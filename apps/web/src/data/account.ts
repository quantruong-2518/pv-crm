import type { Permission } from '@pv/engines'
import { isParked } from '@/app/parked'
import { PERMISSION_GROUPS, type PermissionGroup } from '@/data/roles'

/** What the reader may do, in the role screen's own groups and order. A parked
 *  module is left out: the product hides it from everybody, whatever is granted. */
export function grantedGroups(permissions: readonly Permission[]): PermissionGroup[] {
  const held = new Set(permissions)
  return PERMISSION_GROUPS.map((group) => ({
    ...group,
    permissions: group.permissions.filter((p) => held.has(p) && !isParked(p)),
  })).filter((group) => group.permissions.length > 0)
}
