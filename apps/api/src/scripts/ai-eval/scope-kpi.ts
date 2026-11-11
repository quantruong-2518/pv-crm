import type { KpiForecastResponse } from '@pv/contracts'
import { KpiContributionsService } from '@api/branches/sales/kpi/kpi-contributions.service'
import { KpiHistoryService } from '@api/branches/sales/kpi/kpi-history.service'
import { KpiService } from '@api/branches/sales/kpi/kpi.service'
import { releaseHour, runTurn } from './bench'
import type { Check, Tally } from './report'
import { chainOf, dig, gateLinesOnly, toolBody, without, type Json } from './scope-customers-oracle'
import { newLines, SESSION_LINE } from './scope-history-audit'
import { answersOf, serviceOf } from './scope-history-reach'
import {
  expectedOf,
  GROUP,
  ID,
  metricRows,
  MINE,
  runKpi,
  TEAM,
  type KpiCall,
  type KpiCell,
} from './scope-kpi-oracle'
import { askCall } from './scope-door'
import { parrot } from './scripted-client'
import { KPI_CELLS, NAMED_SEATS, seat, wideSeatId, type Seat } from './seed-data'
import { KPI_PIPELINE, KPI_TEAM_SHARE } from './seed-kpi'
import type { World } from './world'

/** The KPI read, cell by cell, then the facts a cell cannot show alone: who is listed
 *  first, the team total, a pipeline kept back, the doors a call must never reach, and
 *  the reload of a stored answer. The team is told by name, in any case. */

const { casesExecutive, casesMarketing, kpiAhead, kpiBehind, kpiHead, kpiLead, unlicensed } =
  NAMED_SEATS
const director = seat(wideSeatId('director'), 'director', false)
const TEAM_NAME = 'nhóm HÀ NỘI'

function cells(previous: string): KpiCell[] {
  const mine = (who: Seat, label: string, input: KpiCall['input'] = { period: 'month' }) => ({
    name: `${who.id} ${label}`,
    who,
    call: { name: MINE, input },
  })
  const team = (who: Seat, label: string, input: KpiCall['input'] = {}) => ({
    name: `${who.id} ${label}`,
    who,
    call: { name: TEAM, input },
  })
  const quarter = { period: 'quarter' }
  return [
    mine(kpiHead, 'month'),
    mine(kpiLead, 'month'),
    mine(kpiAhead, 'month'),
    mine(kpiBehind, 'month'),
    mine(casesExecutive, 'month'),
    mine(casesMarketing, 'month'),
    mine(unlicensed, 'month'),
    mine(without(kpiLead, 'kpi.view'), 'month without kpi.view'),
    mine(kpiAhead, 'closed month', { period: 'month', at: previous }),
    mine(casesExecutive, 'quarter', quarter),
    mine(kpiLead, 'quarter', quarter),
    mine(kpiHead, 'quarter', quarter),
    mine(without(kpiLead, 'kpi.view'), 'quarter without kpi.view', quarter),
    team(kpiHead, 'everyone'),
    team(kpiHead, 'team', { team: TEAM_NAME }),
    team(kpiHead, 'team, closed month', { team: TEAM_NAME, at: previous }),
    team(kpiHead, 'team not in the roster', { team: 'nhóm Đà Nẵng' }),
    team(director, 'everyone'),
    team(kpiLead, 'everyone'),
    team(kpiLead, 'team', { team: TEAM_NAME }),
    team(kpiAhead, 'everyone'),
    team(unlicensed, 'everyone'),
  ]
}

const outOf = async (world: World, c: Check, cell: KpiCell): Promise<Json> => {
  const want = await expectedOf(world, cell.who, cell.call)
  if (want.refused) {
    c.ok(false, `${cell.name} is refused`)
    return {}
  }
  return want.out
}

const memberRows = (out: Json): Json[] => (dig(out, 'kpi', 'rows') ?? []) as Json[]

