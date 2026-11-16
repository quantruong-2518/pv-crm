// @vitest-environment node
import 'reflect-metadata'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sql } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/pglite/migrator'
import type { PgliteDatabase } from 'drizzle-orm/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadEnv } from '../config/env'
import { createDb, type Db } from '../db/create-db'
import { MailRepository } from '../mail/mail.repository'
import type { DeliveryToSend, MailFailure } from '../mail/mail.contract'
import { MailConsumer } from './mail.consumer'

/** A give-up bans the address only when mail is NOT redirected: with the redirect on,
 *  the provider rejected the target mailbox, so blaming the original recipient is wrong. */

const FOLDER = resolve(dirname(fileURLToPath(import.meta.url)), '../../../drizzle')
const failure: MailFailure = {
  kind: 'permanent',
  code: 'rejected',
  summary: 'x',
  blamesRecipient: true,
}

let db: Db
let close: () => Promise<void>

const giveUp = (redirectTo: string, recipient: string) => {
  const env = loadEnv({ DATABASE_URL: 'pglite://memory', PV_EMAIL_REDIRECT_TO: redirectTo })
  const consumer = new MailConsumer(
    env,
    new MailRepository(db),
    null as never,
    [],
    null as never,
    null as never,
    [],
    db,
    null as never,
  )
  const delivery = { recipient, role: 'recipient', mailRunId: 'run-1', addresses: [] }
  return (
    consumer as unknown as {
      gaveUp(d: DeliveryToSend, f: MailFailure, unknown: boolean): Promise<void>
    }
  ).gaveUp(delivery as unknown as DeliveryToSend, failure, false)
}

const suppressed = async (recipient: string) =>
  Number(
    (
      await db.execute(
        sql`SELECT count(*)::int AS n FROM platform.email_suppression WHERE recipient = ${recipient}`,
      )
    ).rows[0]?.n,
  )

beforeAll(async () => {
  const handle = await createDb('pglite://memory')
  db = handle.db
  close = handle.close
  await migrate(db as unknown as PgliteDatabase, { migrationsFolder: FOLDER })
}, 120_000)
afterAll(async () => close())

describe('MailConsumer give-up and the send_failed suppression', () => {
  it('redirect off: the named recipient is suppressed', async () => {
    await giveUp('', 'off@demo.example')
    expect(await suppressed('off@demo.example')).toBe(1)
  })

  it('redirect on: no suppression row is written', async () => {
    await giveUp('owner@demo.example', 'on@demo.example')
    expect(await suppressed('on@demo.example')).toBe(0)
  })
})
