// @vitest-environment node
import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_ROLE_PERMISSIONS, type Actor, type Branch, type RoleId } from '@pv/engines'
import { eq, sql } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/pglite/migrator'
import type { PgliteDatabase } from 'drizzle-orm/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
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
import type { WorkHandover } from './work-handover'

/** The people-book fences on real rows, in-memory PGlite. The direct rank refusals
 *  of rule 3 stand on `mayAdminister` in engines; what is here is what needs a row:
 *  the indirect way up (a junior on the public default, then promoted), who may
 *  lock and hand out a way in, and how far an own-only manager reaches. */

const FOLDER = resolve(dirname(fileURLToPath(import.meta.url)), '../../../drizzle')

const seated = (role: RoleId, over: Partial<Actor> = {}): Actor => ({
  id: `u-${role}`,
  name: role,
  email: `${role}@pv.test`,
  role,
  roleIds: [role],
  permissions: DEFAULT_ROLE_PERMISSIONS[role],
  branches: ['One', 'Sales'],
  ...over,
})
const director = seated('director')
const headOfSales = seated('head-of-sales')
const ownOnlyHead = seated('head-of-sales', { id: 'u-own-head', ownOnly: true })

const NOTHING_HELD = {
  leads: 0,
  opportunities: 0,
  nextSteps: 0,
  switchedOffLeads: 0,
  switchedOffOther: 0,
}

let db: Db
let close: () => Promise<void>
let users: UsersService
let auth: AuthRepository

/* Every reach past the people book a press could make, so a refusal can prove none happened. */
const reached: string[] = []
const handover: WorkHandover = {
  holdings: async (_tx, userId) => {
    reached.push(`holdings:${userId}`)
    return NOTHING_HELD
  },
  vetReceiver: async (toId) => {
    reached.push(`vet:${toId}`)
  },
  handOver: async (_tx, move) => {
    reached.push(`hand-over:${move.fromId}`)
  },
}

const seat = (id: string, role: RoleId, ownOnly = false) =>
  db.execute(sql`INSERT INTO platform.actor (id, name, email, role, role_ids, own_only)
    VALUES (${id}, ${id}, ${`${id}@pv.test`}, ${role}, ARRAY[${role}], ${ownOnly})`)

const lockInTable = (id: string, at: Date) =>
  db.update(actor).set({ disabledAt: at }).where(eq(actor.id, id))

const rowOf = async (id: string) => (await db.select().from(actor).where(eq(actor.id, id)))[0]

const rolesOf = async (id: string) => (await rowOf(id))?.roleIds

const count = async (query: ReturnType<typeof sql>) => Number((await db.execute(query)).rows[0]?.n)

/** Everything a press on this person can leave behind. */
const traces = async (id: string) => ({
  liveSessions: await count(sql`SELECT count(*) AS n FROM platform.session
    WHERE actor_id = ${id} AND revoked_at IS NULL`),
  tickets: await count(sql`SELECT count(*) AS n FROM platform.password_reset
    WHERE actor_id = ${id}`),
  notes: await count(sql`SELECT count(*) AS n FROM platform.audit WHERE code = ${id}`),
})

const openSession = (id: string) =>
  auth.createSession({
    actorId: id,
    tokenHash: randomUUID(),
    expiresAt: new Date(Date.now() + 60_000),
    idleUntil: null,
    reauthAt: new Date(),
    userAgent: null,
  })

beforeAll(async () => {
  const handle = await createDb('pglite://memory')
  db = handle.db
  close = handle.close
  await migrate(db as unknown as PgliteDatabase, { migrationsFolder: FOLDER })
  await seat(director.id, 'director')
  await seat(headOfSales.id, 'head-of-sales')
  await seat(ownOnlyHead.id, 'head-of-sales', true)
  const grants = new RolePermissionRepository(db)
  auth = new AuthRepository(db)
  const hub = {
    announce: async () => {
      reached.push('bell')
    },
  } as unknown as NotificationHub
  const mailer = {
    send: async () => {
      reached.push('mail')
    },
  }
  const env = { PV_EMAIL_ENABLED: false, PV_APP_URL: 'http://pv.test' } as Env
  const service = new AuthService(auth, env, mailer, grants, {} as SettingService)
  users = new UsersService(new UsersRepository(db), grants, service, hub, env, handover)
}, 120_000)

