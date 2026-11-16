// @vitest-environment node
import 'reflect-metadata'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GoogleCalendar } from './google-calendar.client'
import type { GoogleAccess } from './google-access'
import type { Env } from '../config/env'

vi.mock('./google-access', () => ({ GoogleAccess: class {} }))
vi.mock('./google-oauth.client', () => ({ GOOGLE_TIMEOUT_MS: 8_000 }))

/** `put` against a stubbed `fetch`: the event id a retry sends is the caller's
 *  stable one, so an insert Google already took is patched, never duplicated. */
const STABLE = 'pv0b9c7a4e3f1d4c2a9e8b5a6d7c8e9f01'
const EVENT = {
  summary: 'Chốt báo giá',
  start: new Date('2026-10-22T02:00:00Z'),
  end: new Date('2026-10-22T03:00:00Z'),
  attendees: ['khach@example.com'],
}
const access = { tokenFor: async () => ({ state: 'ok', token: 't', email: 'a@b.vn' }) }
const calendarFor = (redirectTo: string) =>
  new GoogleCalendar(
    access as unknown as GoogleAccess,
    {
      PV_EMAIL_REDIRECT_TO: redirectTo,
    } as Env,
  )
const calendar = calendarFor('')
const reply = (status: number) =>
  new Response(
    status < 300 ? JSON.stringify({ id: STABLE, htmlLink: 'https://calendar.google.com/e' }) : '{}',
    { status },
  )

type Call = { url: string; method: string; body: Record<string, unknown> }
const stub = (...statuses: number[]): Call[] => {
  const calls: Call[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, method: String(init.method), body: JSON.parse(String(init.body)) })
      return reply(statuses[calls.length - 1] ?? 500)
    }),
  )
  return calls
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('GoogleCalendar.put', () => {
  it('inserts under the stable id', async () => {
    const calls = stub(200)
    expect(await calendar.put('a1', null, STABLE, EVENT)).toMatchObject({ state: 'synced' })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ method: 'POST', body: { id: STABLE } })
  })

  it('patches the stable id back to confirmed when the insert says 409', async () => {
    const calls = stub(409, 200)
    const outcome = await calendar.put('a1', null, STABLE, EVENT)
    expect(outcome).toMatchObject({ state: 'synced', eventId: STABLE })
    expect(calls.map((c) => c.method)).toEqual(['POST', 'PATCH'])
    expect(calls[1]?.url).toContain(`/events/${STABLE}?`)
    expect(calls[1]?.body).toMatchObject({ status: 'confirmed', summary: EVENT.summary })
    expect(calls[1]?.body).not.toHaveProperty('id')
  })

  it('re-inserts a stored event Google lost under the stable id, never a new one', async () => {
    const calls = stub(410, 409, 200)
    expect(await calendar.put('a1', 'legacy123', STABLE, EVENT)).toMatchObject({
      state: 'synced',
    })
    expect(calls.map((c) => c.method)).toEqual(['PATCH', 'POST', 'PATCH'])
    expect(calls[0]?.url).toContain('/events/legacy123?')
    expect(calls[1]?.body).toMatchObject({ id: STABLE })
    expect(calls[2]?.url).toContain(`/events/${STABLE}?`)
  })

  it('reports a refused insert as failed', async () => {
    stub(500)
    expect(await calendar.put('a1', null, STABLE, EVENT)).toEqual({ state: 'failed' })
  })
})

describe('sendUpdates', () => {
  const urls = async (redirectTo: string): Promise<string[]> => {
    const seen: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        seen.push(url)
        return reply(200)
      }),
    )
    const target = calendarFor(redirectTo)
    await target.put('a1', null, STABLE, EVENT)
    await target.remove('a1', STABLE)
    return seen
  }

  it('mails the guests while the redirect is off', async () => {
    const seen = await urls('')
    expect(seen).toHaveLength(2)
    expect(seen.every((u) => u.includes('sendUpdates=all'))).toBe(true)
  })

  it('tells Google to mail nobody while the redirect is on', async () => {
    const seen = await urls('owner@demo.example')
    expect(seen).toHaveLength(2)
    expect(seen.every((u) => u.includes('sendUpdates=none'))).toBe(true)
  })
})
