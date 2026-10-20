import { Injectable, Logger } from '@nestjs/common'
import { AuthRepository } from './auth.repository'

/** Hourly. Nothing about the number is precious — see below. */
const SWEEP_EVERY_MS = 60 * 60_000

/** DELETE SESSIONS THAT RAN OUT OF TIME.
 *
 *  ------------------------------------------------------------------
 *  WHY A SWEEP EXISTS AT ALL WHEN EXPIRY IS ALREADY CHECKED ON READ
 *  ------------------------------------------------------------------
 *  `AuthService.living` refuses a session past `expires_at`, so a dead row is
 *  already harmless. The problem is not correctness, it is that
 *  `platform.session` is otherwise an APPEND-ONLY table: one row per sign-in,
 *  per person, per device, forever. A twenty-person company signing in twice a
 *  day writes some ten thousand rows a year that nothing will ever read again,
 *  and every one of them sits in the index that the hottest query in the system
 *  seeks through. `auth.schema.ts` put an index on `expires_at` specifically so
 *  this sweep would not scan the table it is trimming.
 *
 *  ------------------------------------------------------------------
 *  HOURLY, AND WHY THE INTERVAL IS NOT A KNOB
 *  ------------------------------------------------------------------
 *  Nothing depends on the timing: a row deleted an hour late is a row that was
 *  already being refused on read. So there is no operational reason to tune
 *  this, and an env variable would be one more line in a file that is
 *  deliberately hostile to settings nobody changes. Hourly is small enough that
 *  the table never grows a backlog and rare enough that it does not keep Neon
 *  awake on its own account — the same billing consideration
 *  `PV_QUEUE_POLL_SECONDS` is documented with.
 *
 *  ------------------------------------------------------------------
 *  RIDES THE WORKER'S TICK, NO CLOCK OF ITS OWN
 *  ------------------------------------------------------------------
 *  `worker.ts` calls `sweep` on every tick and the throttle below keeps it to
 *  one pass an hour (ADR 0082 §2). API machines never run it: a timer per
 *  machine repeated the same `DELETE` and kept each one's pool busy. The first
 *  tick after a worker boots is the boot pass, so redeploying often cannot
 *  starve the table of its sweep. */
@Injectable()
export class SessionSweeper {
  private readonly log = new Logger('auth')
  private notBefore = 0
  private running = false

  constructor(private readonly repo: AuthRepository) {}

  /** Called on every worker tick. `null` = this tick was not a pass. The clock
   *  moves BEFORE the pass so a failing database is asked again one interval
   *  later; the rows are still there for the next one. */
  async sweep(now = Date.now()): Promise<number | null> {
    if (this.running || now < this.notBefore) return null
    this.notBefore = now + SWEEP_EVERY_MS
    this.running = true
    try {
      const removed = await this.repo.sweepExpiredSessions()
      if (removed > 0) this.log.log(`Quét phiên hết hạn: xoá ${removed} dòng.`)
      return removed
    } finally {
      this.running = false
    }
  }
}
