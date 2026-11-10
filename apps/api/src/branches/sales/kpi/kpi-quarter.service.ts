import { Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  isCumulative,
  KpiQuarterMeResponse,
  quarterMonths,
  type KpiMeResponse,
  type KpiQuarterKey,
  type KpiQuarterMonthReading,
  type KpiQuarterReading,
  type KpiQuarterScorecard,
  type KpiMetricDef,
} from '@pv/contracts'
import { spansOf } from '../performance/performance-period'
import { KpiConfigService } from './kpi-config.service'
import { vietnamToday } from './kpi-rules'
import { elapsedOf, expectedOf, phaseOf, verdictOf } from './kpi-verdict'
import { KpiService } from './kpi.service'

const DAY_MS = 86_400_000

/** A quarter is read as the sum of its three monthly readings (ADR 0146).
 *
 *  Nothing is recomputed: a month frozen by month close carries its frozen
 *  value, any other month its live value (with the adjustments of ADR 0115),
 *  and either way the month door's `value` is summed as is, so nothing is
 *  counted twice. Read-only: no alert, no audit row, no
 *  verdict stored; alerts and month verdicts stay monthly. */
@Injectable()
export class KpiQuarterService {
  constructor(
    private readonly kpi: KpiService,
    private readonly config: KpiConfigService,
  ) {}

  async me(who: Actor, quarter: KpiQuarterKey): Promise<KpiQuarterMeResponse> {
    const keys = quarterMonths(quarter)
    const today = vietnamToday()
    /* One connection under PGlite: the months are read in turn, not together. */
    const months: KpiMeResponse[] = []
    for (const period of keys) months.push(await this.kpi.me(who, period))
    const [catalog, tolerance] = await Promise.all([
      this.config.effectiveCatalog(),
      this.config.tolerance(),
    ])
    const { from, to } = spansOf(quarter).current
    const elapsed = elapsedOf(from, to, today)
    const days = (Date.parse(to) - Date.parse(from)) / DAY_MS

    const scorecards = (months[0]?.scorecards ?? []).map((card): KpiQuarterScorecard => {
      const defs = catalog[card.role]
      const readings = defs.filter(isCumulative).map((def): KpiQuarterReading => {
        const perMonth = keys.map((period, i): KpiQuarterMonthReading => {
          const r = months[i]?.scorecards
            .find((c) => c.role === card.role)
            ?.readings.find((x) => x.key === def.key)
          return { period, value: r?.value ?? null, target: r?.target ?? null }
        })
        return this.quarterReading(def, perMonth, elapsed, tolerance)
      })
      return {
        role: card.role,
        readings,
        monthOnly: defs.filter((d) => !isCumulative(d)).map((d) => d.key),
      }
    })

    return KpiQuarterMeResponse.parse({
      quarter,
      months: keys.map((period) => {
        const span = spansOf(period).current
        return { period, phase: phaseOf(span.from, span.to, today) }
      }),
      daysGone: Math.round(elapsed * days),
      days,
      scorecards,
    })
  }

  /** The quarter target stays unset unless all three months agreed one: a
   *  partial sum would be judged as if the missing month asked for nothing. */
  private quarterReading(
    def: KpiMetricDef,
    months: KpiQuarterMonthReading[],
    elapsed: number,
    tolerance: number,
  ): KpiQuarterReading {
    const value = months.reduce((sum, m) => sum + (m.value ?? 0), 0)
    const target = months.some((m) => m.target === null)
      ? null
      : months.reduce((sum, m) => sum + (m.target ?? 0), 0)
    return {
      key: def.key,
      value,
      target,
      expected: expectedOf(target, def, elapsed),
      verdict: verdictOf(value, target, def, elapsed, tolerance),
      months,
    }
  }
}