afterAll(async () => close?.())

beforeEach(() => {
  reached.length = 0
})

describe('a temporary password stands', () => {
  it('refuses a promotion until the person has changed it', async () => {
    await seat('u-junior', 'sale')
    await users.resetPassword(director, 'u-junior')

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
    await users.resetPassword(director, 'u-peer')

    await users.patch(director, 'u-peer', { roleIds: ['bd', 'sale'] })
    await users.patch(director, 'u-peer', { roleIds: ['sale'] })
    expect(await rolesOf('u-peer')).toEqual(['sale'])
  })
})

describe('locking and handing out a way in takes the top rank', () => {
  const LOCK_REFUSED = {
    kind: 'forbidden',
    message: 'Chỉ Giám đốc mới khoá hoặc mở khoá được tài khoản.',
  }

  it('refuses a head of sales locking, and the press leaves nothing behind', async () => {
    await seat('u-lock-target', 'sale')
    await seat('u-receiver', 'sale')
    await openSession('u-lock-target')
    const before = await traces('u-lock-target')

    await expect(
      users.patch(headOfSales, 'u-lock-target', { disabled: true, handoverTo: 'u-receiver' }),
    ).rejects.toMatchObject(LOCK_REFUSED)

    expect(await traces('u-lock-target')).toEqual(before)
    expect(before.liveSessions).toBe(1)
    expect((await rowOf('u-lock-target'))?.disabledAt).toBeNull()
    expect(reached).toEqual([])
  })

  it('refuses a head of sales unlocking and re-locking, and the stamp holds', async () => {
    const lockedAt = new Date('2026-10-01T08:00:00Z')
    await seat('u-already-locked', 'sale')
    await lockInTable('u-already-locked', lockedAt)
    const before = await traces('u-already-locked')

    await expect(
      users.patch(headOfSales, 'u-already-locked', { disabled: false }),
    ).rejects.toMatchObject(LOCK_REFUSED)
    await expect(
      users.patch(headOfSales, 'u-already-locked', { disabled: true }),
    ).rejects.toMatchObject(LOCK_REFUSED)

    expect(await traces('u-already-locked')).toEqual(before)
    expect((await rowOf('u-already-locked'))?.disabledAt).toEqual(lockedAt)
    expect(reached).toEqual([])
  })

  it('refuses a lock tucked into an ordinary edit, so the edit is lost with it', async () => {
    await seat('u-mixed', 'sale')

    await expect(
      users.patch(headOfSales, 'u-mixed', { name: 'Tên mới', disabled: true }),
    ).rejects.toMatchObject(LOCK_REFUSED)

    expect((await rowOf('u-mixed'))?.name).toBe('u-mixed')
  })

  it('refuses a head of sales resetting a password, leaving nothing behind', async () => {
    await seat('u-reset-target', 'sale')
    await openSession('u-reset-target')
    const before = await traces('u-reset-target')

    await expect(users.resetPassword(headOfSales, 'u-reset-target')).rejects.toMatchObject({
      kind: 'forbidden',
      message: 'Chỉ Giám đốc mới đặt lại được mật khẩu.',
    })

    expect(await traces('u-reset-target')).toEqual(before)
    expect((await rowOf('u-reset-target'))?.mustChangePasswordAt).toBeNull()
    expect(reached).toEqual([])
  })

  it('refuses a head of sales sending an invite: no ticket, no letter, no note', async () => {
    await seat('u-invite-target', 'sale')
    const before = await traces('u-invite-target')

    await expect(users.invite(headOfSales, 'u-invite-target')).rejects.toMatchObject({
      kind: 'forbidden',
      message: 'Chỉ Giám đốc mới gửi được thư đặt mật khẩu.',
    })

    expect(await traces('u-invite-target')).toEqual(before)
    expect(reached).toEqual([])
  })

  it.each<[string, RoleId]>([
    ['u-peer-director', 'director'],
    ['u-a-head', 'head-of-sales'],
    ['u-a-sale', 'sale'],
  ])('lets a director do all four on %s', async (id, role) => {
    await seat(id, role)

    const invited = await users.invite(director, id)
    expect(invited.link).toContain('/reset-password?token=')

    await users.resetPassword(director, id)
    expect((await rowOf(id))?.mustChangePasswordAt).not.toBeNull()

    await openSession(id)
    await users.patch(director, id, { disabled: true })
    expect((await rowOf(id))?.disabledAt).not.toBeNull()
    expect((await traces(id)).liveSessions).toBe(0)

    await users.patch(director, id, { disabled: false })
    expect((await rowOf(id))?.disabledAt).toBeNull()
  })

  it('still refuses a director on their own password and their own lock', async () => {
    await expect(users.resetPassword(director, director.id)).rejects.toMatchObject({
      kind: 'conflict',
    })
    await expect(users.patch(director, director.id, { disabled: true })).rejects.toMatchObject({
      kind: 'forbidden',
      message: 'Bạn không tự đổi trạng thái khoá của chính mình. Nhờ Giám đốc làm.',
    })
  })

  it('leaves a head of sales opening accounts and editing them, a peer included', async () => {
    const opened = await users.create(headOfSales, {
      name: 'Nhân viên Mới',
      email: 'moi@pv.test',
      role: 'Sale',
      roleIds: ['sale'],
      branches: ['Sales'],
      ownOnly: false,
    })
    await users.patch(headOfSales, opened.id, { name: 'Tên đã sửa', roleIds: ['bd'] })
    expect(await rowOf(opened.id)).toMatchObject({ name: 'Tên đã sửa', roleIds: ['bd'] })

    await seat('u-peer-head', 'head-of-sales')
    await users.patch(headOfSales, 'u-peer-head', { name: 'Trưởng khác' })
    expect((await rowOf('u-peer-head'))?.name).toBe('Trưởng khác')
  })
})

