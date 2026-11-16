import {
  LEAD_SIDE_LABEL,
  LEAD_STATE_LABEL,
  LeadState,
  MOTION_LABEL,
  OPPORTUNITY_STAGE_LABEL,
  OPPORTUNITY_STATE_LABEL,
  OpportunityFacetsQuery,
  OpportunityStatus,
  StageKey,
  vnDayOf,
  type LeadFacets,
  type LeadSourceStatsResponse,
  type OpportunityFacetsResponse,
  type WorkstreamScorecard,
} from '@pv/contracts'
import { LeadSourceStatsController } from '@api/branches/sales/lead-origin/lead-origin.controller'
import { LeadController } from '@api/branches/sales/lead/lead.controller'
import { OpportunityController } from '@api/branches/sales/opportunity/opportunity.controller'
import { WorkstreamController } from '@api/branches/sales/workstream/workstream.controller'
import { zod } from '@api/platform/http/zod.pipe'
import { releaseHour, runTurn } from './bench'
import type { Check, Tally } from './report'
import { dig, gateLinesOnly, seatOf, toolBody, without } from './scope-customers-oracle'
import { canariesIn, doorId } from './scope-door'
import { runFigureCell, type FigureCell, type Shape } from './scope-figures-oracle'
import { replayToReviewers } from './scope-figures-replay'
import { reload } from './scope-kpi'
import { parrot } from './scripted-client'
import { COUNT_CELLS, NAMED_SEATS, ROLE_SEATS, scopedSeatId, wideSeatId } from './seed-data'
import type { World } from './world'

/** `count_records`, seat by seat: each role (own-only and wide) over the four kinds, a range
 *  of lead sources, then seats whose grant was cut or never given. Each answer is the door's
 *  own counts under their state names. The doors cut rows to the seat's scope, so an own-only
 *  seller counts fewer than the wide one, and none of the filter-choice lists the facets carry
 *  (owners, company names, labels) may reach the request. The lead book's "all" tab is the
 *  states plus the held; the deal book's leaves the held out (`apps/web`, `tabCount`, `stateTabs`). */

export const GROUP = 'scope-counts'
const CALL = 'count_records'
const KINDS = ['leads', 'deals', 'journeys', 'lead-sources'] as const
/* Typed here, not imported: the cap of the tool is what is under test. */
const SOURCE_ROWS = 40

const ID = {
  leads: doorId([LeadController, 'facets']),
  deals: doorId([OpportunityController, 'facets']),
  journeys: doorId([WorkstreamController, 'scorecard']),
  sources: doorId([LeadSourceStatsController, 'stats']),
}

const sum = (by: Record<string, number>) => Object.values(by).reduce((a, n) => a + n, 0)

const named = <K extends string>(
  keys: readonly K[],
  by: Record<K, number>,
  label: Record<K, string>,
) => ({
  rows: keys.map((k) => ({ trusted: { name: label[k], count: by[k] ?? 0 } })),
})

const SHAPES: Record<string, Shape> = {
  leads: (bodies) => {
    const f = bodies[ID.leads] as LeadFacets
    const byState = named(LeadState.options, f.byState, LEAD_STATE_LABEL)
    const trusted = { total: sum(f.byState) + f.held, held: f.held }
    return { out: { leads: { trusted, byState } }, rowCount: byState.rows.length }
  },
  deals: (bodies) => {
    const f = bodies[ID.deals] as OpportunityFacetsResponse
    const byState = named(OpportunityStatus.options, f.byState, OPPORTUNITY_STATE_LABEL)
    const byStage = named(Object.keys(f.byStage) as StageKey[], f.byStage, OPPORTUNITY_STAGE_LABEL)
    const trusted = { total: sum(f.byState), held: f.held }
    return {
      out: { deals: { trusted, byState, byStage } },
      rowCount: byState.rows.length + byStage.rows.length,
    }
  },
  journeys: (bodies) => {
    const s = bodies[ID.journeys] as WorkstreamScorecard
    const rows = s.stages.map((g) => ({
      trusted: { kind: g.kind, count: g.count },
      untrusted: { label: g.label },
    }))
    const trusted = { overdue: s.overdue, won: s.won, stopped: s.stopped }
    return { out: { journeys: { trusted, stages: { rows } } }, rowCount: rows.length }
  },
  'lead-sources': (bodies) => {
    const { rows } = bodies[ID.sources] as LeadSourceStatsResponse
    const shown = rows.slice(0, SOURCE_ROWS).map((r) => ({
      trusted: {
        side: r.side ? LEAD_SIDE_LABEL[r.side] : r.side,
        motion: r.motion ? MOTION_LABEL[r.motion] : r.motion,
        leads: r.leads,
        mql: r.mql,
        sql: r.sql,
        deals: r.deals,
        won: r.won,
      },
      untrusted: { origin: r.originName, campaign: r.campaignName },
    }))
    const trusted = { more: rows.length > shown.length }
    return { out: { sources: { trusted, rows: shown } }, rowCount: shown.length }
  },
}

