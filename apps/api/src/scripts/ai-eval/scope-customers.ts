import { needOf, doorId } from './scope-door'
import { AfterSaleController } from '@api/branches/sales/after-sale/after-sale.controller'
import { releaseHour, runTurn } from './bench'
import type { Check, Tally } from './report'
import {
  CALL,
  chainOf,
  expectedOf,
  GROUP,
  runList,
  without,
  type Expected,
  type ListCell,
} from './scope-customers-oracle'
import { runMoney, type MoneyCell } from './scope-customers-money'
import { answersOf, serviceOf } from './scope-history-reach'
import { newLines, SESSION_LINE } from './scope-history-audit'
import { parrot } from './scripted-client'
import { CUSTOMER_CELLS, NAMED_SEATS } from './seed-data'
import type { World } from './world'

/** The customer read, cell by cell, then the facts the cells cannot show by themselves:
 *  the three kinds of row a seat can have (kept by the lead book, kept by the profile
 *  door, dropped and counted), the grant a seat lacks, and the reload of a stored list. */

const { casesSale, casesExecutive, casesMarketing, noPaper, rival, saleA } = NAMED_SEATS

function listCells(): ListCell[] {
  const at = (who: ListCell['who'], label: string, input: ListCell['input'] = {}): ListCell => ({
    name: `${who.id} ${label}`,
    who,
    input,
  })
  return [
    at(casesSale, 'all'),
    at(casesSale, 'hot', { temperature: 'hot' }),
    at(casesSale, 'mine', { mine: true }),
    at(rival, 'all'),
    at(saleA, 'all'),
    at(noPaper, 'all'),
    at(casesMarketing, 'all'),
    at(casesExecutive, 'all'),
    at(casesExecutive, 'hot', { temperature: 'hot' }),
    at(casesExecutive, 'cold', { temperature: 'cold' }),
    at(casesExecutive, 'due', { care: 'due' }),
    at(casesExecutive, 'upcoming', { care: 'upcoming' }),
    at(casesExecutive, 'mine', { mine: true }),
    at(without(casesExecutive, 'contract.view'), 'without contract.view'),
    at(without(casesExecutive, 'lead.view'), 'without lead.view'),
  ]
}

const moneyCells = (): MoneyCell[] => [
  { name: 'cases-sale care-own', who: casesSale, chain: 'care-own' },
  { name: 'no-paper care-own', who: noPaper, chain: 'care-own' },
  { name: 'cases-executive care-own', who: casesExecutive, chain: 'care-own' },
  { name: 'cases-sale quote-deal', who: casesSale, chain: 'quote-deal' },
  { name: 'cases-executive quote-deal', who: casesExecutive, chain: 'quote-deal' },
  { name: 'no-paper quote-deal', who: noPaper, chain: 'quote-deal' },
]

/** One seat of each kind of row, read off the doors themselves. */
async function rowKinds(world: World, c: Check): Promise<void> {
  const own = chainOf(world, 'care-own').lead
  const carer = chainOf(world, 'care-carer').lead
  const drop = chainOf(world, 'care-drop').lead
  const sale = await expectedOf(world, casesSale, {})
  const wide = await expectedOf(world, casesExecutive, {})
  if (sale.refused || wide.refused) return c.ok(false, 'the seats are refused')
  const kept = (e: Expected & { refused: false }) => e.kept.map((r) => r.leadCode)
  c.ok(kept(sale).includes(own) && sale.booked.has(own), 'the holder is kept by the lead book')
  c.ok(kept(sale).includes(carer), 'the carer of a rival lead is kept')
  c.ok(!sale.booked.has(carer) && sale.opened.has(carer), 'and only the profile door opens it')
  c.ok(
    sale.page.rows.some((r) => r.leadCode === drop),
    'the book lists the dropped row',
  )
  c.ok(!kept(sale).includes(drop), 'its lead is not the seat')
  c.eq(sale.hidden, sale.page.hidden + 1, 'it is counted hidden')
  c.eq(kept(wide).sort(), [own, carer, drop].sort(), 'a wide seat keeps all three')
  c.eq(wide.hidden, 0, 'and hides none')
}

/** The seat the table calls `no-paper` is shut by the grant the gate reads off the seat. */
async function noPaperGate(world: World, c: Check): Promise<void> {
  const need = needOf([AfterSaleController, 'list'])
  c.ok(
    !(noPaper.permissions as readonly string[]).includes('contract.view'),
    'the seat lacks the grant',
  )
  c.ok(!world.gateAccess.check(noPaper, need).ok, 'the gate sees it shut')
  c.ok(!world.doorAccess.check(noPaper, need).ok, 'so does the oracle')
  const trail = await runTurn(world, {
    who: noPaper,
    script: [{ calls: [{ name: CALL, input: {} }] }, parrot],
  })
  c.eq(trail.toolRows[0]?.outcome, 'refused', 'the tool refuses it')
  c.ok(doorId([AfterSaleController, 'list']).length > 0, 'the door is named')
}

/** A stored list is served again for a reader who still holds `contract.view`, and shut
 *  for one who lost it; either way the reload writes no `view` line. */
async function reload(world: World, c: Check): Promise<void> {
  const sessionId = (
    await runTurn(world, {
      who: casesSale,
      script: [{ calls: [{ name: CALL, input: {} }] }, parrot],
    })
  ).sessionId
  const service = serviceOf(world)
  const kept = await newLines(world, [SESSION_LINE], () => service.detail(casesSale, sessionId))
  c.eq(
    answersOf(kept.result).map((m) => m.withheld),
    [false],
    'the holder reads it again',
  )
  c.eq(kept.lines, [], 'a list writes no view line on reload')
  const lost = without(casesSale, 'contract.view')
  const shut = await newLines(world, [SESSION_LINE], () => service.detail(lost, sessionId))
  c.eq(
    answersOf(shut.result).map((m) => m.withheld),
    [true],
    'a reader who lost contract.view does not',
  )
  c.eq(shut.lines, [], 'and no line either')
}

export async function customerMatrix(world: World, tally: Tally): Promise<void> {
  const since = new Date()
  await runCustomerCells(world, tally)
  await releaseHour(world, since)
}

async function runCustomerCells(world: World, tally: Tally): Promise<void> {
  const lists = listCells()
  const moneys = moneyCells()
  await tally.run(GROUP, 'cell count is the one fixed by hand', async (c) => {
    c.eq(lists.length + moneys.length, CUSTOMER_CELLS, 'matrix size')
  })
  for (const cell of lists) {
    await tally.run(GROUP, `list ${cell.name}`, async (c) => void (await runList(world, c, cell)))
  }
  for (const cell of moneys) {
    await tally.run(GROUP, `money ${cell.name}`, (c) => runMoney(world, c, cell))
  }
  await tally.run(GROUP, 'the three kinds of row all occur', (c) => rowKinds(world, c))
  await tally.run(GROUP, 'the seat without a paper grant is shut by the gate', (c) =>
    noPaperGate(world, c),
  )
  await tally.run(GROUP, 'a stored list is served again, and shut for who lost the grant', (c) =>
    reload(world, c),
  )
}
