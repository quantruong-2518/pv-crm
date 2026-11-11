import { KpiPeriodKey, quarterOf } from '@pv/contracts'
import { vietnamToday } from '@api/branches/sales/kpi/kpi-rules'
import type { Ask } from './scope-door'

/** How the KPI doors are asked as a seat; each entry calls the service its controller does.
 *  KPI answers carry no record code, so no entry names one.
 *
 *  The keys are the two tools' own: `get_my_kpi` has me, forecast and quarter;
 *  `get_team_kpi` has people, forecastAll, roster and team. A team is told by its
 *  name (see `nameKey`), and a call naming none never asks the `team` door. */

const monthOf = (input: unknown): KpiPeriodKey => {
  const given = (input as { at?: string } | undefined)?.at
  return KpiPeriodKey.parse(given ?? vietnamToday().slice(0, 7))
}

/* A team is told without its leading Vietnamese word for "team", in any case, NFC and trimmed. */
const nameKey = (name: string): string =>
  name
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replace(/^nhóm\s+/, '')

const reading = async (body: unknown) => ({ body, codes: [] as string[] })

export const KPI_ASK: Record<string, Ask> = {
  me: async (world, who, _on, input) => reading(await world.kpi.me(who, monthOf(input))),
  forecast: async (world, who, _on, input) =>
    reading(await world.kpiForecasts.mine(who, monthOf(input))),
  quarter: async (world, who, _on, input) =>
    reading(await world.kpiQuarters.me(who, quarterOf(monthOf(input)))),
  people: async (world, _who, _on, input) => reading(await world.kpi.people(monthOf(input))),
  forecastAll: async (world, who, _on, input) =>
    reading(await world.kpiForecasts.everyone(monthOf(input), who)),
  roster: async (world, who, _on, input) => reading(await world.kpiTeams.read(who, monthOf(input))),
  /* A name the roster does not carry is an answer, not a refusal: the tool says so too. */
  team: async (world, who, _on, input) => {
    const period = monthOf(input)
    const wanted = nameKey((input as { team?: string }).team ?? '')
    const { teams } = await world.kpiTeams.read(who, period)
    const found = teams.find((t) => nameKey(t.name) === wanted)
    if (!found) return reading({ teamNotFound: true })
    return reading(await world.kpiTeamViews.view(who, period, found.id))
  },
}
