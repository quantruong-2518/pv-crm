import type { Permission } from '@pv/engines'

/** Modules parked for now — Sales module 4 (contracts) and module 5 (plan).
 *
 *  The screens stay in the tree; only the doors close. ONE list, three readers:
 *  `routes.tsx` sends the path home, `chrome.tsx` drops the nav entry, and
 *  `auth/can.ts` makes `useCan` say no — so every button, desk card and work
 *  queue behind a parked module goes dark at once instead of each screen
 *  remembering to check.
 *
 *  Parking by PERMISSION, not by path, is what buys that: the permission is the
 *  one key the nav table and the route table both already carry, and it is what
 *  `data/home.ts` gates its cards on. Unparking is deleting a line. */
const PARKED = new Set<Permission>([
  'contract.view',
  'contract.edit',
  'contract.record-payment',
  'plan.view',
  'plan.submit',
])

export const isParked = (permission?: Permission) =>
  permission !== undefined && PARKED.has(permission)
