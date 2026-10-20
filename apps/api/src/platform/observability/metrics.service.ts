import { monitorEventLoopDelay } from 'node:perf_hooks'
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common'
import { sql } from 'drizzle-orm'
import { ENV, type Env } from '../config/env'
import { DB, DB_HANDLE, type Db } from '../db/db.module'
import type { DbHandle } from '../db/create-db'
import { takeFanout } from './fanout'
import { LatencyWindow } from './window-stats'

const WINDOW_MS = 60_000
const POOL_SAMPLE_MS = 1_000
/** Slower than the window: reading the queue is the one query this adds, and
 *  Neon should not be woken every minute for it. */
const QUEUE_MS = 5 * 60_000
/** Routes listed per line; the rest are counted, not named. */
const ROUTES_PER_LINE = 25

/** Measurements written to the log, no metrics stack (review findings 5 and 8).
 *
 *  Three line kinds, all JSON after the kind word, all under context `metrics`:
 *  `routes` (API, only when there was traffic), `runtime` (pool, event loop,
 *  broadcast fan-out) and `queues` (worker only). Timers are unref'd and
 *  cleared on shutdown; none start under NODE_ENV=test. */
@Injectable()
export class MetricsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger('metrics')
  private readonly latency = new LatencyWindow()
  private readonly loop = monitorEventLoopDelay({ resolution: 20 })
  private timers: NodeJS.Timeout[] = []
  private maxWaiting = 0

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(DB) private readonly db: Db,
    @Inject(DB_HANDLE) private readonly handle: DbHandle,
  ) {}

  /** Called from the one `onResponse` hook in `main.ts`, streams excluded. */
  recordRequest(method: string, route: string | undefined, ms: number): void {
    this.latency.record(route ? `${method} ${route}` : undefined, ms)
  }

  onApplicationBootstrap(): void {
    if (this.env.NODE_ENV === 'test') return
    this.loop.enable()
    this.every(POOL_SAMPLE_MS, () => this.samplePool())
    this.every(WINDOW_MS, () => this.report())
    if (process.env.PV_ROLE === 'worker') this.every(QUEUE_MS, () => void this.reportQueues())
  }

  onApplicationShutdown(): void {
    for (const t of this.timers) clearInterval(t)
    this.timers = []
    this.loop.disable()
  }

  private every(ms: number, fn: () => void): void {
    const timer = setInterval(fn, ms)
    timer.unref()
    this.timers.push(timer)
  }

  private samplePool(): void {
    this.maxWaiting = Math.max(this.maxWaiting, this.handle.stats?.().waiting ?? 0)
  }

  private report(): void {
    const routes = this.latency.flush()
    if (routes.length > 0) {
      const shown = routes.slice(0, ROUTES_PER_LINE)
      const omitted = routes.length - shown.length
      this.log.log(
        `routes ${JSON.stringify({ windowS: WINDOW_MS / 1000, routes: shown, omitted })}`,
      )
    }

    const ms = (ns: number) => Math.round(ns / 1e4) / 100
    const pool = this.handle.stats?.()
    this.log.log(
      `runtime ${JSON.stringify({
        windowS: WINDOW_MS / 1000,
        pool: pool && {
          total: pool.total,
          idle: pool.idle,
          waitingNow: pool.waiting,
          waitingMax: this.maxWaiting,
        },
        loopMs: { p99: ms(this.loop.percentile(99)), max: ms(this.loop.max) },
        broadcast: takeFanout(),
      })}`,
    )
    this.maxWaiting = 0
    this.loop.reset()
  }

  /** Jobs ready to run now and how long the oldest has been ready, per queue.
   *  Reads the parent table on pg-boss's own partial index; `getQueueStats`
   *  has no age and serves a cache up to an hour old. */
  private async reportQueues(): Promise<void> {
    try {
      const res = (await this.db.execute(sql`
        SELECT name, count(*)::int AS ready,
               extract(epoch FROM now() - min(start_after))::int AS oldest_s
        FROM pgboss.job
        WHERE state < 'active' AND NOT blocked AND start_after <= now()
        GROUP BY name ORDER BY name
      `)) as { rows: { name: string; ready: number; oldest_s: number }[] }
      const queues = res.rows.map((r) => ({ queue: r.name, ready: r.ready, oldestS: r.oldest_s }))
      this.log.log(`queues ${JSON.stringify({ everyS: QUEUE_MS / 1000, queues })}`)
    } catch (error) {
      this.log.warn(`queues read failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}
