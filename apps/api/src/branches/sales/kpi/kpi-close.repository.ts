import { eq } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type { KpiMonthClose } from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import { kpiMonthClose, kpiMonthValue, type KpiMonthValueValues } from './kpi-close.schema'

/** SQL of the two month-close tables: who closed a month, and its frozen
 *  figures. Decides nothing — whether a month may close is the service's. */
@Injectable()
export class KpiCloseRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  run<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(tx))
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
      .values({ period, closedById })
      .onConflictDoNothing()
      .returning({ period: kpiMonthClose.period })
    return made.length === 1
  }

  async insertValues(tx: Db, rows: readonly KpiMonthValueValues[]): Promise<void> {
    if (rows.length > 0) await tx.insert(kpiMonthValue).values([...rows])
  }
}
