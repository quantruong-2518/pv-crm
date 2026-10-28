import { and, asc, eq, gt, sql } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type { AiRouteSet, AiTask } from '@pv/contracts'
import { DB, type Db } from '../db/db.module'
import { aiCall } from './ai-cost.schema'
import { aiRoute, type AiRouteRowDb } from './ai-route.schema'

/** SQL of the route table and of the two rolling-24 h counts the gateway's
 *  pre-flight reads off the ledger. Decides nothing.
 *
 *  Every read takes a `db` so a caller inside a transaction can pass its `tx`:
 *  on PGlite a second connection inside an open transaction waits on itself. */

const LAST_DAY = sql`now() - interval '24 hours'`

@Injectable()
export class AiRouteRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  run<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(tx))
  }

  list(): Promise<AiRouteRowDb[]> {
    return this.db.select().from(aiRoute).orderBy(asc(aiRoute.task))
  }

  async get(task: AiTask, db: Db = this.db): Promise<AiRouteRowDb | null> {
    const [row] = await db.select().from(aiRoute).where(eq(aiRoute.task, task))
    return row ?? null
  }

  /** The row before the write, for the audit line; see `AiCostRepository.lock`. */
  async lock(tx: Db, task: AiTask): Promise<AiRouteRowDb | null> {
    const [row] = await tx.select().from(aiRoute).where(eq(aiRoute.task, task)).for('update')
    return row ?? null
  }

  async upsert(tx: Db, task: AiTask, body: AiRouteSet, updatedBy: string): Promise<AiRouteRowDb> {
    const values = { ...body, updatedBy, updatedAt: sql`now()` }
    const [row] = await tx
      .insert(aiRoute)
      .values({ task, ...values })
      .onConflictDoUpdate({ target: aiRoute.task, set: values })
      .returning()
    if (!row) throw new Error('platform.ai_route: upsert returned no row')
    return row
  }

  /** Calls one person started: first attempts only, so a retry or a fallback
   *  is not charged to them twice. Served by `ai_call_actor_at_idx`. */
  async callsLastDay(task: AiTask, actorId: string, db: Db = this.db): Promise<number> {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(aiCall)
      .where(
        and(
          eq(aiCall.actorId, actorId),
          gt(aiCall.at, LAST_DAY),
          eq(aiCall.task, task),
          eq(aiCall.attempt, 1),
        ),
      )
    return row?.n ?? 0
  }

  /** Every attempt's tokens, failed ones too: an unusable answer is still billed. */
  async tokensLastDay(task: AiTask, db: Db = this.db): Promise<number> {
    const [row] = await db
      .select({
        n: sql<number>`coalesce(sum(${aiCall.tokensIn} + ${aiCall.tokensOut}), 0)::float8`,
      })
      .from(aiCall)
      .where(and(gt(aiCall.at, LAST_DAY), eq(aiCall.task, task)))
    return row?.n ?? 0
  }
}
