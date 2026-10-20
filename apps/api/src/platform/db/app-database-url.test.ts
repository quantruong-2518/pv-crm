// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { appDatabaseUrl } from './create-db'

const env = { DATABASE_URL: 'postgres://api', PV_WORKER_DATABASE_URL: 'postgres://worker' }

describe('appDatabaseUrl', () => {
  it('gives the worker its own URL when one is set', () => {
    expect(appDatabaseUrl(env, 'worker')).toBe('postgres://worker')
  })

  it('keeps the API and one-off scripts on DATABASE_URL', () => {
    expect(appDatabaseUrl(env, 'api')).toBe('postgres://api')
    expect(appDatabaseUrl(env, undefined)).toBe('postgres://api')
  })

  it('falls back to DATABASE_URL for a worker with no URL of its own', () => {
    expect(appDatabaseUrl({ ...env, PV_WORKER_DATABASE_URL: '' }, 'worker')).toBe('postgres://api')
  })
})
