import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common'
import { ENV, type Env } from '../config/env'
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
 *  OFF UNDER `NODE_ENV=test`, AND DUPLICATED IN THE WORKER ON PURPOSE
 *  ------------------------------------------------------------------
 *  A test that builds the DI container should not acquire a background timer
 *  that outlives it and writes to a database.
 *
 *  `worker.ts` imports `AppModule`, so the worker process runs this sweep too
 *  and the two processes overlap. That is left alone deliberately rather than
 *  fenced off with a flag: the statement is an idempotent `DELETE` over an
 *  indexed range, so the second one finds nothing and costs one round trip an
 *  hour. A flag to prevent it would be a new way to configure the system wrong
 *  in exchange for saving two queries a day. */
@Injectable()
export class SessionSweeper implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger('auth')
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly repo: AuthRepository,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onApplicationBootstrap(): void {
    if (this.env.NODE_ENV === 'test') return

    this.timer = setInterval(() => void this.sweep(), SWEEP_EVERY_MS)
    /* Do not hold the process open for a housekeeping timer. Same call as
       `worker.ts` makes for its own poll loop. */
    this.timer.unref()

    /* Once at boot as well as on the interval. A machine that is redeployed
       every few hours would otherwise never reach the first tick, and the
       table would grow for exactly as long as the deploy cadence stays below
       the sweep cadence — a backlog caused by shipping often. */
    void this.sweep()
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  /** Never rejects. A sweep that fails — Neon dropping the connection, a
   *  deploy landing mid-statement — must not become an unhandled rejection
   *  that takes the process down; the rows are still there and the next tick
   *  removes them. Same reasoning as the relay loop in `worker.ts`. */
  private async sweep(): Promise<void> {
    try {
      const removed = await this.repo.sweepExpiredSessions()
      if (removed > 0) this.log.log(`Quét phiên hết hạn: xoá ${removed} dòng.`)
    } catch (error: unknown) {
      this.log.error(`Quét phiên lỗi: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}
