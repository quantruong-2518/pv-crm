import type { AiProvider } from './ai-client'

/** At most `PER_PROVIDER` requests in flight to one vendor from this process,
 *  so tasks added beside lead scan cannot together run into the vendor's
 *  per-minute quota (a 429 is a failed attempt, billed time and a fallback).
 *
 *  Four matches `SCAN_READ_CONCURRENCY`, so today's only task never waits; a
 *  slot is held for the request alone, not for the caller's other work. */

const PER_PROVIDER = 4

export class ProviderLimiter {
  private readonly active = new Map<AiProvider, number>()
  private readonly queued = new Map<AiProvider, (() => void)[]>()

  async run<T>(provider: AiProvider, work: () => Promise<T>): Promise<T> {
    await this.acquire(provider)
    try {
      return await work()
    } finally {
      this.release(provider)
    }
  }

  private acquire(provider: AiProvider): Promise<void> {
    const active = this.active.get(provider) ?? 0
    if (active < PER_PROVIDER) {
      this.active.set(provider, active + 1)
      return Promise.resolve()
    }
    return new Promise((resolve) => {
      const queue = this.queued.get(provider) ?? []
      queue.push(resolve)
      this.queued.set(provider, queue)
    })
  }

  /** A waiter takes the freed slot directly, so the count never dips and refills. */
  private release(provider: AiProvider): void {
    const next = this.queued.get(provider)?.shift()
    if (next) next()
    else this.active.set(provider, (this.active.get(provider) ?? 1) - 1)
  }
}
