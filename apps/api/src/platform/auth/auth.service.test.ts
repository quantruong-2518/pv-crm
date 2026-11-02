// @vitest-environment node
import 'reflect-metadata'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sql } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/pglite/migrator'
import type { PgliteDatabase } from 'drizzle-orm/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Env } from '../config/env'
import { createDb, type Db } from '../db/create-db'
import { RolePermissionRepository } from '../roles/role-permission.repository'
import type { SettingService } from '../setting/setting.service'
import { AuthRepository } from './auth.repository'
import { AuthService } from './auth.service'

/** Forgot-password serves somebody who already has a password. A ticket for a
 *  never-activated account would do an invite's job with no administrator. */

const FOLDER = resolve(dirname(fileURLToPath(import.meta.url)), '../../../drizzle')

let db: Db
let close: () => Promise<void>
let repo: AuthRepository
let auth: AuthService
const letters: string[] = []

const mailOf = (id: string) => `${id}@pv.test`

const seat = (id: string) =>
  db.execute(sql`INSERT INTO platform.actor (id, name, email, role, role_ids)
    VALUES (${id}, ${id}, ${mailOf(id)}, 'sale', ARRAY['sale'])`)

const ticketsOf = async (id: string) =>
  (
    await db.execute(sql`SELECT purpose FROM platform.password_reset WHERE actor_id = ${id}`)
  ).rows.map((r) => (r as { purpose: string }).purpose)

/** How many presses this address gets before the 429. */
const pressesBeforeThrottle = async (email: string): Promise<number> => {
  for (let press = 1; press <= 10; press++) {
    try {
      await auth.forgotPassword(email)
    } catch {
      return press
    }
  }
  throw new Error('the throttle never fired')
}

beforeAll(async () => {
  const handle = await createDb('pglite://memory')
  db = handle.db
  close = handle.close
  await migrate(db as unknown as PgliteDatabase, { migrationsFolder: FOLDER })
  repo = new AuthRepository(db)
  const mailer = {
    send: async (issued: { email: string }) => {
      letters.push(issued.email)
    },
  }
  const env = { PV_EMAIL_ENABLED: false, PV_APP_URL: 'http://pv.test' } as Env
  auth = new AuthService(repo, env, mailer, new RolePermissionRepository(db), {} as SettingService)
}, 120_000)

afterAll(async () => close?.())

beforeEach(() => {
  letters.length = 0
})

describe('forgotPassword', () => {
  it('sends a never-activated account nothing, and answers as usual', async () => {
    await seat('u-never-activated')

    await expect(auth.forgotPassword(mailOf('u-never-activated'))).resolves.toBeUndefined()

    expect(await ticketsOf('u-never-activated')).toEqual([])
    expect(letters).toEqual([])
  })

  it('keeps self-service for a person who set a password', async () => {
    await seat('u-activated')
    await repo.setPasswordHash('u-activated', 'a-password-only-they-know', db)

    await auth.forgotPassword(mailOf('u-activated'))

    expect(await ticketsOf('u-activated')).toEqual(['reset'])
    expect(letters).toEqual([mailOf('u-activated')])
  })

  it('keeps self-service for a person on the default password', async () => {
    await seat('u-on-default')
    await auth.handDefaultPassword({ id: 'u-on-default', email: mailOf('u-on-default') }, db)

    await auth.forgotPassword(mailOf('u-on-default'))

    expect(await ticketsOf('u-on-default')).toEqual(['reset'])
    expect(letters).toEqual([mailOf('u-on-default')])
  })

  it('throttles a never-activated mailbox on the same press as an unknown one', async () => {
    await seat('u-throttled')

    expect(await pressesBeforeThrottle(mailOf('u-throttled'))).toBe(
      await pressesBeforeThrottle('nobody@pv.test'),
    )
  })
})
