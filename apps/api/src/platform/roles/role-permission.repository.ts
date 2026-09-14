import { and, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import { PERMISSIONS, type Permission, type RoleId } from '@pv/engines'
import { DB, type Db } from '../db/db.module'
import { actor } from '../db/platform.schema'
import { permissionSeed, rolePermission } from './role.schema'

/** The only place with SQL for the role matrix. Decides nothing — the rules
 *  about who may change what live in `roles.service.ts`. */
@Injectable()
export class RolePermissionRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** What one role may do.
   *
   *  On the authentication path, so it runs on every request that carries a
   *  session — a second round trip next to the one that loads the actor. That
   *  cost is deliberate and it buys freshness: an administrator's change takes
   *  effect on the next request, with no cache to invalidate and no window in
   *  which two server instances disagree about who may do what.
   *
   *  The cheaper shape is a correlated `array()` sub-select folded into the
   *  actor query. It is worth doing the day this shows up in a trace; it is not
   *  worth doing before, because it has to be repeated in every query that
   *  builds an `Actor` and each copy is a place to forget it. */
  async grantsFor(roleId: RoleId, tx: Db = this.db): Promise<Permission[]> {
    const rows = await tx
      .select({ permission: rolePermission.permission })
      .from(rolePermission)
      .where(eq(rolePermission.roleId, roleId))
    return rows.map((r) => r.permission)
  }

  /** Every grant, as a map. One query for the whole matrix — the admin screen
   *  needs all seven rows at once, and seven queries for seven rows is the
   *  shape that turns into seventy. */
  async allGrants(tx: Db = this.db): Promise<Map<RoleId, Permission[]>> {
    const rows = await tx
      .select({ roleId: rolePermission.roleId, permission: rolePermission.permission })
      .from(rolePermission)
    const out = new Map<RoleId, Permission[]>()
    for (const r of rows) {
      const list = out.get(r.roleId)
      if (list) list.push(r.permission)
      else out.set(r.roleId, [r.permission])
    }
    return out
  }

  /** Overwrite one role's grants. Delete-then-insert inside the caller's
   *  transaction, because the pair has to be atomic: a reader landing between
   *  the two halves would see a role with no permissions at all, and on the
   *  authentication path that reader is somebody being told they may do
   *  nothing. */
  async replace(
    tx: Db,
    roleId: RoleId,
    permissions: readonly Permission[],
    grantedBy: string,
  ): Promise<void> {
    await tx.delete(rolePermission).where(eq(rolePermission.roleId, roleId))
    if (permissions.length === 0) return
    await tx
      .insert(rolePermission)
      .values(permissions.map((permission) => ({ roleId, permission, grantedBy })))
  }

  /** Is there anybody still ABLE to use a permission — someone holding one of
   *  these roles whose account is not locked?
   *
   *  Both halves matter. A role that holds the keys but nobody occupies leaves
   *  the door shut; so does a role held only by locked accounts. */
  async anyEnabledActorIn(roles: readonly RoleId[], tx: Db = this.db): Promise<boolean> {
    if (roles.length === 0) return false
    const [row] = await tx
      .select({ id: actor.id })
      .from(actor)
      .where(and(inArray(actor.roleId, [...roles]), isNull(actor.disabledAt)))
      .limit(1)
    return row !== undefined
  }

  // -------------------------------------------------------------------------
  // Seeding — see `role-permission.seeder.ts` for the argument
  // -------------------------------------------------------------------------

  async seededPermissions(tx: Db = this.db): Promise<Set<Permission>> {
    const rows = await tx.select({ permission: permissionSeed.permission }).from(permissionSeed)
    return new Set(rows.map((r) => r.permission))
  }

  async plant(
    tx: Db,
    grants: readonly { roleId: RoleId; permission: Permission }[],
    permissions: readonly Permission[],
  ): Promise<void> {
    if (grants.length > 0) {
      await tx.insert(rolePermission).values([...grants]).onConflictDoNothing()
    }
    if (permissions.length > 0) {
      await tx
        .insert(permissionSeed)
        .values(permissions.map((permission) => ({ permission })))
        .onConflictDoNothing()
    }
  }

  /** Forget permissions that no longer exist in code.
   *
   *  A key deleted from `PERMISSIONS` leaves rows behind that no `@Need` will
   *  ever ask about, and they would come back to life under the old name the
   *  day somebody reuses it. Cleared on every boot rather than by a migration,
   *  because the list of valid keys is a fact about the running build. */
  async forgetUnknown(tx: Db = this.db): Promise<number> {
    const known = [...PERMISSIONS]
    const gone = await tx
      .delete(rolePermission)
      .where(notInArray(rolePermission.permission, known))
      .returning({ permission: rolePermission.permission })
    await tx.delete(permissionSeed).where(notInArray(permissionSeed.permission, known))
    return gone.length
  }

  /** Roles that currently hold a permission. Reads the table rather than the
   *  seed constant — the whole point of this feature is that the two drift. */
  async rolesHolding(permission: Permission, tx: Db = this.db): Promise<RoleId[]> {
    const rows = await tx
      .select({ roleId: rolePermission.roleId })
      .from(rolePermission)
      .where(eq(rolePermission.permission, permission))
    return rows.map((r) => r.roleId)
  }

  /** Count of grants, for the boot log. `sql` and not `rows.length`: counting
   *  in Node means shipping every row across the wire to throw them away. */
  async grantCount(tx: Db = this.db): Promise<number> {
    const [row] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(rolePermission)
    return row?.n ?? 0
  }
}
