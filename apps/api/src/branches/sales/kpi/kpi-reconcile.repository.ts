import { sql, type SQL } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type { KpiAdjustmentCause, KpiMetricKey, RoleId } from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import type { PeriodSpan } from '../performance/performance-period'
import { kpiAdjustment, type KpiAdjustmentValues } from './kpi-close.schema'
import { metricSql, onlyFor, seriesKey, spanned, type KpiSeat } from './kpi-readings.repository'

/** SQL of the reconcile pass (ADR 0115 §2): one closed month's basis three
 *  ways — live from the books, frozen at the close, and what adjustments have
 *  already said — each tallied per (series, actor, record code). Decides
 *  nothing: which series qualify and what to write are the service's. */

/** One record key of one series, tallied: `n` rows, their values summed, and
 *  the record's kind and tag (rows of one key share them). */
export type KpiBasisTally = {
  series: string
  actorId: string | null
  code: string
  kind: string | null
  tag: string | null
  n: number
  sum: number
}

/** Adjustments already written for a key: Σ delta and the latest cause. */
export type KpiWrittenTally = Omit<KpiBasisTally, 'n'> & { last: KpiAdjustmentCause }

type Raw = {
  series: string
  actor_id: string | null
  code: string
  kind: string | null
  tag: string | null
}

const inList = (series: readonly string[]): SQL =>
  sql.join(
    series.map((s) => sql`${s}`),
    sql`, `,
  )

/** One lock for every writer of the KPI books' adjustments: two reconcile
 *  passes (the worker's sweep, a close) would both write one remainder, and a
 *  close folding a month's adjustments must not race a pass adding to them. */
export const holdReconcileLock = async (tx: Db): Promise<void> => {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('sales.kpi-reconcile'))`)
}

@Injectable()
export class KpiReconcileRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  run<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      await holdReconcileLock(tx)
      return work(tx)
    })
  }

  /** Closed months whose close froze a basis, oldest first. */
  async closedWithBasis(): Promise<string[]> {
    const r = (await this.db.execute(sql`
      SELECT period FROM sales.kpi_month_close WHERE basis_frozen ORDER BY 1`)) as {
      rows: { period: string }[]
    }
    return r.rows.map((row) => row.period)
  }

  async closed(tx: Db, period: string): Promise<boolean> {
    const r = (await tx.execute(sql`
      SELECT EXISTS (SELECT 1 FROM sales.kpi_month_close WHERE period = ${period}) AS closed`)) as {
      rows: { closed: boolean }[]
    }
    return r.rows[0]?.closed === true
  }

  /** Every series the month's basis holds a row of. */
  async basisSeries(period: string): Promise<string[]> {
    const r = (await this.db.execute(sql`
      SELECT DISTINCT series FROM sales.kpi_month_basis WHERE period = ${period}`)) as {
      rows: { series: string }[]
    }
    return r.rows.map((row) => row.series)
  }

  /** The seats a month's close froze, as its stored values name them. */
  async frozenSeats(period: string): Promise<{ role: RoleId; metricKey: KpiMetricKey }[]> {
    const r = (await this.db.execute(sql`
      SELECT DISTINCT role, metric_key FROM sales.kpi_month_value WHERE period = ${period}`)) as {
      rows: { role: RoleId; metric_key: KpiMetricKey }[]
    }
    return r.rows.map((row) => ({ role: row.role, metricKey: row.metric_key }))
  }

  /** Today's basis of `seats` over the month, every actor, in one statement. */
  async live(tx: Db, seats: readonly KpiSeat[], span: PeriodSpan): Promise<KpiBasisTally[]> {
    const parts = seats.map(
      (s) => sql`
        SELECT ${seriesKey(s)}::text AS series, b.actor_id::text AS actor_id, b.code::text AS code,
               min(b.kind)::text AS kind, min(b.tag)::text AS tag, count(*)::int AS n, COALESCE(sum(b.value), 0)::float8 AS sum
        FROM (${metricSql(s).basis(onlyFor())}) b GROUP BY 2, 3`,
    )
    if (parts.length === 0) return []
    const r = (await tx.execute(spanned(span, sql.join(parts, sql` UNION ALL `)))) as {
      rows: (Raw & { n: number; sum: number })[]
    }
    return r.rows.map(tally)
  }

  async frozen(tx: Db, period: string, series: readonly string[]): Promise<KpiBasisTally[]> {
    const r = (await tx.execute(sql`
      SELECT series, actor_id, code, min(kind) AS kind, min(tag) AS tag, count(*)::int AS n,
             COALESCE(sum(value), 0)::float8 AS sum
      FROM sales.kpi_month_basis
      WHERE period = ${period} AND series IN (${inList(series)})
      GROUP BY 1, 2, 3`)) as { rows: (Raw & { n: number; sum: number })[] }
    return r.rows.map(tally)
  }

  async written(tx: Db, period: string, series: readonly string[]): Promise<KpiWrittenTally[]> {
    const r = (await tx.execute(sql`
      SELECT series, actor_id, code, min(kind) AS kind, min(tag) AS tag, sum(delta)::float8 AS sum,
             (array_agg(cause ORDER BY detected_at DESC))[1] AS last
      FROM sales.kpi_adjustment
      WHERE source_period = ${period} AND series IN (${inList(series)})
      GROUP BY 1, 2, 3`)) as { rows: (Raw & { sum: number; last: KpiAdjustmentCause })[] }
    return r.rows.map((row) => ({
      series: row.series,
      actorId: row.actor_id,
      code: row.code,
      kind: row.kind,
      tag: row.tag,
      sum: Number(row.sum),
      last: row.last,
    }))
  }

  async insert(tx: Db, rows: readonly KpiAdjustmentValues[]): Promise<void> {
    if (rows.length > 0) await tx.insert(kpiAdjustment).values([...rows])
  }
}

const tally = (row: Raw & { n: number; sum: number }): KpiBasisTally => ({
  series: row.series,
  actorId: row.actor_id,
  code: row.code,
  kind: row.kind,
  tag: row.tag,
  n: Number(row.n),
  sum: Number(row.sum),
})
