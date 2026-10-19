import { and, desc, eq, sql } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type { AiPriceSet } from '@pv/contracts'
import { DB, type Db } from '../db/db.module'
import { actor } from '../db/platform.schema'
import { aiPrice, type AiPriceRowDb } from './ai-cost.schema'

/** SQL of the cost ledger's read side and the price table. Decides nothing.
 *
 *  Cost is computed here, in one statement, never stored (ADR 0102 §2): each
 *  call joins its model's price row with the greatest `effective_from` on or
 *  before the call's Vietnam date; no row leaves the price columns NULL, so the
 *  call is unpriced and `sum()` skips it. Every number leaves as `int` or
 *  `float8`: `bigint` and `numeric` would arrive as strings. */

/** One grouping-set row; `dim` names which of the five groupings it is. */
export type AiCostGroupRow = {
  dim: 'total' | 'day' | 'task' | 'model' | 'actor'
  day: string | null
  task: string | null
  model: string | null
  actorId: string | null
  name: string | null
  calls: number
  errorCalls: number
  tokensIn: number
  tokensOut: number
  costUsd: number | null
  unpricedCalls: number
}

export type AiPriceJoined = {
  model: string
  inputUsdPerMTok: string
  outputUsdPerMTok: string
  effectiveFrom: string
  setBy: string
  setAt: Date
}

type PriceKey = Pick<AiPriceSet, 'model' | 'effectiveFrom'>

const byKey = (key: PriceKey) =>
  and(eq(aiPrice.model, key.model), eq(aiPrice.effectiveFrom, key.effectiveFrom))

const JOINED = {
  model: aiPrice.model,
  inputUsdPerMTok: aiPrice.inputUsdPerMTok,
  outputUsdPerMTok: aiPrice.outputUsdPerMTok,
  effectiveFrom: aiPrice.effectiveFrom,
  setBy: actor.name,
  setAt: aiPrice.setAt,
}

const VN = sql.raw(`'Asia/Ho_Chi_Minh'`)

@Injectable()
export class AiCostRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  run<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(tx))
  }

  /** Totals plus by day, task, model and actor for one Vietnam month. */
  async report(month: string): Promise<AiCostGroupRow[]> {
    const first = `${month}-01`
    const r = (await this.db.execute(sql`
      WITH c AS (
        SELECT a."task", a."model", a."actor_id", a."tokens_in", a."tokens_out", a."outcome",
               (a."at" AT TIME ZONE ${VN})::date AS day, w."name",
               (a."tokens_in"::numeric / 1e6 * p."input_usd_per_mtok"
                + a."tokens_out"::numeric / 1e6 * p."output_usd_per_mtok") AS cost
          FROM "platform"."ai_call" a
          LEFT JOIN "platform"."actor" w ON w."id" = a."actor_id"
          LEFT JOIN LATERAL (
            SELECT p."input_usd_per_mtok", p."output_usd_per_mtok"
              FROM "platform"."ai_price" p
             WHERE p."model" = a."model"
               AND p."effective_from" <= (a."at" AT TIME ZONE ${VN})::date
             ORDER BY p."effective_from" DESC
             LIMIT 1
          ) p ON true
         WHERE a."at" >= (${first}::date)::timestamp AT TIME ZONE ${VN}
           AND a."at" < ((${first}::date)::timestamp + interval '1 month') AT TIME ZONE ${VN}
      )
      SELECT CASE WHEN grouping(day) = 0 THEN 'day'
                  WHEN grouping("task") = 0 THEN 'task'
                  WHEN grouping("model") = 0 THEN 'model'
                  WHEN grouping("actor_id") = 0 THEN 'actor'
                  ELSE 'total' END                                      AS dim,
             day::text AS day, "task", "model", "actor_id" AS "actorId", "name",
             count(*)::int                                              AS calls,
             count(*) FILTER (WHERE "outcome" = 'error')::int           AS "errorCalls",
             COALESCE(sum("tokens_in"), 0)::float8                      AS "tokensIn",
             COALESCE(sum("tokens_out"), 0)::float8                     AS "tokensOut",
             sum(cost)::float8                                          AS "costUsd",
             count(*) FILTER (WHERE cost IS NULL)::int                  AS "unpricedCalls"
        FROM c
       GROUP BY GROUPING SETS ((), (day), ("task"), ("model"), ("actor_id", "name"))
       ORDER BY dim, day, "task", "model", "costUsd" DESC NULLS LAST, calls DESC
    `)) as { rows: AiCostGroupRow[] }
    return r.rows
  }

  /** Every price row, newest first, with the setter's display name; `key`
   *  narrows to one row, read on `db` so a caller's `tx` sees its own upsert. */
  prices(db: Db = this.db, key?: PriceKey): Promise<AiPriceJoined[]> {
    return db
      .select(JOINED)
      .from(aiPrice)
      .innerJoin(actor, eq(actor.id, aiPrice.setById))
      .where(key && byKey(key))
      .orderBy(desc(aiPrice.effectiveFrom), desc(aiPrice.setAt), aiPrice.model)
  }

  /** Models in the ledger with no price row at all. */
  async unpricedModels(): Promise<string[]> {
    const r = (await this.db.execute(sql`
      SELECT DISTINCT a."model" FROM "platform"."ai_call" a
       WHERE NOT EXISTS (SELECT 1 FROM "platform"."ai_price" p WHERE p."model" = a."model")
       ORDER BY a."model"
    `)) as { rows: { model: string }[] }
    return r.rows.map((row) => row.model)
  }

  /** The row as it stood before the write, for the audit line. Locks an existing
   *  row only: two racing FIRST writes can both read "no row". */
  async lock(tx: Db, key: PriceKey): Promise<AiPriceRowDb | null> {
    const [row] = await tx.select().from(aiPrice).where(byKey(key)).for('update')
    return row ?? null
  }

  /** One statement, for `SettingRepository.upsert`'s reason: two first writes cannot both insert. */
  async upsert(tx: Db, body: AiPriceSet, setById: string): Promise<void> {
    const values = {
      inputUsdPerMTok: String(body.inputUsdPerMTok),
      outputUsdPerMTok: String(body.outputUsdPerMTok),
      setById,
    }
    await tx
      .insert(aiPrice)
      .values({ model: body.model, effectiveFrom: body.effectiveFrom, ...values })
      .onConflictDoUpdate({
        target: [aiPrice.model, aiPrice.effectiveFrom],
        set: { ...values, setAt: sql`now()` },
      })
  }
}