/** Members who are behind come first, flagged as such, and the roll of the door is not already that order. */
async function behindFirst(world: World, c: Check, cells: KpiCell[]): Promise<void> {
  const cell = cells.find((x) => x.name === `${kpiHead.id} team, closed month`)
  if (!cell) return c.ok(false, 'no such cell')
  const rows = memberRows(await outOf(world, c, cell))
  const members = rows.map((r) => dig(r, 'untrusted', 'name'))
  c.eq(members.length, 3, 'the team has three members')
  c.eq(members.at(-1), kpiAhead.name, 'the member who made the target comes last')
  c.eq(
    [...members.slice(0, 2)].sort(),
    [kpiBehind.name, kpiLead.name].sort(),
    'the two who missed come first',
  )
  c.eq(
    rows.map((r) => dig(r, 'trusted', 'behind')),
    [true, true, false],
    'and are told apart from the one who made it',
  )
}

/** The team total exists for a metric that adds up, and carries the team's share as its target. */
async function teamTotal(world: World, c: Check, cells: KpiCell[]): Promise<void> {
  const cell = cells.find((x) => x.name === `${kpiHead.id} team`)
  if (!cell) return c.ok(false, 'no such cell')
  const total = (dig(await outOf(world, c, cell), 'team', 'rows') ?? []) as Json[]
  c.eq(total.length, 1, 'one metric adds up')
  c.eq(dig(total[0], 'trusted', 'metric'), 'signed-value', 'the metric')
  c.eq(dig(total[0], 'trusted', 'targetMoney'), KPI_TEAM_SHARE, "the team's share is its target")
}

/** What the tool printed for a cell, as the model reads it. */
async function toolOut(world: World, c: Check, cell: KpiCell): Promise<Json> {
  const trail = await gateLinesOnly(world, c, () =>
    runTurn(world, { who: cell.who, script: [{ calls: [cell.call] }, parrot] }),
  )
  return toolBody(trail).out
}

/** The pipeline figures an answer prints, by metric. */
const pipelinesIn = (out: Json) =>
  metricRows(out).flatMap((m) => {
    const key = Object.keys(m).find((k) => k.startsWith('pipeline'))
    return key ? [{ metric: m.metric, value: m[key] }] : []
  })

/** A door body can hold a pipeline the tool must not print: the forecast door gives the room's to the head. */
async function pipeline(world: World, c: Check, cells: KpiCell[]): Promise<void> {
  const cellOf = (name: string) => {
    const cell = cells.find((x) => x.name === name)
    if (!cell) throw new Error(`no cell ${name}`)
    return cell
  }
  const forecast = async (cell: KpiCell, id: string) => {
    const door = await askCall(world, cell.who, cell.call, chainOf(world, 'care-own'))
    const items = door.ok ? (door.bodies[id] as KpiForecastResponse).items : []
    return items.filter((i) => i.metricKey === 'signed-value')
  }
  const head = cellOf(`${kpiHead.id} month`)
  const room = await forecast(head, ID.forecast)
  c.ok(
    room.some((i) => typeof i.pipeline === 'number' && i.pipeline > 0),
    'the forecast door hands the head the room pipeline',
  )
  const all = await forecast(cellOf(`${kpiHead.id} everyone`), ID.forecastAll)
  c.eq(
    all.find((i) => i.actorId === kpiLead.id)?.pipeline,
    KPI_PIPELINE,
    'and the seller their own, for the list',
  )
  c.eq(
    pipelinesIn(await toolOut(world, c, cellOf(`${kpiLead.id} month`))),
    [{ metric: 'signed-value', value: KPI_PIPELINE }],
    'the tool prints a seller the pipeline of their own signed-value line',
  )
  for (const name of [
    `${kpiHead.id} month`,
    `${kpiLead.id} quarter`,
    `${kpiHead.id} everyone`,
    `${kpiHead.id} team`,
    `${director.id} everyone`,
  ]) {
    c.eq(pipelinesIn(await toolOut(world, c, cellOf(name))), [], `${name}: no pipeline printed`)
  }
}

