import { sql } from 'drizzle-orm'
import type { Permission } from '@pv/engines'
import type { Db } from './db.module'

/** The advisory lock that serialises every change to WHO CAN ADMINISTER.
 *
 *  ONE lock across TWO tables, and that is the whole point. The invariant it
 *  protects — somebody enabled can still open accounts and still edit the
 *  matrix — cannot be checked in either table alone: `platform.actor` says who
 *  wears which role and who is locked, `platform.role_permission` says which
 *  role holds the keys. Two locks would let a role edit and a person edit pass
 *  each other, each reading a world the other is about to invalidate, and both
 *  concluding correctly that somebody else still holds the keys.
 *
 *  The failure it prevents is not a bad row, it is an unrecoverable product:
 *  no account can administer anything and the only way back in is a hand-typed
 *  UPDATE against production.
 *
 *  Taken BEFORE any row lock by every writer, so there is no ordering to get
 *  wrong — two writers taking row locks in opposite orders is a textbook
 *  deadlock, which Postgres resolves by killing one transaction with a code no
 *  layer of this server translates into an answer.
 *
 *  The price is that administration serialises. It is a staff book and a
 *  seven-row matrix, both edited by hand a few times a week; there is nothing
 *  here to scale. */
const ADMIN_LOCK_SPACE = 61_002

export async function lockAdminSurface(tx: Db): Promise<void> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(CAST(${ADMIN_LOCK_SPACE} AS int), CAST(0 AS int))`,
  )
}

/** The permissions whose last holder must never be removed.
 *
 *  Both can reach the other — `user.manage` edits a person's `roleId`,
 *  `role.manage` edits what a role may do — so losing either one strands the
 *  product just as completely, and both guards have to count both.
 *
 *  Lives here, next to the lock, because the two are halves of one invariant
 *  and they are enforced from two different services. `UsersService` shipped
 *  14/09 checking only `user.manage`, which left an open door: strand
 *  `role.manage` on a role, then offboard its last occupant through the People
 *  screen, and nobody can open the Roles screen again. One list, imported by
 *  both, is what stops the pair drifting a second time. */
export const ADMIN_KEYS = ['user.manage', 'role.manage'] as const satisfies readonly Permission[]
