import { sql } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type { KpiAdjustmentCause } from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import type { PeriodSpan } from '../performance/performance-period'
import {
  frozenBasis,
  metricSql,
  onlyFor,
  seriesKey,
  spanned,
  type KpiSeat,
} from './kpi-readings.repository'

/** The records behind a person's figures: the BASIS rows of each metric
 *  (`kpi-readings.repository.ts`), never a second rule — so the list and the
 *  card cannot disagree on what was counted (ADR 0099 §5).
 *
 *  Newest first, cut at `cap` per series in SQL; `total` is the uncut count,
 *  which is how a capped list still says how many stand behind it. A closed
 *  month with a frozen basis lists that, and adjustments list beside the basis
 *  (ADR 0115 §4). */

export type KpiContributionRow = {
  series: string
  kind: string
  code: string
  at: Date | string | null
  value: number | null
  tag: string
  total: number
}

/** `tag` is nullable in the table only; the reconcile copies it from a basis row. */
export type KpiAdjustmentRow = Omit<KpiContributionRow, 'tag'> & {
  tag: string | null
  sourcePeriod: string
  cause: KpiAdjustmentCause
}

@Injectable()
export class KpiContributionsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** One statement for every seat; seats sharing a series are read once.
   *  `frozen` reads the month's frozen basis instead of the books. */
  async rows(
    seats: readonly KpiSeat[],
    span: PeriodSpan,
    actorId: string,
    cap: number,
    frozen = false,
  ): Promise<KpiContributionRow[]> {
    const only = onlyFor(actorId)
    const wanted = new Map(seats.map((s) => [seriesKey(s), s]))
    const parts = [...wanted].map(
      ([series, s]) => sql`SELECT * FROM (
        SELECT ${series}::text AS series, b.kind::text AS kind, b.code::text AS code, b.at,
               b.value::float8 AS value, b.tag::text AS tag,
               (count(*) OVER ())::int AS total,
               row_number() OVER (ORDER BY b.at DESC NULLS LAST, b.code) AS n
        FROM (${(frozen ? frozenBasis(span.key, s) : metricSql(s).basis)(only)}) b) c
        WHERE c.n <= ${cap}`,
    )
    if (parts.length === 0) return []
    const r = (await this.db.execute(spanned(span, sql.join(parts, sql` UNION ALL `)))) as {
      rows: KpiContributionRow[]
    }
    return r.rows
  }

  /** Adjustments landed in `period` or sourced from it, for the person's own
   *  series and every room series they read, newest first, cut like `rows`. */
  async adjustments(
    seats: readonly KpiSeat[],
    period: string,
    actorId: string,
    cap: number,
  ): Promise<KpiAdjustmentRow[]> {
    const wanted = new Map(seats.map((s) => [seriesKey(s), s.def.scope]))
    if (wanted.size === 0) return []
    const mine = sql.join(
      [...wanted].map(([series, scope]) =>
        scope === 'room'
          ? sql`a.series = ${series}`
          : sql`(a.series = ${series} AND a.actor_id = ${actorId})`,
      ),
      sql` OR `,
    )
    const r = (await this.db.execute(sql`
      SELECT * FROM (
        SELECT a.series, a.kind, a.code, a.tag, a.detected_at AS at,
               a.delta::float8 AS value, a.source_period AS "sourcePeriod", a.cause,
               (count(*) OVER (PARTITION BY a.series))::int AS total,
               row_number() OVER (PARTITION BY a.series ORDER BY a.detected_at DESC, a.code) AS n
        FROM sales.kpi_adjustment a
        WHERE (a.applied_period = ${period} OR a.source_period = ${period}) AND (${mine})) c
      WHERE c.n <= ${cap}`)) as { rows: KpiAdjustmentRow[] }
    return r.rows
  }
}