/** Doors the KPI tools must never call, counted on the services behind them. */
async function neverReached(world: World, c: Check, all: KpiCell[]): Promise<void> {
  const watched: [object, string][] = [
    [KpiService.prototype, 'company'],
    [KpiService.prototype, 'person'],
    [KpiService.prototype, 'targetsOf'],
    [KpiHistoryService.prototype, 'history'],
    [KpiContributionsService.prototype, 'of'],
  ]
  const calls: string[] = []
  const originals = watched.map(([proto, name]) => {
    const target = proto as Record<string, unknown>
    const original = target[name]
    target[name] = function (this: unknown, ...args: unknown[]) {
      calls.push(name)
      return (original as (...a: unknown[]) => unknown).apply(this, args)
    }
    return original
  })
  try {
    for (const cell of all) {
      await runTurn(world, { who: cell.who, script: [{ calls: [cell.call] }, parrot] })
    }
  } finally {
    watched.forEach(([proto, name], i) => ((proto as Record<string, unknown>)[name] = originals[i]))
  }
  c.eq(calls, [], 'calls to the company card, the targets, the history or the contributions')
}

/** A stored answer is served again to a reader who still holds the grant, shut for one who lost it, and either way writes no line. */
async function reload(
  world: World,
  c: Check,
  who: Seat,
  call: KpiCall,
  grant: 'kpi.view' | 'kpi.view-all',
) {
  const sessionId = (await runTurn(world, { who, script: [{ calls: [call] }, parrot] })).sessionId
  const service = serviceOf(world)
  const kept = await newLines(world, [SESSION_LINE], () => service.detail(who, sessionId))
  c.eq(
    answersOf(kept.result).map((m) => m.withheld),
    [false],
    'the holder reads it again',
  )
  c.eq(kept.lines, [], 'and no line is written')
  const lost = await newLines(world, [SESSION_LINE], () =>
    service.detail(without(who, grant), sessionId),
  )
  c.eq(
    answersOf(lost.result).map((m) => m.withheld),
    [true],
    `a reader who lost ${grant} does not`,
  )
  c.eq(lost.lines, [], 'and no line either')
}

export async function kpiMatrix(world: World, tally: Tally): Promise<void> {
  const since = new Date()
  await runKpiCells(world, tally)
  await releaseHour(world, since)
}

async function runKpiCells(world: World, tally: Tally): Promise<void> {
  const all = cells(world.seeded.kpi.previous)
  await tally.run(GROUP, 'cell count is the one fixed by hand', async (c) => {
    c.eq(all.length, KPI_CELLS, 'matrix size')
  })
  for (const cell of all) {
    await tally.run(GROUP, cell.name, async (c) => void (await runKpi(world, c, cell)))
  }
  await tally.run(GROUP, 'people behind on their primary metric come first', (c) =>
    behindFirst(world, c, all),
  )
  await tally.run(GROUP, 'a team total is only for the metrics that add up', (c) =>
    teamTotal(world, c, all),
  )
  await tally.run(GROUP, "a pipeline is printed only on the asker's own money line", (c) =>
    pipeline(world, c, all),
  )
  await tally.run(
    GROUP,
    'no call reaches the company card, targets, history or contributions',
    (c) => neverReached(world, c, all),
  )
  await tally.run(GROUP, 'a stored month is shut for who lost kpi.view', (c) =>
    reload(world, c, kpiLead, { name: MINE, input: { period: 'month' } }, 'kpi.view'),
  )
  await tally.run(GROUP, 'a stored team list is shut for who lost kpi.view-all', (c) =>
    reload(world, c, kpiHead, { name: TEAM, input: {} }, 'kpi.view-all'),
  )
  await tally.run(GROUP, 'a stored quarter is shut for who lost kpi.view', (c) =>
    reload(world, c, kpiLead, { name: MINE, input: { period: 'quarter' } }, 'kpi.view'),
  )
  await tally.run(GROUP, 'a stored list of teams is shut for who lost kpi.view-all', (c) =>
    reload(world, c, kpiHead, { name: TEAM, input: { team: 'nhóm Đà Nẵng' } }, 'kpi.view-all'),
  )
}
