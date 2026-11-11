import { GetMyKpiInput, quarterOf } from '@pv/contracts'
import type { Actor } from '@pv/engines'
import {
  defineTool,
  door,
  type AssistantTool,
  type ToolRead,
} from '@api/platform/assistant/assistant-tools'
import type { KpiConfigService } from '../kpi/kpi-config.service'
import { KpiForecastController } from '../kpi/kpi-forecast.controller'
import type { KpiForecastService } from '../kpi/kpi-forecast.service'
import { KpiQuarterController } from '../kpi/kpi-quarter.controller'
import type { KpiQuarterService } from '../kpi/kpi-quarter.service'
import { KpiController } from '../kpi/kpi.controller'
import type { KpiService } from '../kpi/kpi.service'
import { forecastBy, ownCatalog, scorecardRows, thisMonth } from './kpi-read'

/** `get_my_kpi`: the asker's own KPI cards for a month or the quarter around it.
 *
 *  Each door is the one the KPI screen reads, called as the asker, and the input names
 *  no person. The month adds the forecast where its door passes and leaves it out
 *  otherwise. A quarter is the month doors summed by `KpiQuarterService`, with no forecast.
 *  The doors also compute room-scope readings; the tool drops them, in a month and in a
 *  quarter, `monthOnly` included. A stored answer is replayed on `kpi.view` alone, so a
 *  room figure, which sits on `kpi.view-all`, would outlive the grant it was read under.
 *  `get_team_kpi` has that gate.
 *  A pipeline rides along only on an own-scope money line: it is the asker's own deals.
 *  Nothing here reads a content table, so nothing is audited and `codes` stays empty.
 *  The company card, the targets and the history are never called: they sit on
 *  `kpi.view-all`. */

type Services = {
  cards: () => Pick<KpiService, 'me'>
  forecasts: () => Pick<KpiForecastService, 'mine'>
  quarters: () => Pick<KpiQuarterService, 'me'>
  config: () => Pick<KpiConfigService, 'effectiveCatalog'>
}

async function run(
  services: Services,
  who: Actor,
  input: GetMyKpiInput,
  open: ReadonlySet<string>,
): Promise<ToolRead> {
  const month = input.at ?? thisMonth()
  if (input.period === 'quarter') {
    const [quarter, wide] = await Promise.all([
      services.quarters().me(who, quarterOf(month)),
      services.config().effectiveCatalog(),
    ])
    const catalog = ownCatalog(wide)
    const rows = scorecardRows(catalog, quarter.scorecards)
    return {
      data: {
        kpi: {
          trusted: {
            period: quarter.quarter,
            monthOnly: [
              ...new Set(
                quarter.scorecards.flatMap((card) =>
                  card.monthOnly.filter((key) => catalog[card.role].some((d) => d.key === key)),
                ),
              ),
            ],
          },
          rows,
        },
      },
      codes: [],
      rowCount: rows.length,
      hidden: null,
      revealsContent: rows.length > 0,
    }
  }
  const [card, forecast, wide] = await Promise.all([
    services.cards().me(who, month),
    open.has('forecast') ? services.forecasts().mine(who, month) : null,
    services.config().effectiveCatalog(),
  ])
  const ahead = forecastBy(forecast?.items, true)
  const rows = scorecardRows(ownCatalog(wide), card.scorecards, (role, key) =>
    ahead(who.id, role, key),
  )
  return {
    data: { kpi: { trusted: { period: card.period }, rows } },
    codes: [],
    rowCount: rows.length,
    hidden: null,
    revealsContent: rows.length > 0,
  }
}

export const getMyKpi = (services: Services): AssistantTool =>
  defineTool({
    name: 'get_my_kpi',
    description:
      "The asker's own KPI for a month or for a quarter, as value, target, pace and verdict per metric of each role they hold that counts their own work, with the forecast for a month; room-wide metrics are not in it; at is any month inside the period asked, and absent means this month.",
    input: GetMyKpiInput,
    doors: {
      me: door(KpiController, 'me'),
      forecast: door(KpiForecastController, 'mine'),
      quarter: door(KpiQuarterController, 'me'),
    },
    doorFor: (input) => (input.period === 'month' ? ['me', 'forecast'] : ['quarter']),
    reveals: 'kpi.view',
    run: (who, input, open) => run(services, who, input, open),
  })
