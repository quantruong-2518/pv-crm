import { Inject, Injectable } from '@nestjs/common'
import { ENV, type Env } from '@api/platform/config/env'
import { rateLimited } from '@api/platform/http/problem'

/** Spends the address lookup budget — only past the cache, so a hit or the
 *  empty probe costs nothing. Two ceilings: one per person, so a stuck loop or
 *  a script cannot eat the company's quota, and one per day across everybody
 *  (only calls that really leave), so the free plan cannot be outrun.
 *
 *  In process memory on purpose: it guards a paid quota, not a security
 *  boundary, and a restart or a second machine only loosens it a little. */

/** Chosen defaults, not spec. 40 a minute is a fast typist finishing several
 *  addresses; 20 a minute of map picks is more than anyone taps. */
const PER_MINUTE = { suggest: 40, point: 20 } as const
const WINDOW_MS = 60_000

export type LookupKind = keyof typeof PER_MINUTE

@Injectable()
export class GeoLimiter {
  private readonly hits = new Map<string, number[]>()
  private day = ''
  private spentToday = 0

  constructor(@Inject(ENV) private readonly env: Env) {}

  /** One person's own pace. Charged to whoever asks, even when the answer is
   *  shared with someone already waiting on it. Throws 429. */
  person(actorId: string, kind: LookupKind): void {
    const key = `${actorId}:${kind}`
    const now = Date.now()
    const recent = (this.hits.get(key) ?? []).filter((at) => now - at < WINDOW_MS)
    if (recent.length >= PER_MINUTE[kind]) {
      throw rateLimited('Bạn tra cứu địa chỉ hơi nhanh. Đợi vài giây rồi gõ tiếp.')
    }

    recent.push(now)
    this.hits.set(key, recent)
  }

  /** One call to the provider, charged to the company's day. Throws 429. */
  upstream(): void {
    this.rollDay()
    if (this.spentToday >= this.env.VIETMAP_DAILY_CAP) {
      throw rateLimited('Hôm nay đã hết lượt tra cứu địa chỉ tự động. Bạn nhập tay giúp nhé.')
    }
    this.spentToday++
  }

  private rollDay(): void {
    const today = new Date().toISOString().slice(0, 10)
    if (today === this.day) return
    this.day = today
    this.spentToday = 0
  }
}
