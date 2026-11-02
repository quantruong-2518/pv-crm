// @vitest-environment node
import 'reflect-metadata'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AiReadQuery } from '@pv/contracts'
import { createAccessControl, DEFAULT_ROLE_PERMISSIONS, type Actor, type RoleId } from '@pv/engines'
import { eq, inArray, sql } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/pglite/migrator'
import type { PgliteDatabase } from 'drizzle-orm/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccessGuard } from '../access/access.guard'
import type { Env } from '../config/env'
import { createDb, type Db } from '../db/create-db'
import { audit } from '../db/platform.schema'
import { zod } from '../http/zod.pipe'
import { NotificationSweeper } from '../notification/notification.sweeper'
import type { NotificationRepository } from '../notification/notification.repository'
import { AuditController } from './audit.controller'
import { AuditRepository } from './audit.repository'

/** The read door and the purge on real migrations and in-memory PGlite. The gate
 *  asks `AccessGuard` itself, over the handler's own `@Need`. */

const FOLDER = resolve(dirname(fileURLToPath(import.meta.url)), '../../../drizzle')
const DAY = 24 * 60 * 60_000

const seated = (role: RoleId): Actor => ({
  id: `u-${role}`,
  name: `Name of ${role}`,
  email: `${role}@pv.test`,
  role,
  roleIds: [role],
  permissions: DEFAULT_ROLE_PERMISSIONS[role],
  branches: ['Sales'],
})
const director = seated('director')
const headOfSales = seated('head-of-sales')
const executive = seated('account-executive')

let db: Db
let close: () => Promise<void>
let repo: AuditRepository
let controller: AuditController

const monthsAgo = (months: number, days = 0): Date => {
  const at = new Date()
  at.setUTCMonth(at.getUTCMonth() - months)
  return new Date(at.getTime() + days * DAY)
}

const line = (
  at: Date,
  over: Partial<typeof audit.$inferInsert> = {},
): typeof audit.$inferInsert => ({
  at,
  actorId: director.id,
  action: 'ai-read',
  code: 'LD-0001',
  note: 'lead.ai-fill job-1 · 3 field(s) wanted',
  ...over,
})

const gateFor = (who: Actor) => {
  const guard = new AccessGuard(new Reflector(), createAccessControl(), repo)
  return guard.canActivate({
    getHandler: () => AuditController.prototype.aiReads,
    getClass: () => AuditController,
    switchToHttp: () => ({
      getRequest: () => ({ actor: who, method: 'GET', url: '/audit/ai-reads' }),
    }),
  } as unknown as ExecutionContext)
}

const read = (query: Record<string, string>, who: Actor = director) =>
  controller.aiReads(who, zod(AiReadQuery).transform(query))

beforeAll(async () => {
  const handle = await createDb('pglite://memory')
  db = handle.db
  close = handle.close
  await migrate(db as unknown as PgliteDatabase, { migrationsFolder: FOLDER })
  for (const who of [director, headOfSales, executive]) {
    await db.execute(sql`INSERT INTO platform.actor (id, name, email, role, role_ids)
      VALUES (${who.id}, ${who.name}, ${who.email}, ${who.role},
        ${sql.raw(`ARRAY['${who.roleIds[0]}']`)})`)
  }
  repo = new AuditRepository(db)
  controller = new AuditController(repo)
}, 120_000)

afterAll(async () => close?.())

beforeEach(async () => {
  await db.delete(audit)
})

describe('GET /audit/ai-reads gate', () => {
  it('lets the two readers through', async () => {
    await expect(gateFor(director)).resolves.toBe(true)
    await expect(gateFor(headOfSales)).resolves.toBe(true)
  })

  it('refuses an account executive with 403 and a blocked-view line, not an ai-read', async () => {
    await expect(gateFor(executive)).rejects.toMatchObject({ status: 403 })
    const lines = await db.select().from(audit)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ actorId: executive.id, action: 'view', code: null })
  })
})

