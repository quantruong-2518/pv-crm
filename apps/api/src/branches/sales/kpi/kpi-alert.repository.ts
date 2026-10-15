import { Inject, Injectable } from '@nestjs/common'
import { DB, type Db } from '@api/platform/db/db.module'
import { kpiAlertSent, type KpiAlertSentValues } from './kpi-config.schema'

export type KpiAlertKey = Pick<
  KpiAlertSentValues,
  'period' | 'actorId' | 'role' | 'metricKey' | 'flag'
>

/** SQL of `sales.kpi_alert_sent`, the forecast sweep's memory (ADR 0099 §4).
 *  Decides nothing: which forecast counts as an alert is the sweeper's. */
@Injectable()
export class KpiAlertRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  run<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(tx))
  }

  /** The alerts this call is first to record. One statement, so two sweeps
   *  racing on one key cannot both get it back: the loser waits on the
   *  winner's row and conflicts once it commits. */
  async claim(tx: Db, keys: readonly KpiAlertKey[]): Promise<KpiAlertKey[]> {
    if (keys.length === 0) return []
    return tx
      .insert(kpiAlertSent)
      .values([...keys])
      .onConflictDoNothing()
      .returning({
        period: kpiAlertSent.period,
        actorId: kpiAlertSent.actorId,
        role: kpiAlertSent.role,
        metricKey: kpiAlertSent.metricKey,
        flag: kpiAlertSent.flag,
      })
  }
}
