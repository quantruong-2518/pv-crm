// @vitest-environment node
import 'reflect-metadata'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_ROLE_PERMISSIONS, type Actor, type RoleId } from '@pv/engines'
import { eq, sql } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/pglite/migrator'
import type { PgliteDatabase } from 'drizzle-orm/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AuthRepository } from '../auth/auth.repository'
import { AuthService } from '../auth/auth.service'
import type { Env } from '../config/env'
import { createDb, type Db } from '../db/create-db'
import { actor } from '../db/platform.schema'
import type { NotificationHub } from '../notification/notification.hub'
import { RolePermissionRepository } from '../roles/role-permission.repository'
import type { SettingService } from '../setting/setting.service'
import { UsersRepository } from './users.repository'
import { UsersService } from './users.service'

/** The indirect way up: a manager resets a junior, the director promotes the
 *  junior, and the manager signs in on the password they handed out. Real rows on
 *  in-memory PGlite; rule 3's direct refusals stand on `mayAdminister` in engines. */

const FOLDER = resolve(dirname(fileURLToPath(import.meta.url)), '../../../drizzle')

const seated = (role: RoleId): Actor => ({
  id: `u-${role}`,
  name: role,
  email: `${role}@pv.test`,
  role,
  roleIds: [role],
  permissions: DEFAULT_ROLE_PERMISSIONS[role],
  branches: ['Sales'],
})
const director = seated('director')
const headOfSales = seated('head-of-sales')

let db: Db
let close: () => Promise<void>
let users: UsersService
let auth: AuthRepository

const seat = (id: string, role: RoleId) =>
  db.execute(sql`INSERT INTO platform.actor (id, name, email, role, role_ids)
    VALUES (${id}, ${id}, ${`${id}@pv.test`}, ${role}, ARRAY[${role}])`)

const rolesOf = async (id: string) =>
  (await db.select({ roleIds: actor.roleIds }).from(actor).where(eq(actor.id, id)))[0]?.roleIds

beforeAll(async () => {
  const handle = await createDb('pglite://memory')
  db = handle.db
  close = handle.close
  await migrate(db as unknown as PgliteDatabase, { migrationsFolder: FOLDER })
  await seat(director.id, 'director')
  await seat(headOfSales.id, 'head-of-sales')
  const grants = new RolePermissionRepository(db)
  auth = new AuthRepository(db)
  const hub = { announce: async () => undefined } as unknown as NotificationHub
  const mailer = { send: async () => undefined }
  const env = { PV_EMAIL_ENABLED: false } as Env
  const service = new AuthService(auth, env, mailer, grants, {} as SettingService)
  users = new UsersService(new UsersRepository(db), grants, service, hub, env, null)
}, 120_000)

afterAll(async () => close?.())

describe('a temporary password stands', () => {
  it('refuses a promotion until the person has changed it', async () => {
    await seat('u-junior', 'sale')
    await users.resetPassword(headOfSales, 'u-junior')

    await expect(
      users.patch(director, 'u-junior', { roleIds: ['director'] }),
    ).rejects.toMatchObject({
      kind: 'conflict',
      message: 'u-junior phải đổi xong mật khẩu rồi mới gán được vai cao hơn.',
    })
    expect(await rolesOf('u-junior')).toEqual(['sale'])

    await auth.setPasswordHash('u-junior', 'a-password-only-they-know', db)
    await users.patch(director, 'u-junior', { roleIds: ['director'] })
    expect(await rolesOf('u-junior')).toEqual(['director'])
  })

  it('voids an open invitation when a promotion goes through', async () => {
    await seat('u-invited', 'sale')
    await auth.createResetTicket({
      actorId: 'u-invited',
      tokenHash: 'an-open-invitation',
      purpose: 'invite',
      expiresAt: new Date(Date.now() + 60_000),
    })
    const open = () =>
      db.execute(sql`SELECT 1 FROM platform.password_reset
        WHERE actor_id = 'u-invited' AND used_at IS NULL`)
    expect((await open()).rows).toHaveLength(1)

    await users.patch(director, 'u-invited', { roleIds: ['bd'] })

    expect((await open()).rows).toHaveLength(0)
  })

  it('lets through a change that raises nobody', async () => {
    await seat('u-peer', 'bd')
    await users.resetPassword(headOfSales, 'u-peer')

    await users.patch(director, 'u-peer', { roleIds: ['bd', 'sale'] })
    await users.patch(director, 'u-peer', { roleIds: ['sale'] })
    expect(await rolesOf('u-peer')).toEqual(['sale'])
  })
})
