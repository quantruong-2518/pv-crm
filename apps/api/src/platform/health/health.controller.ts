import { Controller, Get, Inject, Logger, Res } from '@nestjs/common'
import { sql } from 'drizzle-orm'
import type { FastifyReply } from 'fastify'
import { Public } from '../access/need.decorator'
import { DB, type Db } from '../db/db.module'

/** Three routes, three audiences — split because one shared `/healthz` used
 *  to make Fly poll `SELECT 1` every 15s whether compute needed to be awake
 *  or not, and always answered 200 even when the DB was down, so Fly never
 *  saw red. See `docs/runbooks/neon-compute-and-worker.md` §2. */
@Controller()
export class HealthController {
  private readonly log = new Logger('health')

  constructor(@Inject(DB) private readonly db: Db) {}

  /** Fly calls this every 15s. The handler itself never touches DB/Redis/any
   *  outside service — `req.actor` is still resolved by the global
   *  `ActorGuard` when a request happens to carry a session cookie, but Fly's
   *  own probe never does, so this route stays connection-free in practice. */
  @Get('livez')
  @Public()
  livez(): { status: 'ok' } {
    return { status: 'ok' }
  }

  /** Deploy verification and external alerting — not the endpoint Fly polls
   *  every 15s. A real 503 when the DB is down, so a load balancer or alert
   *  can act on it. */
  @Get('readyz')
  @Public()
  async readyz(@Res({ passthrough: true }) reply: FastifyReply): Promise<{
    status: 'ok' | 'degraded'
    db: boolean
  }> {
    const db = await this.probe()
    reply.status(db ? 200 : 503)
    return { status: db ? 'ok' : 'degraded', db }
  }

  /** Temporary alias for monitors still pointed at `/healthz` — same behaviour
   *  as `readyz`, a real 503 when the DB is down instead of always 200. Remove
   *  once every monitor has moved to `/readyz`. */
  @Get('healthz')
  @Public()
  healthz(@Res({ passthrough: true }) reply: FastifyReply): Promise<{
    status: 'ok' | 'degraded'
    db: boolean
  }> {
    return this.readyz(reply)
  }

  private async probe(): Promise<boolean> {
    try {
      await this.db.execute(sql`SELECT 1`)
      return true
    } catch (error) {
      this.log.warn(
        `readyz probe failed: ${error instanceof Error ? error.message : String(error)}`,
      )
      return false
    }
  }
}
