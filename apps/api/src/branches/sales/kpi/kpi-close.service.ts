import { Injectable, Logger } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  KpiCloseResponse,
  RoleId,
  type KpiCloseGateSnapshot,
  type KpiPeriodKey,
} from '@pv/contracts'
import { AuditRepository } from '@api/platform/audit/audit.repository'
import { toContractRole } from '@api/platform/auth/auth.mapper'
import type { Db } from '@api/platform/db/db.module'
import { conflict } from '@api/platform/http/problem'
import { spansOf } from '../performance/performance-period'
import type { KpiCatalog } from './kpi-config.overlay'
import { KpiCloseGateService } from './kpi-close-gate.service'
import { KpiCloseRepository } from './kpi-close.repository'
import type { KpiMonthValueValues } from './kpi-close.schema'
import { KpiConfigService } from './kpi-config.service'
import { KpiReadingsRepository, type KpiPerson, type KpiValues } from './kpi-readings.repository'
import { KpiReconcileService } from './kpi-reconcile.service'
import { monthClock } from './kpi-rules'
import { toReadings, type ScoreContext } from './kpi.mapper'

/** The month close (ADR 0100 §C2, 0115 §1): freezes every reading the month's
 *  cards show and every basis row behind them.
 *
 *  One transaction inserts the close row with the gate snapshot (ADR 0116),
 *  copies the basis, folds the figures from that copy (plus adjustments landed
 *  in the month) and stores them with the audit line — so the frozen card is
 *  what its frozen list adds up to.
 *  The figures go through `toReadings`, the funnel every card reads through, so
 *  what is stored is exactly what a card printed, zero-for-empty-tally included.
 *  The reconcile pass runs once after the commit; a fresh close leaves it nothing.
 *  There is no unlock: nothing here updates or deletes. */
@Injectable()
export class KpiCloseService {
  private readonly log = new Logger('sales.kpi')

  constructor(
    private readonly closes: KpiCloseRepository,
    private readonly readings: KpiReadingsRepository,
    private readonly config: KpiConfigService,
    private readonly audit: AuditRepository,
    private readonly reconcile: KpiReconcileService,
    private readonly gate: KpiCloseGateService,
  ) {}

  async close(who: Actor, period: KpiPeriodKey): Promise<KpiCloseResponse> {
    if (monthClock(period).phase !== 'closed') {
      throw conflict('Tháng này chưa kết thúc nên chưa chốt được.')
    }
    const already = conflict('Tháng này đã được chốt.')
    if (await this.closes.of(period)) throw already

    const [catalog, people] = await Promise.all([
      this.config.effectiveCatalog(),
      this.readings.people(),
    ])
    const seats = RoleId.options.flatMap((role) => catalog[role].map((def) => ({ role, def })))
    const span = spansOf(period).current
    await this.closes.run(async (tx) => {
      const gate = await this.gateAtClose(tx, period)
      if (!(await this.closes.insertClose(tx, period, who.id, gate))) throw already
      await this.closes.insertBasis(tx, seats, span)
      const values = await this.readings.closingValues(tx, seats, span)
      await this.closes.insertValues(tx, frozenRows(period, catalog, people, values))
      await this.audit.write(
        { actorId: who.id, action: 'edit', note: JSON.stringify({ kpi: 'month-closed', period }) },
        tx,
      )
    })
    /* The close stands either way; the daily sweep runs the same pass again. */
    await this.reconcile.month(period).catch((error: unknown) => {
      this.log.error(`KPI reconcile after closing ${period} failed: ${String(error)}`)
    })
    return KpiCloseResponse.parse({ period, monthClose: await this.closes.of(period) })
  }

  /** The system's gate at close (ADR 0116 §3), read in a savepoint so a
   *  failed statement cannot poison the close's transaction: on any failure it
   *  is logged, no snapshot is stored, and the close still commits. */
  private async gateAtClose(tx: Db, period: KpiPeriodKey): Promise<KpiCloseGateSnapshot | null> {
    try {
      return await this.closes.nested(tx, (inner) => this.gate.snapshot(inner, period))
    } catch (error: unknown) {
      this.log.error(`KPI close gate of ${period} not stored: ${String(error)}`)
      return null
    }
  }
}

/** Room seats once per role, own seats once per person × role they hold. */
function frozenRows(
  period: KpiPeriodKey,
  catalog: KpiCatalog,
  people: readonly KpiPerson[],
  values: KpiValues,
): KpiMonthValueValues[] {
  const ctx: ScoreContext = {
    catalog,
    values,
    slots: new Map(),
    elapsed: 1,
    running: false,
    tolerance: 0,
  }
  const holders = (role: RoleId) =>
    people.filter((p) => p.roleIds.map(toContractRole).includes(role))

  return RoleId.options.flatMap((role) => {
    /* `toReadings` answers the whole catalog in order, so `i` finds the def. */
    const seatsOf = (actorId: string | null, scope: 'room' | 'own') =>
      toReadings(role, actorId ?? '', ctx).flatMap((r, i) =>
        catalog[role][i]?.scope === scope
          ? [{ period, role, actorId, metricKey: r.key, value: toNumeric(r.value) }]
          : [],
      )
    return [...seatsOf(null, 'room'), ...holders(role).flatMap((p) => seatsOf(p.id, 'own'))]
  })
}

const toNumeric = (value: number | null): string | null => (value === null ? null : String(value))
