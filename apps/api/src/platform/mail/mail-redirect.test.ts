import { describe, expect, it } from 'vitest'
import { createDailyCap, redirectMessage, redirectOn, withRedirect } from './mail-redirect'
import type { MailMessage, MailPort } from './mail.contract'

const base = {
  flow: 'system',
  from: 'a@pv.vn',
  to: ['a@x.com', 'b@y.com'],
  cc: ['c@z.com', 'd@z.com'],
  subject: 'Hello',
  html: '<p>x</p>',
  text: 'x',
} as MailMessage

describe('redirectMessage', () => {
  it('points to the target, empties cc, prefixes the subject with +N past three', () => {
    const out = redirectMessage(base, 'me@pv.vn')
    expect(out.to).toEqual(['me@pv.vn'])
    expect(out.cc).toEqual([])
    expect(out.subject).toBe('[→ a@x.com, b@y.com, c@z.com +1] Hello')
    expect(out.from).toBe(base.from)
  })
})

describe('createDailyCap', () => {
  it('stops at the cap and resets on the next Vietnam day', () => {
    let now = new Date('2026-11-16T10:00:00Z')
    const take = createDailyCap(2, () => now)
    expect([take(), take(), take()]).toEqual([true, true, false])
    now = new Date('2026-11-16T16:59:00Z') // 23:59 in Vietnam, same day
    expect(take()).toBe(false)
    now = new Date('2026-11-16T17:01:00Z') // 00:01 next day in Vietnam
    expect(take()).toBe(true)
  })
})

describe('redirectOn', () => {
  it('is on only for a non-blank target', () => {
    expect(redirectOn({ PV_EMAIL_REDIRECT_TO: '' })).toBe(false)
    expect(redirectOn({ PV_EMAIL_REDIRECT_TO: '  ' })).toBe(false)
    expect(redirectOn({ PV_EMAIL_REDIRECT_TO: 'owner@demo.example' })).toBe(true)
  })
})

describe('withRedirect', () => {
  const recorder = () => {
    const sent: MailMessage[] = []
    const port: MailPort = {
      send: async (message) => {
        sent.push(message)
        return { ok: true as const, providerEmailId: 'p' }
      },
    }
    return { sent, port }
  }

  it('returns the real port untouched when the target is empty', () => {
    const real = recorder()
    expect(withRedirect(real.port, recorder().port, '', 20)).toBe(real.port)
  })

  it('re-addresses to the target, then hands over to the console past the cap', async () => {
    const real = recorder()
    const held = recorder()
    const port = withRedirect(real.port, held.port, 'owner@demo.example', 1)
    await port.send(base, 'k1')
    await port.send(base, 'k2')
    expect(real.sent.map((m) => m.to)).toEqual([['owner@demo.example']])
    expect(held.sent).toHaveLength(1)
    expect(held.sent[0]?.to).toEqual(base.to)
  })
})
