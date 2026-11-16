import { describe, expect, it } from 'vitest'
import { loadEnv } from './env'

const base = { DATABASE_URL: 'pglite://memory' }

describe('mail redirect env', () => {
  it('defaults to off with a cap of 20', () => {
    const env = loadEnv(base)
    expect(env.PV_EMAIL_REDIRECT_TO).toBe('')
    expect(env.PV_EMAIL_REDIRECT_DAILY_CAP).toBe(20)
  })

  it('accepts an empty target and an empty cap (a bare KEY= line)', () => {
    const env = loadEnv({ ...base, PV_EMAIL_REDIRECT_TO: '', PV_EMAIL_REDIRECT_DAILY_CAP: '' })
    expect(env.PV_EMAIL_REDIRECT_TO).toBe('')
    expect(env.PV_EMAIL_REDIRECT_DAILY_CAP).toBe(20)
  })

  it('treats a whitespace-only cap like an empty one', () => {
    expect(
      loadEnv({ ...base, PV_EMAIL_REDIRECT_DAILY_CAP: '  ' }).PV_EMAIL_REDIRECT_DAILY_CAP,
    ).toBe(20)
  })

  it('takes one valid address, trimmed, and a numeric cap', () => {
    const env = loadEnv({
      ...base,
      PV_EMAIL_REDIRECT_TO: ' owner@demo.example ',
      PV_EMAIL_REDIRECT_DAILY_CAP: '5',
    })
    expect(env.PV_EMAIL_REDIRECT_TO).toBe('owner@demo.example')
    expect(env.PV_EMAIL_REDIRECT_DAILY_CAP).toBe(5)
  })

  it('refuses boot on a malformed target, naming the variable', () => {
    for (const bad of ['owner', 'a@b.example, c@d.example', 'Owner <owner@demo.example>']) {
      expect(() => loadEnv({ ...base, PV_EMAIL_REDIRECT_TO: bad })).toThrow(
        /PV_EMAIL_REDIRECT_TO: must be empty or one email address/,
      )
    }
  })

  it('still refuses a garbage or zero cap', () => {
    for (const bad of ['abc', '0', '1.5']) {
      expect(() => loadEnv({ ...base, PV_EMAIL_REDIRECT_DAILY_CAP: bad })).toThrow(
        /PV_EMAIL_REDIRECT_DAILY_CAP/,
      )
    }
  })
})
