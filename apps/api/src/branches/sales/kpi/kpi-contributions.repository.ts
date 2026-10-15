import { sql } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import { DB, type Db } from '@api/platform/db/db.module'
import type { PeriodSpan } from '../performance/performance-period'
import { metricSql, onlyFor, seriesKey, spanned, type KpiSeat } from './kpi-readings.repository'

/** The records behind a person's figures: the BASIS rows of each metric
 *  (`kpi-readings.repository.ts`), never a second rule — so the list and the
 *  card cannot disagree on what was counted (ADR 0099 §5).
 *
 *  Newest first, cut at `cap` per series in SQL; `total` is the uncut count,
 *  which is how a capped list still says how many stand behind it. */

export type KpiContributionRow = {
  series: string
  kind: string
  code: string
  at: Date | string | null
  value: number | null
  tag: string
  total: number
}

@Injectable()
export class KpiContributionsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** One statement for every seat; seats sharing a series are read once. */
  async rows(
    seats: readonly KpiSeat[],
    span: PeriodSpan,
    actorId: string,
    cap: number,
  ): Promise<KpiContributionRow[]> {
    const only = onlyFor(actorId)
    const wanted = new Map(seats.map((s) => [seriesKey(s), s]))
    const parts = [...wanted].map(
      ([series, s]) => sql`SELECT * FROM (
        SELECT ${series}::text AS series, b.kind::text AS kind, b.code::text AS code, b.at,
               b.value::float8 AS value, b.tag::text AS tag,
               (count(*) OVER ())::int AS total,
               row_number() OVER (ORDER BY b.at DESC NULLS LAST, b.code) AS n
        FROM (${metricSql(s).basis(only)}) b) c
        WHERE c.n <= ${cap}`,
    )
    if (parts.length === 0) return []
    const r = (await this.db.execute(spanned(span, sql.join(parts, sql` UNION ALL `)))) as {
      rows: KpiContributionRow[]
    }
    return r.rows
  }
}
