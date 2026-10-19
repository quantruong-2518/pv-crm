import { Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import { KpiCloseResponse, RoleId, type KpiPeriodKey } from '@pv/contracts'
import { AuditRepository } from '@api/platform/audit/audit.repository'
import { toContractRole } from '@api/platform/auth/auth.mapper'
import { conflict } from '@api/platform/http/problem'
import { spansOf } from '../performance/performance-period'
import { KpiCloseRepository } from './kpi-close.repository'
import type { KpiMonthValueValues } from './kpi-close.schema'
import { KpiConfigService } from './kpi-config.service'
import { KpiReadingsRepository } from './kpi-readings.repository'
import { monthClock } from './kpi-rules'
import { toReadings, type ScoreContext } from './kpi.mapper'

/** The month close (ADR 0100 §C2): freezes every reading the month's cards show.
 *
 *  The figures go through `toReadings` — the funnel every card reads through —
 *  so what is stored is exactly what a card printed, zero-for-empty-tally
 *  included. They are read live (`values`, never `monthValues`) just before the
 *  one transaction that inserts the close row, its values and the audit line.
 *  Read outside it on purpose: READ COMMITTED has no cross-statement snapshot, one UNION ALL does.
 *  There is no unlock: nothing here updates or deletes. */
@Injectable()
export class KpiCloseService {
  constructor(
    private readonly closes: KpiCloseRepository,
    private readonly readings: KpiReadingsRepository,
    private readonly config: KpiConfigService,
    private readonly audit: AuditRepository,
  ) {}

  async close(who: Actor, period: KpiPeriodKey): Promise<KpiCloseResponse> {
    if (monthClock(period).phase !== 'closed') {
      throw conflict('Tháng này chưa kết thúc nên chưa chốt được.')
    }
    const already = conflict('Tháng này đã được chốt.')
    if (await this.closes.of(period)) throw already

    const rows = await this.frozenRows(period)
    await this.closes.run(async (tx) => {
      if (!(await this.closes.insertClose(tx, period, who.id))) throw already
      await this.closes.insertValues(tx, rows)
      await this.audit.write(
        { actorId: who.id, action: 'edit', note: JSON.stringify({ kpi: 'month-closed', period }) },
        tx,
      )
    })
    return KpiCloseResponse.parse({ period, monthClose: await this.closes.of(period) })
  }

  /** Room seats once per role, own seats once per person × role they hold. */
  private async frozenRows(period: KpiPeriodKey): Promise<KpiMonthValueValues[]> {
    const catalog = await this.config.effectiveCatalog()
    const people = await this.readings.people()
    const seats = RoleId.options.flatMap((role) => catalog[role].map((def) => ({ role, def })))
    const values = await this.readings.values(seats, spansOf(period).current)
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
}

const toNumeric = (value: number | null): string | null => (value === null ? null : String(value))
