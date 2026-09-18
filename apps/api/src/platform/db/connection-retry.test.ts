// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { connectWithRetry, isConnectionError } from './connection-retry'

/** Neon's quota hard-stop, exactly as the worker logged it before it stopped. */
const quota = Object.assign(
  new Error(
    'Your account or project has exceeded the quota. Upgrade your plan to increase limits.',
  ),
  { code: '53000' },
)
const refused = Object.assign(new Error('connect ECONNREFUSED 10.0.0.1:5432'), {
  code: 'ECONNREFUSED',
})
/** What pg-boss throws for a queue option `updateQueue` rejects — the
 *  deterministic failure that must never hide behind a backoff. */
const badOption = new Error('updateQueue does not accept policy')

const logger = () => ({ warn: vi.fn(), error: vi.fn() })

describe('isConnectionError', () => {
  it.each([
    ['Neon quota hard-stop (53000)', quota],
    ['a refused socket', refused],
    ['a server shutting down (57P01)', Object.assign(new Error('terminating'), { code: '57P01' })],
    ['a connection exception (08006)', Object.assign(new Error('failure'), { code: '08006' })],
    ['pg-pool timing out, no code', new Error('timeout exceeded when trying to connect')],
    ['pg dropping the socket, no code', new Error('Connection terminated unexpectedly')],
  ])('retries %s', (_, error) => {
    expect(isConnectionError(error)).toBe(true)
  })

  it.each([
    ['a rejected queue option', badOption],
    ['an undefined table (42P01)', Object.assign(new Error('no relation'), { code: '42P01' })],
    ['a programming error', new TypeError('instance.start is not a function')],
    ['a thrown string', 'boom'],
  ])('does not retry %s', (_, error) => {
    expect(isConnectionError(error)).toBe(false)
  })
})

describe('connectWithRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('recovers in-process once the database answers again', async () => {
    const attempt = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(quota)
      .mockRejectedValueOnce(refused)
      .mockResolvedValue('boss')
    const log = logger()

    const booted = connectWithRetry(attempt, log)
    await vi.runAllTimersAsync()

    await expect(booted).resolves.toBe('boss')
    expect(attempt).toHaveBeenCalledTimes(3)
    expect(log.warn).toHaveBeenCalledTimes(2)
    expect(log.error).not.toHaveBeenCalled()
  })

  it('throws a deterministic failure on the first attempt instead of looping', async () => {
    const attempt = vi.fn<() => Promise<string>>().mockRejectedValue(badOption)

    await expect(connectWithRetry(attempt, logger())).rejects.toBe(badOption)
    expect(attempt).toHaveBeenCalledTimes(1)
  })

  it('keeps the event loop alive while it waits, so the process cannot exit 0', async () => {
    const timers = vi.spyOn(globalThis, 'setTimeout')
    const attempt = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(quota)
      .mockResolvedValue('boss')

    const booted = connectWithRetry(attempt, logger())
    await vi.advanceTimersByTimeAsync(0)

    expect(timers).toHaveBeenCalledTimes(1)
    expect((timers.mock.results[0]?.value as NodeJS.Timeout).hasRef()).toBe(true)

    await vi.runAllTimersAsync()
    await expect(booted).resolves.toBe('boss')
  })

  it('escalates to error once the wait reaches the five-minute ceiling', async () => {
    // 2s doubling: attempts 1–8 wait 2s…256s, attempt 9 is the first capped at 300s.
    const attempt = vi.fn<() => Promise<string>>()
    for (let i = 0; i < 9; i++) attempt.mockRejectedValueOnce(quota)
    attempt.mockResolvedValue('boss')
    const log = logger()

    const booted = connectWithRetry(attempt, log)
    await vi.runAllTimersAsync()

    await expect(booted).resolves.toBe('boss')
    expect(log.warn).toHaveBeenCalledTimes(8)
    expect(log.error).toHaveBeenCalledTimes(1)
  })
})
