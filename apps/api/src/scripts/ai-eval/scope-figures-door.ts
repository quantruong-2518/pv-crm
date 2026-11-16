import {
  GetPerformanceInput,
  IndustryReportQuery,
  LeadFacetsQuery,
  LeadSourceStatsQuery,
  OpportunityFacetsQuery,
  salesPeriodOf,
  vnDayOf,
  WorkstreamScorecardQuery,
  type CountRecordsInput,
} from '@pv/contracts'
import { zod } from '@api/platform/http/zod.pipe'
import type { Ask } from './scope-door'

/** How the doors behind `get_performance` and `count_records` are asked as a seat; each
 *  entry calls the service its controller does. Neither tool names a record, so no
 *  entry gives a code.
 *
 *  `count_records` has a `leads` key of its own, which is not the one `list_customers`
 *  has: its entries are written `count_records:…`, so the lookup never falls back
 *  to the other tool's door. */

const reading = (body: unknown) => ({ body, codes: [] as string[] })

/** The period the tool reads when `at` is absent: the running one, on the Vietnam calendar. */
export const periodOf = (input: unknown) => {
  const { grain, at } = GetPerformanceInput.parse(input)
  return at ?? salesPeriodOf(grain, vnDayOf(new Date()))
}

const counted = (input: unknown) => input as CountRecordsInput
const empty = <T>(parse: { transform: (v: object) => T }): T => parse.transform({})

export const FIGURES_ASK: Record<string, Ask> = {
  'get_performance:figures': async (world, _who, _on, input) =>
    reading(await world.performance.read(periodOf(input))),
  'get_performance:exits': async (world, _who, _on, input) =>
    reading(await world.performance.exits(periodOf(input))),
  'get_performance:money': async (world, who, _on, input) =>
    reading(await world.performanceMoney.read(who, periodOf(input))),
  'get_performance:industries': async (world, _who, _on, input) => {
    const { grain } = GetPerformanceInput.parse(input)
    const q = zod(IndustryReportQuery).transform({ period: grain })
    return reading(await world.industries.read(q.period))
  },
  'count_records:leads': async (world, who) =>
    reading(await world.leads.facets(who, empty(zod(LeadFacetsQuery)))),
  'count_records:deals': async (world, who) =>
    reading(await world.opportunities.facets(who, empty(zod(OpportunityFacetsQuery)))),
  'count_records:journeys': async (world, who) =>
    reading(await world.workstreams.scorecard(who, empty(zod(WorkstreamScorecardQuery)))),
  'count_records:lead-sources': async (world, who, _on, input) => {
    const { from, to } = counted(input)
    const q = { ...(from !== undefined && { from }), ...(to !== undefined && { to }) }
    return reading(await world.leadOrigins.sourceStats(who, zod(LeadSourceStatsQuery).transform(q)))
  },
}
