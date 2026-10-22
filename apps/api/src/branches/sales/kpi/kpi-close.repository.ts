import { eq, sql } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type { KpiMonthClose } from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import type { PeriodSpan } from '../performance/performance-period'
import { kpiMonthClose, kpiMonthValue, type KpiMonthValueValues } from './kpi-close.schema'
import { metricSql, onlyFor, seriesKey, spanned, type KpiSeat } from './kpi-readings.repository'
import { holdReconcileLock } from './kpi-reconcile.repository'

/** SQL of the month-close tables: who closed a month, its frozen figures and
 *  its frozen basis. Decides nothing — whether a month may close is the service's. */
@Injectable()
export class KpiCloseRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Under the reconcile's lock: the close folds the month's adjustments. */
  run<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      await holdReconcileLock(tx)
      return work(tx)
    })
  }

  /** `null` = the month is live. */
  async of(period: string, handle: Db = this.db): Promise<KpiMonthClose> {
    const [row] = await handle
      .select({ at: kpiMonthClose.closedAt, id: actor.id, name: actor.name })
      .from(kpiMonthClose)
      .innerJoin(actor, eq(actor.id, kpiMonthClose.closedById))
      .where(eq(kpiMonthClose.period, period))
    return row ? { closedAt: row.at.toISOString(), closedBy: { id: row.id, name: row.name } } : null
  }

  /** `false` when another close landed first — the primary key answers it. */
  async insertClose(tx: Db, period: string, closedById: string): Promise<boolean> {
    const made = await tx
      .insert(kpiMonthClose)
      .values({ period, closedById, basisFrozen: true })
      .onConflictDoNothing()
      .returning({ period: kpiMonthClose.period })
    return made.length === 1
  }

  async insertValues(tx: Db, rows: readonly KpiMonthValueValues[]): Promise<void> {
    if (rows.length > 0) await tx.insert(kpiMonthValue).values([...rows])
  }

  /** Every actor's basis rows of every series in `seats`, copied by one
   *  INSERT … SELECT so the rows never leave Postgres and the copy is one
   *  snapshot. Seats sharing a series are copied once. */
  async insertBasis(tx: Db, seats: readonly KpiSeat[], span: PeriodSpan): Promise<void> {
    const wanted = new Map(seats.map((s) => [seriesKey(s), s]))
    const parts = [...wanted].map(
      ([series, s]) => sql`
        SELECT ${span.key}::text, ${series}::text, b.actor_id::text, b.kind::text, b.code::text,
               b.at, b.value::numeric, b.tag::text
        FROM (${metricSql(s).basis(onlyFor())}) b`,
    )
    if (parts.length === 0) return
    await tx.execute(sql`
      INSERT INTO sales.kpi_month_basis (period, series, actor_id, kind, code, at, value, tag)
      ${spanned(span, sql.join(parts, sql` UNION ALL `))}`)
  }
}
