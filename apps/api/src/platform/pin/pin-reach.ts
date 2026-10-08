import type { Actor } from '@pv/engines'
import type { PinSubject } from '@pv/contracts'

/** THE SEAM BETWEEN A PIN AND THE BOOK IT POINTS INTO.
 *
 *  Pinning asks "of these codes, which exist and sit inside the caller's
 *  book?" — a `sales` read that `platform/` may not import. So the dependency
 *  runs backward, the `MESSAGE_LOGGED_HOOK` way: pins ask through this token,
 *  the Sales branch answers with the books' own scope predicates, and
 *  `app.module.ts` is the one file that names both (`PinModule.withReach`).
 *
 *  Absent and out-of-scope codes both come back missing, so the answer never
 *  tells the caller which of the two a code was. */
export interface PinReach {
  visible(who: Actor, subject: PinSubject, codes: readonly string[]): Promise<string[]>
}

export const PIN_REACH = Symbol('pv.pin.reach')
