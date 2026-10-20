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