describe('an own-only manager gives nobody a wider scope', () => {
  const SCOPE_REFUSED = {
    kind: 'forbidden',
    message: 'Bạn không có phạm vi Toàn bộ dữ liệu nên không cấp được.',
  }
  const NEW_PERSON = {
    name: 'Người Mới',
    role: 'Sale',
    roleIds: ['sale' as const],
    branches: ['Sales' as const],
  }

  it('refuses moving an own-only person to the whole book', async () => {
    await seat('u-narrow', 'sale', true)

    await expect(users.patch(ownOnlyHead, 'u-narrow', { ownOnly: false })).rejects.toMatchObject(
      SCOPE_REFUSED,
    )

    expect((await rowOf('u-narrow'))?.ownOnly).toBe(true)
  })

  it('refuses opening a whole-book account, and accepts an own-only one', async () => {
    await expect(
      users.create(ownOnlyHead, { ...NEW_PERSON, email: 'rong@pv.test', ownOnly: false }),
    ).rejects.toMatchObject(SCOPE_REFUSED)
    expect(
      await count(sql`SELECT count(*) AS n FROM platform.actor WHERE email = 'rong@pv.test'`),
    ).toBe(0)

    const opened = await users.create(ownOnlyHead, {
      ...NEW_PERSON,
      email: 'hep@pv.test',
      ownOnly: true,
    })
    expect(opened.ownOnly).toBe(true)
  })

  it('lets through a save that widens nobody', async () => {
    await seat('u-whole-book', 'sale')
    await seat('u-still-narrow', 'sale', true)

    await users.patch(ownOnlyHead, 'u-whole-book', { ownOnly: false, name: 'Giữ nguyên' })
    await users.patch(ownOnlyHead, 'u-still-narrow', { name: 'Không đụng phạm vi' })
    await users.patch(ownOnlyHead, 'u-whole-book', { ownOnly: true })

    expect((await rowOf('u-whole-book'))?.ownOnly).toBe(true)
    expect((await rowOf('u-still-narrow'))?.ownOnly).toBe(true)
  })

  it('binds only the own-only caller: a whole-book manager still widens', async () => {
    await seat('u-widened', 'sale', true)

    await users.patch(headOfSales, 'u-widened', { ownOnly: false })

    expect((await rowOf('u-widened'))?.ownOnly).toBe(false)
  })

  it('keeps its own answer for widening yourself', async () => {
    await expect(
      users.patch(ownOnlyHead, ownOnlyHead.id, { ownOnly: false }),
    ).rejects.toMatchObject({
      kind: 'forbidden',
      message: 'Bạn không tự mở rộng phạm vi dữ liệu của chính mình. Nhờ Giám đốc làm.',
    })
  })

  describe('and adds nothing to a whole-book seat', () => {
    const ADDING_REFUSED = {
      kind: 'forbidden',
      message:
        'Bạn không có phạm vi Toàn bộ dữ liệu nên không thêm được vai hoặc nhánh cho người này.',
    }
    const branchesIn = (id: string, branches: Branch[]) =>
      db.update(actor).set({ branches }).where(eq(actor.id, id))

    it('refuses raising it to a rank that could widen the caller back', async () => {
      await seat('u-whole-marketing', 'marketing')

      await expect(
        users.patch(ownOnlyHead, 'u-whole-marketing', { roleIds: ['head-of-sales'] }),
      ).rejects.toMatchObject(ADDING_REFUSED)

      expect(await rolesOf('u-whole-marketing')).toEqual(['marketing'])
    })

    it('compares role sets, not rank: the same rank can still add a permission', async () => {
      await seat('u-whole-same-rank', 'marketing')

      await expect(
        users.patch(ownOnlyHead, 'u-whole-same-rank', { roleIds: ['sale'] }),
      ).rejects.toMatchObject(ADDING_REFUSED)

      expect(await rolesOf('u-whole-same-rank')).toEqual(['marketing'])
    })

    it('refuses a branch it does not hold', async () => {
      await seat('u-whole-core', 'sale')
      await branchesIn('u-whole-core', ['One'])

      await expect(
        users.patch(ownOnlyHead, 'u-whole-core', { branches: ['Sales'] }),
      ).rejects.toMatchObject(ADDING_REFUSED)

      expect((await rowOf('u-whole-core'))?.branches).toEqual(['One'])
    })

    it('counts the scope the save ends on, not the one it starts from', async () => {
      await seat('u-narrowed-and-raised', 'marketing')

      await users.patch(ownOnlyHead, 'u-narrowed-and-raised', { ownOnly: true, roleIds: ['bd'] })

      expect(await rowOf('u-narrowed-and-raised')).toMatchObject({
        ownOnly: true,
        roleIds: ['bd'],
      })
    })

    it('lets through a save that keeps or drops, and any save on an own-only seat', async () => {
      await seat('u-whole-keeps', 'sale')
      await branchesIn('u-whole-keeps', ['One', 'Sales'])
      await seat('u-narrow-raised', 'marketing', true)

      await users.patch(ownOnlyHead, 'u-whole-keeps', { roleIds: ['sale'], branches: ['Sales'] })
      await users.patch(ownOnlyHead, 'u-whole-keeps', { branches: [] })
      await users.patch(ownOnlyHead, 'u-narrow-raised', { roleIds: ['bd'], branches: ['Sales'] })

      expect((await rowOf('u-whole-keeps'))?.branches).toEqual(['One'])
      expect(await rolesOf('u-narrow-raised')).toEqual(['bd'])
    })

    it('binds only the own-only caller', async () => {
      await seat('u-whole-raised', 'marketing')

      await users.patch(headOfSales, 'u-whole-raised', { roleIds: ['sale'], branches: ['Sales'] })

      expect(await rolesOf('u-whole-raised')).toEqual(['sale'])
    })
  })
})
