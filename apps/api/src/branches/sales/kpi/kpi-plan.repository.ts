import { Inject, Injectable } from '@nestjs/common'
import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm'
import { StageKey, type KpiMetricKey, type RoleId } from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { dealLost, dealTerminated, dealWon } from '../open-deal'
import type { PeriodSpan } from '../performance/performance-period'
import { kpiMonthClose, kpiMonthValue } from './kpi-close.schema'
import { metricSql, onlyFor, spanned, type KpiSeat } from './kpi-readings.repository'

/** SQL behind the plan read and the assignment suggestion (ADR 0157).
 *
 *  Nothing here invents a formula: figures fold the seat's own basis
 *  (`metricSql`, so "signed", "opened" and "won" read as the cards do), stage
 *  exits use the shared won/lost predicates, and closed results come from the
 *  frozen `kpi_month_value`, never a live reading (ADR 0115). */

/** A seat's basis folded: `ones` are the rows a share counts as yes. */
export type PlanFold = { sum: number; rows: number; codes: number; ones: number }
export type StageExits = { stage: StageKey; forward: number; lost: number }

const STAGE_ORDER = sql.join(
  StageKey.options.map((s, i) => sql`WHEN ${s} THEN ${i}`),
  sql` `,
)
const rank = (column: string) => sql`(CASE ${sql.raw(column)} ${STAGE_ORDER} END)`
const LIVE = sql`JOIN sales.lead l ON l.code = k.lead_code AND l.disabled_at IS NULL`

@Injectable()
export class KpiPlanRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async fold(seat: KpiSeat, span: PeriodSpan, actorId: string): Promise<PlanFold> {
    const r = (await this.db.execute(
      spanned(
        span,
        sql`SELECT COALESCE(sum(b.value), 0)::float8 AS sum, count(*)::int AS rows,
                   count(DISTINCT b.code)::int AS codes,
                   (count(*) FILTER (WHERE b.value = 1))::int AS ones
            FROM (${metricSql(seat).basis(onlyFor(actorId))}) b`,
      ),
    )) as { rows: PlanFold[] }
    return r.rows[0] ?? { sum: 0, rows: 0, codes: 0, ones: 0 }
  }

  /** Deals created in the span that stand on the person's SALE lane: the lane has no
   *  date of its own, so the deal's creation is when it entered. */
  async enteredSale(span: PeriodSpan, actorId: string): Promise<number> {
    const r = (await this.db.execute(
      spanned(
        span,
        sql`SELECT count(*)::int AS n FROM sales.opportunity k ${LIVE}
             WHERE k.created_at >= (SELECT lo FROM span) AND k.created_at < (SELECT hi FROM span)
               AND EXISTS (SELECT 1 FROM sales.opportunity_owner w
                            WHERE w.opportunity_code = k.code AND w.role = 'SALE'
                              AND w.actor_id = ${actorId})`,
      ),
    )) as { rows: { n: number }[] }
    return r.rows[0]?.n ?? 0
  }

  /** One exit per deal and stage (the last in the window); a backward move is in neither
   *  count, and a deal that left by signing is forward, by stopping lost. Over several
   *  people a deal they share is still one exit. */
  async stageExits(span: PeriodSpan, actors: string | readonly string[]): Promise<StageExits[]> {
    const r = (await this.db.execute(
      spanned(
        span,
        sql`SELECT x.stage, (count(*) FILTER (WHERE x.fwd))::int AS forward,
                   (count(*) FILTER (WHERE x.gone))::int AS lost
            FROM (
              SELECT DISTINCT ON (e.opportunity_code, e.from_stage)
                     e.from_stage AS stage,
                     CASE WHEN e.to_stage IS NULL THEN ${dealWon(sql`k.code`)}
                          ELSE ${rank('e.to_stage')} > ${rank('e.from_stage')} END AS fwd,
                     e.to_stage IS NULL AND (${dealLost(sql`k.code`, sql`k.state`)}
                       OR ${dealTerminated(sql`k.code`)}) AS gone
                FROM sales.opportunity_stage_event e
                JOIN sales.opportunity k ON k.code = e.opportunity_code ${LIVE}
               WHERE e.from_stage IS NOT NULL
                 AND e.at >= (SELECT lo FROM span) AND e.at < (SELECT hi FROM span)
                 AND EXISTS (SELECT 1 FROM sales.opportunity_owner w
                              WHERE w.opportunity_code = k.code AND w.role = 'SALE'${onlyFor(actors)(sql`w.actor_id`)})
               ORDER BY e.opportunity_code, e.from_stage, e.at DESC
            ) x
            GROUP BY x.stage`,
      ),
    )) as { rows: StageExits[] }
    return r.rows
  }

  /** The newest `n` months before `period` that have a close row, newest first. */
  async closedBefore(period: string, n: number): Promise<string[]> {
    const rows = await this.db
      .select({ period: kpiMonthClose.period })
      .from(kpiMonthClose)
      .where(lt(kpiMonthClose.period, period))
      .orderBy(desc(kpiMonthClose.period))
      .limit(n)
    return rows.map((r) => r.period)
  }

  /** Frozen results, `period|actorId|metricKey` -> value; absent or null = no result. */
  async frozen(
    periods: readonly string[],
    role: RoleId,
    actorIds: readonly string[],
    keys: readonly KpiMetricKey[],
  ): Promise<Map<string, number>> {
    if (periods.length === 0 || actorIds.length === 0 || keys.length === 0) return new Map()
    const rows = await this.db
      .select()
      .from(kpiMonthValue)
      .where(
        and(
          inArray(kpiMonthValue.period, [...periods]),
          inArray(kpiMonthValue.actorId, [...actorIds]),
          inArray(kpiMonthValue.metricKey, [...keys]),
          eq(kpiMonthValue.role, role),
        ),
      )
    return new Map(
      rows.flatMap((r) =>
        r.value === null ? [] : [[`${r.period}|${r.actorId}|${r.metricKey}`, Number(r.value)]],
      ),
    )
  }
}