describe('the list', () => {
  const NOW = Date.now()

  it('returns ai-read rows only, newest first, with the actor name and hidden 0', async () => {
    await db
      .insert(audit)
      .values([
        line(new Date(NOW - 2 * DAY), { code: 'LD-0002', actorId: headOfSales.id }),
        line(new Date(NOW - DAY)),
        line(new Date(NOW), { action: 'edit' }),
        line(new Date(NOW), { action: 'view', code: null, note: 'chặn GET /audit/ai-reads' }),
      ])
    const page = await read({})
    expect(page.total).toBe(2)
    expect(page.hidden).toBe(0)
    expect(page.rows.map((r) => r.code)).toEqual(['LD-0001', 'LD-0002'])
    expect(page.rows[1]).toMatchObject({
      actorId: headOfSales.id,
      actorName: headOfSales.name,
      note: 'lead.ai-fill job-1 · 3 field(s) wanted',
    })
    expect(page.rows[0]!.at).toBe(new Date(NOW - DAY).toISOString())
  })

  it('breaks a tie on `at` by id, so paging neither repeats nor skips', async () => {
    const at = new Date(NOW)
    await db.insert(audit).values([line(at), line(at), line(at)])
    const [first, second] = [await read({ size: '2' }), await read({ size: '2', page: '2' })]
    const ids = [...first.rows, ...second.rows].map((r) => r.id)
    expect(ids).toEqual([...ids].sort().reverse())
    expect(new Set(ids).size).toBe(3)
  })

  it('filters by actor and by code, and counts the filtered total across pages', async () => {
    await db
      .insert(audit)
      .values([
        line(new Date(NOW - 3 * DAY)),
        line(new Date(NOW - 2 * DAY)),
        line(new Date(NOW - DAY), { code: 'SCN-2611-01' }),
        line(new Date(NOW), { actorId: headOfSales.id }),
      ])

    expect((await read({ actorId: headOfSales.id })).total).toBe(1)
    const byCode = await read({ code: 'SCN-2611-01' })
    expect(byCode.rows.map((r) => r.code)).toEqual(['SCN-2611-01'])

    const both = await read({ actorId: director.id, code: 'LD-0001', size: '1', page: '2' })
    expect(both.total).toBe(2)
    expect(both.rows.map((r) => r.at)).toEqual([new Date(NOW - 3 * DAY).toISOString()])
  })

  it('answers a code-less line and a missing account with nulls', async () => {
    await db.insert(audit).values(line(new Date(NOW), { actorId: 'u-gone', code: null }))
    expect((await read({})).rows[0]).toMatchObject({
      actorId: 'u-gone',
      actorName: null,
      code: null,
    })
  })
})

describe('the scope', () => {
  const NOW = Date.now()
  const ownOnly: Actor = { ...headOfSales, ownOnly: true }
  const seedTwoReaders = () =>
    db
      .insert(audit)
      .values([
        line(new Date(NOW - 2 * DAY), { code: 'LD-0042', actorId: director.id }),
        line(new Date(NOW - DAY), { code: 'LD-0007', actorId: headOfSales.id }),
        line(new Date(NOW), { code: 'LD-0042', actorId: executive.id }),
      ])

  it('holds an own-only reader to their own lines', async () => {
    await seedTwoReaders()
    const page = await read({}, ownOnly)
    expect(page.total).toBe(1)
    expect(page.rows.map((r) => [r.actorId, r.code])).toEqual([[headOfSales.id, 'LD-0007']])
  })

  it('answers a query naming another actor with the reader own lines only', async () => {
    await seedTwoReaders()
    const page = await read({ actorId: director.id }, ownOnly)
    expect(page.total).toBe(1)
    expect(page.rows.map((r) => r.actorId)).toEqual([headOfSales.id])
  })

  it('tells an own-only reader nothing about a code others read, not even a count', async () => {
    await seedTwoReaders()
    expect(await read({ code: 'LD-0042' }, ownOnly)).toEqual({ rows: [], total: 0, hidden: 0 })
  })

  it('leaves a whole-book reader unchanged, with or without an explicit false', async () => {
    await seedTwoReaders()
    for (const who of [headOfSales, { ...headOfSales, ownOnly: false }]) {
      expect((await read({}, who)).total).toBe(3)
      const named = await read({ actorId: director.id }, who)
      expect(named.rows.map((r) => r.actorId)).toEqual([director.id])
      expect((await read({ code: 'LD-0042' }, who)).total).toBe(2)
    }
  })
})

describe('the purge', () => {
  const removedOf = async (ids: readonly string[]) =>
    ids.length -
    (
      await db
        .select()
        .from(audit)
        .where(inArray(audit.id, [...ids]))
    ).length

  it('removes ai-read rows past 12 calendar months and nothing else', async () => {
    const rows = await db
      .insert(audit)
      .values([
        line(monthsAgo(13)),
        line(monthsAgo(12, -1)),
        line(monthsAgo(12, 1)),
        line(monthsAgo(1)),
        line(monthsAgo(13), { action: 'edit' }),
        line(monthsAgo(13), { action: 'view' }),
        line(monthsAgo(13), { action: 'transfer' }),
      ])
      .returning({ id: audit.id, at: audit.at, action: audit.action })

    expect(await repo.purgeAiReads(12)).toBe(2)
    expect(await removedOf(rows.slice(0, 2).map((r) => r.id))).toBe(2)
    expect(await removedOf(rows.slice(2).map((r) => r.id))).toBe(0)
  })

  it('is what the sweeper runs, and a failing bell purge does not stop it', async () => {
    const [old] = await db
      .insert(audit)
      .values(line(monthsAgo(13)))
      .returning({ id: audit.id })
    const bell = { purgeReadBefore: vi.fn().mockRejectedValue(new Error('bell table')) }
    const sweeper = new NotificationSweeper(bell as unknown as NotificationRepository, repo, {
      NODE_ENV: 'development',
    } as Env)

    vi.stubEnv('PV_ROLE', 'worker')
    sweeper.onApplicationBootstrap()
    vi.unstubAllEnvs()
    await vi.waitFor(async () => {
      expect(await db.select().from(audit).where(eq(audit.id, old!.id))).toHaveLength(0)
    })
    sweeper.onApplicationShutdown()
    expect(bell.purgeReadBefore).toHaveBeenCalledTimes(1)
  })
})
