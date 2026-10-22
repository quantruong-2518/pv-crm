import { sql, type SQL } from 'drizzle-orm'
import type { KpiMetricSql, Only } from './kpi-readings.repository'

/** The month-to-date figure at each of several Vietnam-day ends, from ONE scan
 *  of the basis: the basis rows are joined to the list of ends and the seat's
 *  own `total` folds each group. That is the very row set and fold a read with
 *  `to: end` runs, so the number is identical for any total, never an addition
 *  of partial sums done outside SQL.
 *
 *  Valid only for a basis that uses the span through `within(at)` alone, i.e.
 *  a cumulative tally. `firstResponse` reads the span's `hi` and a snapshot
 *  reads `as_of`, so the caller gates on `isCumulative`. Run it under `spanned`
 *  of the whole month. */
export function cumulativeByEnd(metric: KpiMetricSql, only: Only, ends: readonly string[]): SQL {
  const days = sql.join(
    ends.map((d) => sql`(${d}::date)`),
    sql`, `,
  )
  return sql`
    SELECT e.day::text AS day, (${metric.total})::float8 AS value
    FROM (${metric.basis(only)}) b
    JOIN (VALUES ${days}) e(day) ON b.at < (e.day::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
    GROUP BY e.day`
}

/** Σ adjustments landed in `period` on `series` by each Vietnam-day end in
 *  `ends`, dated by when the pass found them — so the chart's last point is
 *  the card, which counts them too (ADR 0115 §4). A room series' rows carry no
 *  actor and pass any actor filter. */
export function adjustedByEnd(
  period: string,
  series: string,
  only: Only,
  ends: readonly string[],
): SQL {
  const days = sql.join(
    ends.map((d) => sql`(${d}::date)`),
    sql`, `,
  )
  return sql`
    SELECT e.day::text AS day, sum(a.delta)::float8 AS value
    FROM sales.kpi_adjustment a
    JOIN (VALUES ${days}) e(day) ON a.detected_at < (e.day::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
    WHERE a.applied_period = ${period} AND a.series = ${series}
      AND (a.actor_id IS NULL OR (true${only(sql`a.actor_id`)}))
    GROUP BY e.day`
}
