import { releaseHour, runTurn } from './bench'
import type { Check, Tally } from './report'
import { seatOf, without } from './scope-customers-oracle'
import { periodOf } from './scope-figures-door'
import { replayToReviewers } from './scope-figures-replay'
import { runFigureCell, type FigureCell } from './scope-figures-oracle'
import { shapeOf } from './scope-figures-shape'
import { reload } from './scope-kpi'
import { newLines, SESSION_LINE } from './scope-history-audit'
import { answersOf, serviceOf } from './scope-history-reach'
import { parrot } from './scripted-client'
import {
  FIGURE_CELLS,
  NAMED_SEATS,
  ROLE_SEATS,
  scopedSeatId,
  wideSeatId,
  type Seat,
} from './seed-data'
import type { World } from './world'

/** `get_performance`, seat by seat: every role (own-only and wide) over every part and
 *  the running period of every grain its door takes, then a closed month, then seats whose
 *  grant was cut or never given. Each answer is held to the door's body: the same numbers
 *  under their unit's name, a bucket's `key` as `period`, a ratio as a percent out of 100.
 *  A stored answer is shut again under the permission of its own part, not the tool's. */

export const GROUP = 'scope-figures'
const CALL = 'get_performance'

const GRAINS = ['week', 'month', 'quarter', 'year'] as const
const INDUSTRY_GRAINS = ['month', 'quarter', 'year'] as const
const PAID_YEAR = '2025'
const DUE_YEAR = '2026'

const call = (part: string, grain: string, at?: string) => ({
  name: CALL,
  input: { part, grain, ...(at && { at }) },
})

export function figureCells(previous: string): FigureCell[] {
  const cells: FigureCell[] = []
  for (const who of ROLE_SEATS) {
    for (const part of ['figures', 'exits', 'money'] as const) {
      for (const grain of GRAINS) {
        cells.push({ name: `${who.id} ${part} ${grain}`, who, call: call(part, grain) })
      }
    }
    for (const grain of INDUSTRY_GRAINS) {
      cells.push({ name: `${who.id} industries ${grain}`, who, call: call('industries', grain) })
    }
  }
  const director = seatOf(wideSeatId('director'))
  const closed = (part: string, who: Seat) => ({
    name: `${who.id} ${part} closed month`,
    who,
    call: call(part, 'month', previous),
  })
  const wideSale = seatOf(wideSeatId('sale'))
  for (const part of ['figures', 'exits', 'money']) cells.push(closed(part, director))
  cells.push(closed('figures', wideSale))
  /* The seed collects its customers' money in 2025 and leaves one installment due in 2026. */
  const paidYear = (who: Seat) => ({
    name: `${who.id} money paid year`,
    who,
    call: call('money', 'year', PAID_YEAR),
  })
  cells.push(paidYear(director), paidYear(wideSale))
  /* A grant cut or never given: the part's own need decides, and no other. */
  const cut = (grant: Parameters<typeof without>[1], part: string) => ({
    name: `${director.id} ${part} without ${grant}`,
    who: without(director, grant),
    call: call(part, 'month'),
  })
  cells.push(cut('performance.view', 'figures'), cut('contract.view', 'money'))
  cells.push(cut('contract.view', 'figures'), cut('campaign.view', 'industries'))
  cells.push({ name: 'no-paper money', who: NAMED_SEATS.noPaper, call: call('money', 'month') })
  cells.push({ name: 'no-paper figures', who: NAMED_SEATS.noPaper, call: call('figures', 'month') })
  cells.push({
    name: 'unlicensed figures',
    who: NAMED_SEATS.unlicensed,
    call: call('figures', 'month'),
  })
  cells.push({
    name: 'unlicensed money',
    who: NAMED_SEATS.unlicensed,
    call: call('money', 'month'),
  })
  return cells
}

/** The overview's own facts, so a shared mistake of door and tool cannot pass: the seeded
 *  contracts are signed this month and read as such, and an own-only seat that may open
 *  the contract book is refused its money whole. */
async function seededFacts(world: World, c: Check): Promise<void> {
  const head = seatOf(wideSeatId('director'))
  const figures = await world.performance.read(periodOf({ part: 'figures', grain: 'month' }))
  c.ok(figures.current.signedCount > 0, 'the seed signs a contract in the running month')
  c.ok(figures.current.signedAmountVnd > 0, 'and the signed amount is a figure, not zero')
  const wide = await world.performanceMoney.read(head, DUE_YEAR)
  c.ok(
    wide.totals.upcomingVnd + wide.totals.dueUnpaidVnd > 0,
    'the installment is money still owed',
  )
  const paid = await world.performanceMoney.read(head, PAID_YEAR)
  c.ok(paid.totals.collectedVnd > 0, 'and the year the seed collected in has money in')
  const refusal = await world.performanceMoney
    .read(seatOf(scopedSeatId('sale')), periodOf({ part: 'money', grain: 'month' }))
    .then(
      () => 'answered',
      (error: { getStatus?: () => number }) => error.getStatus?.(),
    )
  c.eq(refusal, 403, 'an own-only seat is refused the money whole')
}

/** A stored answer is shut for who lost the grant of ITS part, and served to who lost another. */
async function replayByPart(world: World, c: Check): Promise<void> {
  const who = seatOf(wideSeatId('director'))
  const stored = call('figures', 'month')
  const { sessionId } = await runTurn(world, { who, script: [{ calls: [stored] }, parrot] })
  const service = serviceOf(world)
  const other = await newLines(world, [SESSION_LINE], () =>
    service.detail(without(who, 'contract.view'), sessionId),
  )
  c.eq(
    answersOf(other.result).map((m) => m.withheld),
    [false],
    'a stored figures answer is served to a reader who lost only contract.view',
  )
}

export async function figuresMatrix(world: World, tally: Tally): Promise<void> {
  const since = new Date()
  const all = figureCells(world.seeded.kpi.previous)
  await tally.run(GROUP, 'cell count is the one fixed by hand', async (c) => {
    c.eq(all.length, FIGURE_CELLS, 'matrix size')
  })
  for (const cell of all) {
    await tally.run(
      GROUP,
      cell.name,
      async (c) => void (await runFigureCell(world, c, cell, shapeOf)),
    )
  }
  await tally.run(GROUP, 'the seed gives the figures something to say', (c) =>
    seededFacts(world, c),
  )
  const director = seatOf(wideSeatId('director'))
  const replay = (part: string, grant: Parameters<typeof without>[1]) =>
    tally.run(GROUP, `a stored ${part} answer is shut for who lost ${grant}`, (c) =>
      reload(world, c, director, call(part, 'month'), grant),
    )
  await replay('figures', 'performance.view')
  await replay('exits', 'performance.view')
  await replay('money', 'contract.view')
  await replay('industries', 'campaign.view')
  await tally.run(GROUP, 'a stored figures answer is served to who lost only contract.view', (c) =>
    replayByPart(world, c),
  )
  await replayToReviewers(world, tally, GROUP)
  await releaseHour(world, since)
}
