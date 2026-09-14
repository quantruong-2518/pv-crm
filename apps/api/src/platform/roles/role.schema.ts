import { primaryKey, text, timestamp } from 'drizzle-orm/pg-core'
import type { Permission, RoleId } from '@pv/engines'
import { actor, platform } from '../db/platform.schema'

/** Axis 2, as data. See `0032_role_permission.sql` for why this is two tables. */

/** One granted pair. Absence is denial — there is deliberately no `granted`
 *  boolean, because a `false` row and a missing row would be two spellings of
 *  the same fact, and two spellings eventually disagree. */
export const rolePermission = platform.table(
  'role_permission',
  {
    roleId: text('role_id').$type<RoleId>().notNull(),
    permission: text('permission').$type<Permission>().notNull(),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    /** Who granted it. `ON DELETE SET NULL`: losing the account that made a
     *  grant must never take the grant down with it — the permission belongs to
     *  the role, not to the person who happened to tick the box. */
    grantedBy: text('granted_by').references(() => actor.id, { onDelete: 'set null' }),
  },
  (t) => [primaryKey({ name: 'role_permission_pk', columns: [t.roleId, t.permission] })],
)

/** Every permission the seeder has ever planted.
 *
 *  Exists so the seeder can tell "never seeded" from "an administrator revoked
 *  it everywhere" — `role_permission` looks identical in both cases, and
 *  without this table every boot would resurrect grants somebody deliberately
 *  removed. */
export const permissionSeed = platform.table('permission_seed', {
  permission: text('permission').$type<Permission>().primaryKey(),
  seededAt: timestamp('seeded_at', { withTimezone: true }).notNull().defaultNow(),
})

export type RolePermissionRow = typeof rolePermission.$inferSelect
