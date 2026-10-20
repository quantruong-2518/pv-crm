// @vitest-environment node
import 'reflect-metadata'
import { describe, expect, it, vi } from 'vitest'
import type { AuthRepository } from './auth.repository'
import { SessionSweeper } from './session.sweeper'

vi.mock('./auth.repository', () => ({ AuthRepository: class {} }))

const HOUR = 60 * 60_000

describe('SessionSweeper throttle', () => {
  const build = (sweepExpiredSessions: () => Promise<number>) =>
    new SessionSweeper({ sweepExpiredSessions } as unknown as AuthRepository)

  it('passes on the first tick, then waits an hour', async () => {
    const delete_ = vi.fn(async () => 3)
    const sweeper = build(delete_)
    expect(await sweeper.sweep(1_000)).toBe(3)
    expect(await sweeper.sweep(1_000 + HOUR - 1)).toBeNull()
    expect(await sweeper.sweep(1_000 + HOUR)).toBe(3)
    expect(delete_).toHaveBeenCalledTimes(2)
  })

  it('moves the clock before the pass, so a failing database waits an hour too', async () => {
    const delete_ = vi.fn(async () => {
      throw new Error('neon dropped')
    })
    const sweeper = build(delete_)
    await expect(sweeper.sweep(0)).rejects.toThrow('neon dropped')
    expect(await sweeper.sweep(HOUR - 1)).toBeNull()
    expect(delete_).toHaveBeenCalledTimes(1)
  })

  it('skips a tick while a pass is still running', async () => {
    let release: (n: number) => void = () => {}
    const sweeper = build(() => new Promise<number>((r) => (release = r)))
    const first = sweeper.sweep(0)
    expect(await sweeper.sweep(2 * HOUR)).toBeNull()
    release(1)
    expect(await first).toBe(1)
  })
})
