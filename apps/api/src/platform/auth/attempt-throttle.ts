/** BRUTE-FORCE BRAKE — a `Map`, in this process, and honestly labelled.
 *
 *  ------------------------------------------------------------------
 *  WHAT THIS IS NOT
 *  ------------------------------------------------------------------
 *  It is NOT a rate limiter for a cluster. The counters live in the memory of
 *  one Node process, so two API machines are two independent budgets and a
 *  deploy resets both. The real answer, the day there is more than one machine,
 *  is the shape already built for the public intake door: a Postgres row spent
 *  atomically, `sales.lead_intake_rate` and `LeadIntakeRepository.consume`.
 *  Saying so here is cheaper than someone later assuming this file is that.
 *
 *  What it IS: the difference between "an attacker gets thousands of guesses a
 *  second per machine" and "an attacker gets a handful per machine per quarter
 *  hour". Combined with `scrypt` costing ~100 ms of CPU per guess, that is
 *  enough to make online guessing pointless, which is the entire job. A
 *  counter that survives a deploy would be better; a counter that exists is
 *  most of the value.
 *
 *  ------------------------------------------------------------------
 *  THE BACKOFF IS SHORT AND IT CANNOT BECOME A LOCKOUT
 *  ------------------------------------------------------------------
 *  Keying on the mailbox means anybody who knows an address can spend somebody
 *  else's failure budget — that is unavoidable, because the alternative (key on
 *  IP) is defeated by any list of proxies, and keying on nothing at all defeats
 *  the whole exercise. What is avoidable is turning that into a weapon: the
 *  backoff doubles from 30 seconds to a 15-minute ceiling and NEVER becomes
 *  permanent, and it clears on the first success. So the worst an attacker can
 *  do to a colleague is make them wait, once, for a quarter of an hour — as
 *  against an account that stays locked until an administrator is found, which
 *  is a free denial of service against every address in the company. */
const FAILURES_BEFORE_BLOCK = 5
const BASE_BACKOFF_MS = 30_000
const MAX_BACKOFF_MS = 15 * 60_000

/** An entry nobody has touched for this long is dropped. Comfortably past the
 *  ceiling above, so forgetting can never shorten an active block. */
const FORGET_MS = 30 * 60_000

/** Prune only once the map is big enough to be worth pruning. The map is keyed
 *  by whatever string was submitted, so an attacker posting a million distinct
 *  addresses is the case that makes it grow — bounded work, but unbounded
 *  memory without this. */
const PRUNE_ABOVE = 5_000

type Entry = { failures: number; blockedUntil: number; lastAt: number }

export class AttemptThrottle {
  private readonly entries = new Map<string, Entry>()

  /** Milliseconds the caller must wait, or 0 when it may proceed. */
  retryAfterMs(key: string, now: number = Date.now()): number {
    const entry = this.entries.get(key)
    if (!entry) return 0
    if (now - entry.lastAt > FORGET_MS) {
      this.entries.delete(key)
      return 0
    }
    return entry.blockedUntil > now ? entry.blockedUntil - now : 0
  }

  /** One more consecutive failure for this key.
   *
   *  The first `FAILURES_BEFORE_BLOCK` cost nothing, deliberately: people
   *  mistype passwords, and a brake that fires on the second attempt trains
   *  everyone to hate the sign-in screen without slowing an attacker who was
   *  always going to need thousands of tries. */
  fail(key: string, now: number = Date.now()): void {
    const entry = this.entries.get(key) ?? { failures: 0, blockedUntil: 0, lastAt: now }
    entry.failures += 1
    entry.lastAt = now
    if (entry.failures >= FAILURES_BEFORE_BLOCK) {
      const steps = entry.failures - FAILURES_BEFORE_BLOCK
      entry.blockedUntil = now + Math.min(BASE_BACKOFF_MS * 2 ** steps, MAX_BACKOFF_MS)
    }
    this.entries.set(key, entry)
    if (this.entries.size > PRUNE_ABOVE) this.prune(now)
  }

  /** Success, or anything else that means the streak is over. */
  clear(key: string): void {
    this.entries.delete(key)
  }

  private prune(now: number): void {
    for (const [key, entry] of this.entries) {
      if (now - entry.lastAt > FORGET_MS) this.entries.delete(key)
    }
  }
}
