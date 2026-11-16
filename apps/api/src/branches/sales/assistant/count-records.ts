import {
  CountRecordsInput,
  LEAD_SIDE_LABEL,
  LEAD_STATE_LABEL,
  LeadFacetsQuery,
  LeadSourceStatsQuery,
  LeadState,
  MOTION_LABEL,
  OPPORTUNITY_STAGE_LABEL,
  OPPORTUNITY_STATE_LABEL,
  OpportunityFacetsQuery,
  OpportunityStatus,
  StageKey,
  WorkstreamScorecardQuery,
} from '@pv/contracts'
import type { Actor, Permission } from '@pv/engines'
import {
  defineTool,
  door,
  type AssistantTool,
  type ToolRead,
} from '@api/platform/assistant/assistant-tools'
import { zod } from '@api/platform/http/zod.pipe'
import { LeadSourceStatsController } from '../lead-origin/lead-origin.controller'
import type { LeadOriginService } from '../lead-origin/lead-origin.service'
import { LeadController } from '../lead/lead.controller'
import type { LeadService } from '../lead/lead.service'
import { OpportunityController } from '../opportunity/opportunity.controller'
import type { OpportunityService } from '../opportunity/opportunity.service'
import { WorkstreamController } from '../workstream/workstream.controller'
import type { WorkstreamService } from '../workstream/workstream.service'

/** `count_records`: how many leads, deals, journeys and lead sources the asker may see now (ADR 0155).
 *
 *  Only doors that cut rows to the asker's scope (`scoped: true`) are read, each with an empty
 *  filter, so a count is the asker's whole visible book.
 *  The facets' filter-choice lists (owners, labels, provinces) are dropped. A held lead or
 *  deal is counted in `held` and in no state. Whole-book scorecards are never called:
 *  they ignore the asker's scope. State labels come from the contract's maps; journey
 *  rungs and source names are config text, so they go under `untrusted`. */

/** Source rows per call; past it `more` is true. */
export const SOURCE_ROWS = 40

const NEED = {
  leads: 'lead.view',
  deals: 'opportunity.view',
  journeys: 'workstream.view',
  'lead-sources': 'campaign.view',
} as const satisfies Record<CountRecordsInput['of'], Permission>

type Services = {
  leads: Pick<LeadService, 'facets'>
  deals: Pick<OpportunityService, 'facets'>
  journeys: Pick<WorkstreamService, 'scorecard'>
  sources: () => Pick<LeadOriginService, 'sourceStats'>
}

const counted = <K extends string>(
  keys: readonly K[],
  by: Record<K, number>,
  label: Record<K, string>,
) => ({
  rows: keys.map((k) => ({ trusted: { name: label[k], count: by[k] ?? 0 } })),
})

const sum = (by: Record<string, number>): number => Object.values(by).reduce((a, n) => a + n, 0)

const read = (data: object, rowCount: number): ToolRead => ({
  data,
  codes: [],
  rowCount,
  hidden: null,
  revealsContent: true,
})

async function run(services: Services, who: Actor, input: CountRecordsInput): Promise<ToolRead> {
  switch (input.of) {
    case 'leads': {
      const f = await services.leads.facets(who, zod(LeadFacetsQuery).transform({}))
      return read(
        {
          leads: {
            /* The book's "all" tab: held leads sit in no state, and the tab adds them. */
            trusted: { total: sum(f.byState) + f.held, held: f.held },
            byState: counted(LeadState.options, f.byState, LEAD_STATE_LABEL),
          },
        },
        LeadState.options.length,
      )
    }
    case 'deals': {
      const f = await services.deals.facets(who, zod(OpportunityFacetsQuery).transform({}))
      return read(
        {
          deals: {
            /* The book's "all" tab: a held deal is off the board, so the tab leaves it out. */
            trusted: { total: sum(f.byState), held: f.held },
            byState: counted(OpportunityStatus.options, f.byState, OPPORTUNITY_STATE_LABEL),
            byStage: counted(StageKey.options, f.byStage, OPPORTUNITY_STAGE_LABEL),
          },
        },
        OpportunityStatus.options.length + StageKey.options.length,
      )
    }
    case 'journeys': {
      const s = await services.journeys.scorecard(who, zod(WorkstreamScorecardQuery).transform({}))
      return read(
        {
          journeys: {
            trusted: { overdue: s.overdue, won: s.won, stopped: s.stopped },
            stages: {
              rows: s.stages.map((g) => ({
                trusted: { kind: g.kind, count: g.count },
                untrusted: { label: g.label },
              })),
            },
          },
        },
        s.stages.length,
      )
    }
    case 'lead-sources': {
      const q = {
        ...(input.from !== undefined && { from: input.from }),
        ...(input.to !== undefined && { to: input.to }),
      }
      const { rows } = await services
        .sources()
        .sourceStats(who, zod(LeadSourceStatsQuery).transform(q))
      const shown = rows.slice(0, SOURCE_ROWS).map((r) => ({
        trusted: {
          side: r.side && LEAD_SIDE_LABEL[r.side],
          motion: r.motion && MOTION_LABEL[r.motion],
          leads: r.leads,
          mql: r.mql,
          sql: r.sql,
          deals: r.deals,
          won: r.won,
        },
        untrusted: { origin: r.originName, campaign: r.campaignName },
      }))
      return read(
        { sources: { trusted: { more: rows.length > shown.length }, rows: shown } },
        shown.length,
      )
    }
  }
}

export const countRecords = (services: Services): AssistantTool =>
  defineTool({
    name: 'count_records',
    description:
      'How many leads, opportunities, journeys or lead sources the asker may see right now, as counts per state, stage or source; it counts what the asker may open, never the whole company; from and to are days and only for lead-sources.',
    input: CountRecordsInput,
    doors: {
      leads: door(LeadController, 'facets'),
      deals: door(OpportunityController, 'facets'),
      journeys: door(WorkstreamController, 'scorecard'),
      'lead-sources': door(LeadSourceStatsController, 'stats'),
    },
    doorFor: (input) => input.of,
    reveals: (input) => NEED[input.of],
    /* Every count is the asker's own book. */
    scopeCut: () => true,
    run: (who, input) => run(services, who, input),
  })
