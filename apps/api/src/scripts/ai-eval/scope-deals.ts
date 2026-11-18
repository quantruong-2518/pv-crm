import { LIST_SIZE } from '@api/branches/sales/assistant/list-my-work-extra'
import { runTurn, trailText } from './bench'
import type { Check, Tally } from './report'
import { askCall, canariesIn } from './scope-door'
import { agreeOnAnswer, agreeOnRefusal } from './scope-matrix'
import { chainOf, seatOf, without } from './scope-customers-oracle'
import { parrot } from './scripted-client'
import { NAMED_SEATS, ROLE_SEATS, scopedSeatId, wideSeatId, type Seat } from './seed-data'
import type { World } from './world'

/** `list_deals`, seat by seat: the opportunity book asked as the seat is the oracle, and
 *  the tool must name the same deals and hand over nothing the book did not. Then the
 *  fact a cell cannot show alone: a seller's list holds no rival deal, and the director's
 *  does, so the first is the scope's doing and not an empty seed.
 *
 *  The seed gives no deal an amount, a next step or a quiet day, so the filters of the
 *  tool are held by its unit test; here they prove only that they widen nothing. */

const GROUP = 'scope-deals'
export const DEAL_CELLS = 32
const FAR = '2099-12-31'

type DealCell = { name: string; who: Seat; input: Record<string, unknown> }

function cellsOf(world: World): DealCell[] {
  const { saleA, saleB, rival, bdCo, unlicensed } = NAMED_SEATS
  const { opportunity: code } = chainOf(world, 'pool')
  const asked: [string, Record<string, unknown>][] = [
    ['stale', { focus: 'stale' }],
    ['step-due', { focus: 'step-due', by: FAR }],
    ['closing', { focus: 'closing', by: FAR }],
    ['by expected close', { sort: 'expectedClose' }],
    ['quietest first', { sort: 'quiet' }],
    ['a rival code', { query: code }],
  ]
  const wide = seatOf(wideSeatId('director'))
  const own = seatOf(scopedSeatId('sale'))
  return [
    ...ROLE_SEATS.map((who) => ({ name: `${who.id} all`, who, input: {} })),
    ...[saleA, saleB, rival, bdCo, unlicensed].map((who) => ({
      name: `${who.id} all`,
      who,
      input: {},
    })),
    ...[wide, own].flatMap((who) =>
      asked.map(([label, input]) => ({ name: `${who.id} ${label}`, who, input })),
    ),
    {
      name: 'director without opportunity.view',
      who: without(wide, 'opportunity.view'),
      input: {},
    },
  ]
}

/** The tool's own filters and quiet order pick from a wider read than it lists, so those
 *  cells hold it to the book's deals and no more; the others to the book's first page. */
const picks = ({ focus, sort }: Record<string, unknown>) =>
  focus === 'stale' || focus === 'step-due' || sort === 'quiet'

async function runCell(world: World, c: Check, { who, input }: DealCell): Promise<void> {
  const call = { name: 'list_deals', input }
  const door = await askCall(world, who, call, chainOf(world, 'pool'))
  const trail = await runTurn(world, { who, script: [{ calls: [call] }, parrot] })
  c.eq(trail.turn?.endedBy, 'answer', 'the turn ends normally')
  if (!door.ok) {
    agreeOnRefusal(c, door, trail)
    c.eq(canariesIn(trailText(trail)), [], 'a canary in a refused turn')
    return
  }
  const named = trail.toolRows[0]?.codes ?? []
  const codes = picks(input) ? named : door.codes.slice(0, LIST_SIZE)
  if (picks(input))
    c.ok(
      named.every((code) => door.codes.includes(code)),
      'no deal the book left out',
    )
  /* `more` is the tool's own cap flag, never door data. */
  const json = JSON.stringify([JSON.parse(door.json), { more: false }])
  /* An empty answer with rows kept back still writes the one count line. */
  const hidden = (Object.values(door.bodies)[0] as { hidden: number }).hidden
  const counted = trail.audits.filter((a) => a.action === 'ai-read' && !a.code)
  const empty = codes.length === 0 && hidden > 0
  if (empty) {
    c.eq(counted.length, 1, 'one count line for rows kept back')
    c.ok(!!counted[0]?.note?.endsWith(`0 row(s) · ${hidden} hidden`), 'it says how many')
  }
  const shown = { ...door, codes, rows: codes.length, json }
  agreeOnAnswer(c, shown, empty ? { ...trail, audits: [] } : trail, who)
  const seen = canariesIn(trailText(trail))
  const at = new Set(canariesIn(door.json))
  c.eq([...new Set(seen.filter((t) => !at.has(t)))], [], 'a canary the book never showed')
}

async function scoped(world: World, c: Check): Promise<void> {
  const { opportunity } = chainOf(world, 'pool')
  const codesOf = async (who: Seat) => {
    const call = { name: 'list_deals', input: { query: opportunity } }
    const trail = await runTurn(world, { who, script: [{ calls: [call] }, parrot] })
    return trail.toolRows[0]?.codes ?? []
  }
  c.ok(
    (await codesOf(seatOf(wideSeatId('director')))).includes(opportunity),
    'the director lists it',
  )
  for (const who of [NAMED_SEATS.saleA, NAMED_SEATS.saleB, seatOf(scopedSeatId('sale'))]) {
    c.ok(!(await codesOf(who)).includes(opportunity), `${who.id} lists no rival deal`)
  }
}

export async function dealsMatrix(world: World, tally: Tally): Promise<void> {
  const cells = cellsOf(world)
  await tally.run(GROUP, 'cell count is the one fixed by hand', async (c) => {
    c.eq(cells.length, DEAL_CELLS, 'matrix size')
  })
  for (const cell of cells) {
    await tally.run(GROUP, cell.name, (c) => runCell(world, c, cell))
  }
  await tally.run(GROUP, 'a seller lists no rival deal and the director does', (c) =>
    scoped(world, c),
  )
}
