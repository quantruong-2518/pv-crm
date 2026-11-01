import type { AiProvider } from './ai-client'

/** At most `PER_PROVIDER` requests in flight to one vendor from this process,
 *  so tasks added beside lead scan cannot together run into the vendor's
 *  per-minute quota (a 429 is a failed attempt, billed time and a fallback).
 *
 *  Four matches `SCAN_READ_CONCURRENCY`, so a lead scan alone never waits, but
 *  assistant rounds share these slots and a turn can queue behind it; a slot is
 *  held for the request alone, not for the caller's other work.
 *
 *  `work` is told how long it queued, so a caller keeps that apart from the
 *  request's own latency. A `signal` that fires in the queue rejects with its
 *  reason and takes no slot. */

const PER_PROVIDER = 4

export class ProviderLimiter {
  private readonly active = new Map<AiProvider, number>()
  private readonly queued = new Map<AiProvider, (() => void)[]>()

  async run<T>(
    provider: AiProvider,
    work: (queuedMs: number) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    const queuedAt = Date.now()
    await this.acquire(provider, signal)
    try {
      return await work(Date.now() - queuedAt)
    } finally {
      this.release(provider)
    }
  }

  private acquire(provider: AiProvider, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.reject(signal.reason as Error)
    const active = this.active.get(provider) ?? 0
    if (active < PER_PROVIDER) {
      this.active.set(provider, active + 1)
      return Promise.resolve()
    }
    return new Promise((resolve, reject) => {
      const queue = this.queued.get(provider) ?? []
      const wake = () => {
        signal?.removeEventListener('abort', leave)
        resolve()
      }
      const leave = () => {
        queue.splice(queue.indexOf(wake), 1)
        reject(signal?.reason as Error)
      }
      signal?.addEventListener('abort', leave, { once: true })
      queue.push(wake)
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
