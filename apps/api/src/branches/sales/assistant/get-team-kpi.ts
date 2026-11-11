import { GetTeamKpiInput, type KpiPerson, type KpiTeamViewResponse } from '@pv/contracts'
import type { Actor } from '@pv/engines'
import {
  defineTool,
  door,
  type AssistantTool,
  type ToolRead,
} from '@api/platform/assistant/assistant-tools'
import { denied } from '@api/platform/http/problem'
import type { KpiCatalog } from '../kpi/kpi-config.overlay'
import type { KpiConfigService } from '../kpi/kpi-config.service'
import { KpiForecastController } from '../kpi/kpi-forecast.controller'
import type { KpiForecastService } from '../kpi/kpi-forecast.service'
import { KpiTeamController } from '../kpi/kpi-team.controller'
import type { KpiTeamService } from '../kpi/kpi-team.service'
import { KpiTeamViewController } from '../kpi/kpi-team-view.controller'
import type { KpiTeamViewService } from '../kpi/kpi-team-view.service'
import { KpiController } from '../kpi/kpi.controller'
import type { KpiService } from '../kpi/kpi.service'
import { forecastBy, readingRow, scorecardRows, thisMonth } from './kpi-read'

/** `get_team_kpi`: everyone's KPI cards for a month, or one team's members and total.
 *
 *  Only a holder of `kpi.view-all` reads it (owner decision): the team door alone admits
 *  a team lead, so `people` must be open or the call is refused. A named team is matched
 *  against the roster of that month; with no match the team names come back and no
 *  figure does. People behind or missed on their primary metric come first and carry
 *  `behind`; the list is cut at `TEAM_LIST`. No pipeline is read at all: a stored answer
 *  cannot tell whose pipeline it held, and `reveals` cannot express ADR 0143 section 5.
 *  The company card, the targets, the history and the contributions are never called. */

/** People per call: a longer list says `more` and the model asks for a team. */
const TEAM_LIST = 20

/** Primary as the effective catalog says, since the config can move it off the default. */
const isBehind = (p: KpiPerson, catalog: KpiCatalog): boolean =>
  p.scorecards.some((card) =>
    card.readings.some(
      (r) =>
        (r.verdict === 'behind' || r.verdict === 'missed') &&
        catalog[card.role].some((d) => d.key === r.key && d.primary),
    ),
  )

type Services = {
  cards: () => Pick<KpiService, 'people'>
  forecasts: () => Pick<KpiForecastService, 'everyone'>
  teams: () => Pick<KpiTeamService, 'read'>
  teamViews: () => Pick<KpiTeamViewService, 'view'>
  config: () => Pick<KpiConfigService, 'effectiveCatalog'>
}

/** The roster keeps names without the Vietnamese word for "team" (`KpiTeamBody`), but people say it. */
const teamKey = (name: string): string =>
  name
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replace(/^nhóm\s+/u, '')

async function run(
  services: Services,
  who: Actor,
  input: GetTeamKpiInput,
  open: ReadonlySet<string>,
): Promise<ToolRead> {
  if (!open.has('people')) throw denied('permission-denied')
  const period = input.at ?? thisMonth()
  let people: readonly KpiPerson[]
  let team: KpiTeamViewResponse | null = null
  if (input.team === undefined) {
    people = (await services.cards().people(period)).people
  } else {
    if (!open.has('roster') || !open.has('team')) throw denied('permission-denied')
    const { teams } = await services.teams().read(who, period)
    const wanted = teamKey(input.team)
    const found = teams.find((t) => teamKey(t.name) === wanted)
    if (!found) {
      return {
        data: {
          teamNotFound: true,
          teams: { rows: teams.map((t) => ({ untrusted: { name: t.name } })) },
        },
        codes: [],
        rowCount: teams.length,
        hidden: null,
        revealsContent: teams.length > 0,
      }
    }
    team = await services.teamViews().view(who, period, found.id)
    people = team.people
  }
  const [catalog, forecast] = await Promise.all([
    services.config().effectiveCatalog(),
    open.has('forecastAll') ? services.forecasts().everyone(period, who) : null,
  ])
  const ahead = forecastBy(forecast?.items)
  const ranked = people
    .map((p) => ({ p, behind: isBehind(p, catalog) }))
    .sort((a, b) => Number(b.behind) - Number(a.behind))
  const rows = ranked.slice(0, TEAM_LIST).map(({ p, behind }) => ({
    untrusted: { name: p.name },
    trusted: { behind },
    readings: scorecardRows(catalog, p.scorecards, (role, key) => ahead(p.actorId, role, key)),
  }))
  /* A ratio, hours or days has no team total: the page shows members only. */
  const total = (team?.readings ?? [])
    .filter((r) => r.value !== null || r.share !== null)
    .flatMap((r) =>
      readingRow(catalog, r.role, {
        key: r.metricKey,
        value: r.value,
        target: r.share,
        expected: r.expected,
        verdict: r.verdict,
      }),
    )
  return {
    data: {
      kpi: { trusted: { period, more: ranked.length > TEAM_LIST }, rows },
      ...(team && { team: { untrusted: { name: team.team.name }, rows: total } }),
    },
    codes: [],
    rowCount: rows.length,
    hidden: null,
    revealsContent: team !== null || rows.length > 0,
  }
}

export const getTeamKpi = (services: Services): AssistantTool =>
  defineTool({
    name: 'get_team_kpi',
    description:
      "Everyone's KPI for a month, as value, target, pace and verdict per person and metric with the people behind first, or one named team's members and total; at is a month and absent means this month.",
    input: GetTeamKpiInput,
    doors: {
      people: door(KpiController, 'people'),
      forecastAll: door(KpiForecastController, 'everyone'),
      roster: door(KpiTeamController, 'read'),
      team: door(KpiTeamViewController, 'read'),
    },
    doorFor: (input) =>
      input.team === undefined
        ? ['people', 'forecastAll']
        : ['people', 'forecastAll', 'roster', 'team'],
    reveals: 'kpi.view-all',
    run: (who, input, open) => run(services, who, input, open),
  })