const shapeOf: Shape = (bodies, input) => {
  const shape = SHAPES[String(input.of)]
  if (!shape) throw new Error(`no shape for ${String(input.of)}`)
  return shape(bodies, input)
}

const call = (of: string, range: Record<string, string> = {}) => ({
  name: CALL,
  input: { of, ...range },
})

export function countCells(): FigureCell[] {
  const cells: FigureCell[] = []
  for (const who of ROLE_SEATS) {
    for (const of of KINDS) cells.push({ name: `${who.id} ${of}`, who, call: call(of) })
  }
  const today = vnDayOf(new Date())
  const range = { from: `${today.slice(0, 8)}01`, to: today }
  for (const id of [wideSeatId('director'), scopedSeatId('sale'), scopedSeatId('marketing')]) {
    cells.push({
      name: `${id} lead-sources in a range`,
      who: seatOf(id),
      call: call('lead-sources', range),
    })
  }
  const director = seatOf(wideSeatId('director'))
  const cut = (grant: Parameters<typeof without>[1], of: string) => ({
    name: `${director.id} ${of} without ${grant}`,
    who: without(director, grant),
    call: call(of),
  })
  cells.push(cut('lead.view', 'leads'), cut('opportunity.view', 'deals'))
  cells.push(cut('campaign.view', 'lead-sources'))
  for (const of of ['leads', 'deals', 'lead-sources']) {
    cells.push({ name: `unlicensed ${of}`, who: NAMED_SEATS.unlicensed, call: call(of) })
  }
  return cells
}

const totalOf = async (world: World, c: Check, id: string, of: 'leads' | 'deals') => {
  const who = seatOf(id)
  const trail = await gateLinesOnly(world, c, () =>
    runTurn(world, { who, script: [{ calls: [call(of)] }, parrot] }),
  )
  return Number(dig(toolBody(trail).out, of, 'trusted', 'total'))
}

/** The scope is the seat's: the seller sees part of the book the wide seat sees whole,
 *  and what the facets door carries beyond the counts (a company name) stays behind. */
async function scoped(world: World, c: Check): Promise<void> {
  for (const of of ['leads', 'deals'] as const) {
    const wide = await totalOf(world, c, wideSeatId('director'), of)
    const own = await totalOf(world, c, scopedSeatId('sale'), of)
    c.ok(own > 0, `${of}: the seller counts what they hold`)
    c.ok(own < wide, `${of}: the seller counts fewer than the whole book (${own} of ${wide})`)
  }
  const query = zod(OpportunityFacetsQuery).transform({})
  const door = await world.opportunities.facets(seatOf(wideSeatId('director')), query)
  c.ok(canariesIn(JSON.stringify(door)).length > 0, 'control: the facets door does carry canaries')
}

export async function countsMatrix(world: World, tally: Tally): Promise<void> {
  const since = new Date()
  const all = countCells()
  await tally.run(GROUP, 'cell count is the one fixed by hand', async (c) => {
    c.eq(all.length, COUNT_CELLS, 'matrix size')
  })
  for (const cell of all) {
    await tally.run(
      GROUP,
      cell.name,
      async (c) => void (await runFigureCell(world, c, cell, shapeOf)),
    )
  }
  await tally.run(GROUP, 'an own-only seat counts its own scope, not the whole book', (c) =>
    scoped(world, c),
  )
  const director = seatOf(wideSeatId('director'))
  const replay = (of: string, grant: Parameters<typeof without>[1]) =>
    tally.run(GROUP, `a stored count of ${of} is shut for who lost ${grant}`, (c) =>
      reload(world, c, director, call(of), grant),
    )
  await replay('leads', 'lead.view')
  await replay('deals', 'opportunity.view')
  await replay('journeys', 'workstream.view')
  await replay('lead-sources', 'campaign.view')
  await replayToReviewers(world, tally, GROUP)
  await releaseHour(world, since)
}
