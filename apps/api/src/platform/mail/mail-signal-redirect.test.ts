// @vitest-environment node
import 'reflect-metadata'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { eq, sql } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/pglite/migrator'
import type { PgliteDatabase } from 'drizzle-orm/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadEnv } from '../config/env'
import { createDb, type Db } from '../db/create-db'
import { MailSignalRepository } from './mail-signal.repository'
import { emailDelivery, emailDeliveryAddress, emailWebhookEvent } from './mail.schema'

/** A bounce or complaint describes the mailbox the provider saw. With the redirect
 *  on that is the target, so no original address may be blamed or suppressed. */

const FOLDER = resolve(dirname(fileURLToPath(import.meta.url)), '../../../drizzle')
const NOW = new Date('2026-11-16T03:00:00Z')

let db: Db
let close: () => Promise<void>
let seq = 0

const repoFor = (redirectTo: string) =>
  new MailSignalRepository(
    db,
    loadEnv({ DATABASE_URL: 'pglite://memory', PV_EMAIL_REDIRECT_TO: redirectTo }),
  )

/** One delivery, optionally with address rows (a group letter). */
const seat = async (withAddresses: boolean) => {
  seq += 1
  const [row] = await db
    .insert(emailDelivery)
    .values({
      eventKey: `ek-${seq}`,
      eventType: 'test',
      aggregateType: 'test',
      aggregateId: `agg-${seq}`,
      template: 't',
      templateVersion: 1,
      recipient: `staff${seq}@demo.example`,
      state: 'accepted',
      providerEmailId: `prov-${seq}`,
      idempotencyKey: `idem-${seq}`,
    })
    .returning({ id: emailDelivery.id, recipient: emailDelivery.recipient })
  if (withAddresses) {
    await db
      .insert(emailDeliveryAddress)
      .values({ deliveryId: row!.id, role: 'to', position: 0, address: row!.recipient })
  }
  return { id: row!.id, providerEmailId: `prov-${seq}`, recipient: row!.recipient }
}

const event = (providerEmailId: string, state: 'bounced' | 'complained') => ({
  svixId: `svix-${++seq}`,
  type: `email.${state}`,
  providerEmailId,
  state,
  at: NOW,
  to: [],
})

const stateOf = async (id: string) =>
  (
    await db.select({ s: emailDelivery.state }).from(emailDelivery).where(eq(emailDelivery.id, id))
  )[0]?.s
const outcomeOf = async (id: string) =>
  (
    await db
      .select({ o: emailDeliveryAddress.outcome })
      .from(emailDeliveryAddress)
      .where(eq(emailDeliveryAddress.deliveryId, id))
  )[0]?.o
const suppressions = async () =>
  Number(
    (await db.execute(sql`SELECT count(*)::int AS n FROM platform.email_suppression`)).rows[0]?.n,
  )

beforeAll(async () => {
  const handle = await createDb('pglite://memory')
  db = handle.db
  close = handle.close
  await migrate(db as unknown as PgliteDatabase, { migrationsFolder: FOLDER })
}, 120_000)
afterAll(async () => close())

describe('applyWebhook while mail is redirected', () => {
  it('redirect off (baseline): a group bounce blames the address', async () => {
    const d = await seat(true)
    const out = await repoFor('').applyWebhook(event(d.providerEmailId, 'bounced'))
    expect(out.attributed).toEqual([d.recipient])
    expect(await outcomeOf(d.id)).toBe('bounced')
  })

  for (const state of ['bounced', 'complained'] as const) {
    it(`redirect on: a ${state} group letter blames nobody but still moves and logs the event`, async () => {
      const d = await seat(true)
      const e = event(d.providerEmailId, state)
      const out = await repoFor('owner@demo.example').applyWebhook(e)
      expect(out.attributed).toEqual([])
      expect(await outcomeOf(d.id)).toBe('queued')
      expect(await stateOf(d.id)).toBe(state)
      const logged = await db
        .select()
        .from(emailWebhookEvent)
        .where(eq(emailWebhookEvent.svixId, e.svixId))
      expect(logged).toHaveLength(1)
    })
  }

  it('redirect on: a plain letter blames nobody; off blames its recipient', async () => {
    const off = await seat(false)
    expect(
      (await repoFor('').applyWebhook(event(off.providerEmailId, 'bounced'))).attributed,
    ).toEqual([off.recipient])
    const on = await seat(false)
    const out = await repoFor('owner@demo.example').applyWebhook(
      event(on.providerEmailId, 'bounced'),
    )
    expect(out.attributed).toEqual([])
    expect(await stateOf(on.id)).toBe('bounced')
  })
})

describe('applyAddressBounce while mail is redirected', () => {
  const bounce = (address: string) => ({ addresses: [address], reason: 'x', at: NOW })

  it('redirect off (baseline): the address row is marked', async () => {
    const d = await seat(true)
    expect(await repoFor('').applyAddressBounce(d.id, bounce(d.recipient))).toBe(1)
    expect(await outcomeOf(d.id)).toBe('bounced')
  })

  it('redirect on: nothing is marked and no suppression row is written', async () => {
    const d = await seat(true)
    const before = await suppressions()
    expect(await repoFor('owner@demo.example').applyAddressBounce(d.id, bounce(d.recipient))).toBe(
      0,
    )
    expect(await outcomeOf(d.id)).toBe('queued')
    expect(await suppressions()).toBe(before)
  })
})
