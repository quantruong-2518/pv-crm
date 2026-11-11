import type { Type } from '@nestjs/common'
import type { ModuleRef } from '@nestjs/core'
import {
  KPI_METRIC_LABEL,
  type KpiForecast,
  type KpiMetricKey,
  type KpiUnit,
  type KpiVerdict,
  type RoleId,
} from '@pv/contracts'
import type { KpiCatalog } from '../kpi/kpi-config.overlay'
import { KpiConfigService } from '../kpi/kpi-config.service'
import { KpiForecastService } from '../kpi/kpi-forecast.service'
import { KpiQuarterService } from '../kpi/kpi-quarter.service'
import { vietnamToday } from '../kpi/kpi-rules'
import { KpiTeamService } from '../kpi/kpi-team.service'
import { KpiTeamViewService } from '../kpi/kpi-team-view.service'
import { KpiService } from '../kpi/kpi.service'

/** What `get_my_kpi` and `get_team_kpi` share: a KPI reading as one `trusted` object.
 *
 *  The binder prints a number by its KEY name alone, so a figure's key carries its unit:
 *  money goes under `…Money` (VND, which every KPI sum is converted to) and a ratio under
 *  `…Percent`, rescaled from the 0-1 of the wire to 0-100. A count, hours or days stay
 *  plain; `unit` beside them says which. */

/** Each service is fetched by class at call time: `KpiModule` exports none of them, and
 *  importing it would pull in its sweepers. A tool types only the methods it calls, so
 *  the company card, the targets, the history and the contributions stay out of reach. */
export const kpiServices = (modules: ModuleRef) => {
  const lazy =
    <T>(token: Type<T>) =>
    () =>
      modules.get(token, { strict: false })
  return {
    cards: lazy(KpiService),
    forecasts: lazy(KpiForecastService),
    quarters: lazy(KpiQuarterService),
    teams: lazy(KpiTeamService),
    teamViews: lazy(KpiTeamViewService),
    config: lazy(KpiConfigService),
  }
}

/** The pace of one metric as every door states it; a team's `target` is its share. */
export type Pace = {
  key: KpiMetricKey
  value: number | null
  target: number | null
  expected: number | null
  verdict: KpiVerdict
}

/** What the forecast adds to a month reading; `pipeline` is absent where the forecast has none. */
export type Ahead = Pick<KpiForecast, 'projected' | 'flag'> & { pipeline?: number }

const SUFFIX: Partial<Record<KpiUnit, string>> = { money: 'Money', ratio: 'Percent' }

/** A ratio goes from 0-1 to percent; a count is whole, so its pace is rounded too. */
const shown = (unit: KpiUnit, n: number): number =>
  unit === 'ratio' ? Math.round(n * 10_000) / 100 : unit === 'count' ? Math.round(n) : n

export const thisMonth = (): string => vietnamToday().slice(0, 7)

/** The forecast of one person's seat; a null `pipeline` (does not apply) is left out, not passed on. */
export function forecastBy(items: readonly KpiForecast[] = [], withPipeline = false) {
  const byKey = new Map(items.map((i) => [`${i.actorId}/${i.role}/${i.metricKey}`, i]))
  return (actorId: string, role: RoleId, key: KpiMetricKey): Ahead | undefined => {
    const item = byKey.get(`${actorId}/${role}/${key}`)
    return (
      item && {
        projected: item.projected,
        flag: item.flag,
        ...(withPipeline && item.pipeline !== null && { pipeline: item.pipeline }),
      }
    )
  }
}

/** Zero or one row, so a reading whose metric the catalog no longer carries is dropped. */
export function readingRow(
  catalog: KpiCatalog,
  role: RoleId,
  pace: Pace,
  ahead?: Ahead,
): { trusted: object }[] {
  const def = catalog[role].find((d) => d.key === pace.key)
  if (!def) return []
  const suffix = SUFFIX[def.unit] ?? ''
  const figures = {
    value: pace.value,
    target: pace.target,
    expected: pace.expected,
    projected: ahead?.projected,
    /* A room-scope line is the whole room's pipeline, which a stored answer cannot re-check per reader. */
    pipeline: def.unit === 'money' && def.scope === 'own' ? ahead?.pipeline : undefined,
  }
  return [
    {
      trusted: {
        role,
        metric: def.key,
        label: KPI_METRIC_LABEL[def.key],
        unit: def.unit,
        verdict: pace.verdict,
        ...(def.unit === 'money' && { currency: 'VND' }),
        ...Object.fromEntries(
          Object.entries(figures).flatMap(([name, n]) =>
            n === undefined ? [] : [[name + suffix, n === null ? n : shown(def.unit, n)]],
          ),
        ),
        ...(ahead && { flag: ahead.flag }),
      },
    },
  ]
}

export const scorecardRows = (
  catalog: KpiCatalog,
  scorecards: readonly { role: RoleId; readings: readonly Pace[] }[],
  ahead?: (role: RoleId, key: KpiMetricKey) => Ahead | undefined,
) =>
  scorecards.flatMap((card) =>
    card.readings.flatMap((r) => readingRow(catalog, card.role, r, ahead?.(card.role, r.key))),
  )
