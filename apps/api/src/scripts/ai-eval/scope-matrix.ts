import { ObjectCode } from '@pv/contracts'
import { zod } from '@api/platform/http/zod.pipe'
import { runTurn, trailText, type Trail } from './bench'
import type { Check, Tally } from './report'
import {
  askCall,
  askDoor,
  canariesIn,
  leaves,
  PROBES,
  shownCanariesIn,
  unbound,
  type DoorAnswer,
} from './scope-door'
import { accountMatrix } from './scope-account'
import { historyMatrix } from './scope-history'
import { FACTS } from './scope-facts'
import {
  agreeOnReach,
  contactsIn,
  grantCases,
  holdsExport,
  maskedLeaves,
  reachCoverage,
  type Cell,
  type ReachLog,
} from './scope-reach'
import { MATRIX_CELLS, NAMED_SEATS, ROLE_SEATS, ROLES, scopedSeatId, type Seat } from './seed-data'
import type { Chain } from './seed'
import { parrot, toolOutputs } from './scripted-client'
import type { World } from './world'

/** Every tool × every role × in and out of scope, with no model in the way. Each
 *  cell asks the door first, then sends the same request through a real turn with a
 *  parrot for a model, and the two answers must agree: same refusal, same codes, and
 *  nothing in the tool's output that the door did not hand out.
 *
 *  Canaries: the forbidden set is per cell, all canaries less those the door itself
 *  showed that person. The director legitimately reads everything, so a fixed list
 *  would be wrong in both directions. */

const SPECIAL: readonly { who: Seat; chains: readonly string[] }[] = [
  { who: NAMED_SEATS.saleA, chains: ['a', 'b'] },
  { who: NAMED_SEATS.saleB, chains: ['a', 'b'] },
  { who: NAMED_SEATS.bdCo, chains: ['co-open', 'co-signed', 'a'] },
  { who: NAMED_SEATS.collector, chains: ['collected', 'a'] },
  { who: NAMED_SEATS.unlicensed, chains: ['rival'] },
]

function cellsOf(world: World): Cell[] {
  const chain = (key: string): Chain => {
    const found = world.seeded.chains.get(key)
    if (!found) throw new Error(`no chain ${key}`)
    return found
  }
  const everyProbe = (who: Seat, on: Chain): Cell[] =>
    PROBES.filter((probe) => probe !== 'contract' || on.contract !== null).map((probe) => ({
      who,
      probe,
      chain: on,
    }))
  const roleCells = ROLES.flatMap((role) =>
    ROLE_SEATS.filter((s) => s.roleIds[0] === role).flatMap((who) => [
      ...everyProbe(who, chain(`own-${role}`)),
      ...everyProbe(who, chain('rival')),
    ]),
  )
  const named = SPECIAL.flatMap(({ who, chains }) =>
    chains.flatMap((key) => everyProbe(who, chain(key))),
  )
  const pool = ROLES.flatMap((role) =>
    ROLE_SEATS.filter((s) => s.id === scopedSeatId(role)).flatMap((who) =>
      everyProbe(who, chain('pool')),
    ),
  )
  return [...roleCells, ...named, ...pool, ...edgeCells(chain)]
}

/** A wide reader on a dead lead, a scoped one on a lead nobody holds, and an owner
 *  on a lead whose book hides a deal of someone else's. */
function edgeCells(chain: (key: string) => Chain): Cell[] {
  const wide = ROLE_SEATS.find((s) => s.id === 'seat-director-wide')
  const scoped = ROLE_SEATS.find((s) => s.id === scopedSeatId('sale'))
  if (!wide || !scoped) throw new Error('the role seats are missing')
  return [
    ...PROBES.map((probe) => ({ who: wide, probe, chain: chain('off') })),
    ...PROBES.filter((p) => p !== 'contract').map((probe) => ({
      who: scoped,
      probe,
      chain: chain('unowned'),
    })),
    { who: NAMED_SEATS.saleA, probe: 'lead', chain: chain('shared-lead') },
  ]
}

const callOf = ({ probe, chain }: Cell) =>
  probe === 'search'
    ? { name: 'search_records', input: { query: chain.word } }
    : {
        name: 'get_record',
        input: { kind: probe, code: probe === 'lead' ? chain.lead : chain[probe] },
      }

function agreeOnRefusal(c: Check, door: DoorAnswer, trail: Trail): void {
  const [row] = trail.toolRows
  c.eq(row?.outcome, 'refused', 'the tool must refuse what the door refuses')
  c.eq(row?.codes, [], 'a refused tool names no record')
  c.ok(!trail.audits.some((a) => a.action === 'ai-read'), 'a refused call writes no ai-read line')
  if (door.ok === false && !/^\d+$/.test(door.reason)) {
    c.ok(
      trail.audits.some((a) => a.action === 'view' && a.note?.includes(door.reason)),
      `the gate writes the refusal line (${door.reason})`,
    )
  }
}

function agreeOnAnswer(
  c: Check,
  door: Extract<DoorAnswer, { ok: true }>,
  trail: Trail,
  who: Seat,
): void {
  const [row] = trail.toolRows
  c.eq(row?.outcome, 'ok', 'the tool must answer what the door answers')
  c.eq([...(row?.codes ?? [])].sort(), [...door.codes].sort(), 'tool and door name the same codes')
  c.eq(row?.rowCount, door.rows, 'tool and door count the same rows')

  /* The mask stands in for a door string only where that string held a contact. */
  const atDoor = leaves(JSON.parse(door.json))
  const allowed = new Set(holdsExport(who) ? atDoor : [...atDoor, ...maskedLeaves(atDoor)])
  const [fence, body] = (toolOutputs(trail.witness.seen[1]?.request.messages ?? [])[0] ?? '').split(
    '\n',
  )
  c.ok(!!fence && !!body, 'the second request carries the tool result')
  /* The flag is the tool's word, not door data; `agreeOnReach` holds it to its value.
     `rows` is the binder's count, held to the door's own. */
  const { rows, ...parsed } = JSON.parse(body ?? '{}') as { rows?: unknown }
  c.eq(unbound(rows), door.rows, 'the rows the model may cite')
  const handed = leaves(unbound({ ...parsed, contactInfoWithheld: null }))
  const extra = handed.filter((leaf) => !allowed.has(leaf))
  c.eq(extra, [], 'the tool hands over nothing the door did not')

  const read = [...new Set(door.codes)].sort()
  const lines = trail.audits.filter((a) => a.action === 'ai-read' && a.code)
  c.eq(lines.map((a) => a.code).sort(), read, 'one ai-read line per tool and record')
  if (door.rows === 0) c.eq(trail.audits, [], 'nothing returned, nothing written')
}

/** Lists carry no phone or mail (D2), whatever the door's own search row holds. */
function noContactInList(c: Check, cell: Cell, trail: Trail): void {
  if (cell.probe !== 'search') return
  const sent = toolOutputs(trail.witness.seen[1]?.request.messages ?? []).join('')
  c.eq(contactsIn(sent), [], 'phones and mails in a list')
}

async function runCell(world: World, c: Check, cell: Cell, log: ReachLog): Promise<DoorAnswer> {
  const call = callOf(cell)
  const door = await askCall(world, cell.who, call, cell.chain)
  const trail = await runTurn(world, { who: cell.who, script: [{ calls: [call] }, parrot] })
  c.eq(trail.turn?.endedBy, 'answer', 'the turn ends normally')
  if (door.ok) {
    agreeOnAnswer(c, door, trail, cell.who)
    agreeOnReach(c, cell, door, trail, log)
  } else agreeOnRefusal(c, door, trail)
  noContactInList(c, cell, trail)

  const shown = new Set(canariesIn(door.json))
  const text = trailText(trail)
  const seen = canariesIn(text)
  c.eq([...new Set(seen.filter((t) => !shown.has(t)))], [], 'a canary the door never showed')

  /* The control: with a leak-free tool, an allowed read must still light up. The
     binder masks a canary's digits on the way out, so the raw stream carries it whole. */
  if (door.ok && door.rows > 0) {
    c.ok(canariesIn(trail.witness.deltas.join('')).length > 0, 'an allowed read reaches the model')
    c.ok(shownCanariesIn(trail.turn?.body ?? '').length > 0, 'an allowed read reaches the answer')
  }
  return door
}

/** The control for the 'shared-lead' cell: the door must really hide the other deal,
 *  or that cell would pass with nothing to leak. */
async function hiddenDealIsHidden(world: World, tally: Tally): Promise<void> {
  const shared = world.seeded.chains.get('shared-lead')
  if (!shared?.strangerDeal) throw new Error('no chain shared-lead')
  const { code, canary } = shared.strangerDeal
  await tally.run('scope-matrix', 'a lead opens and its book hides a deal', async (c) => {
    const call = { name: 'get_record', input: { kind: 'lead', code: shared.lead } }
    const door = await askCall(world, NAMED_SEATS.saleA, call, shared)
    c.ok(door.ok && door.codes.includes(shared.lead), 'the lead opens')
    c.ok(door.ok && door.codes.includes(shared.opportunity), 'the seat sees its own deal')
    c.ok(door.ok && !door.codes.includes(code), 'the book hides the other deal')
    c.ok(!canariesIn(door.json).includes(canary), 'no canary of the hidden deal at the door')
    /* Without this half the cell passes on a deal nobody could read at all. */
    const theirs = await world.opportunities.profile(
      NAMED_SEATS.rival,
      zod(ObjectCode).transform(code),
    )
    c.eq(theirs.code, code, 'the deal is there for the seat that holds it')
    c.ok(canariesIn(JSON.stringify(theirs)).includes(canary), 'its canary shows to that seat')
  })
}

/** Owner ruling 10/11/2026 (ADR 0147): a deal shows its linked contact even when it
 *  sits on another seller's lead, as the deal screen does; the tool repeats it. */
async function siblingContact(world: World, tally: Tally): Promise<void> {
  const { sibling, chains } = world.seeded
  const a = chains.get('a')
  if (!a) throw new Error('no chain a')
  await tally.run(
    'scope-matrix',
    "the deal holder is shown the contact of another seller's lead",
    async (c) => {
      const who = NAMED_SEATS.saleA
      const call = { name: 'get_record', input: { kind: 'opportunity', code: a.opportunity } }
      const door = await askDoor(world, who, 'opportunity', a)
      c.ok(door.ok && door.json.includes(sibling.canary), 'the deal door shows the contact')
      const trail = await runTurn(world, { who, script: [{ calls: [call] }, parrot] })
      const sent = toolOutputs(trail.witness.seen[1]?.request.messages ?? []).join('')
      c.eq(trail.toolRows[0]?.outcome, 'ok', 'the tool answers')
      c.ok(canariesIn(sent).includes(sibling.canary), 'and the tool repeats it')
    },
  )
}

export async function scopeMatrix(world: World, tally: Tally): Promise<void> {
  const cells = cellsOf(world)
  await tally.run('scope-matrix', 'cell count is the one fixed by hand', async (c) => {
    c.eq(cells.length, MATRIX_CELLS, 'matrix size')
  })
  let allowed = 0
  let refused = 0
  const reach: ReachLog = new Set()
  for (const cell of cells) {
    const name = `${cell.who.id} ${cell.probe} ${cell.chain.key}`
    await tally.run('scope-matrix', name, async (c) => {
      const door = await runCell(world, c, cell, reach)
      if (door.ok) allowed += 1
      else refused += 1
    })
  }
  await tally.run('scope-matrix', 'both answers occur', async (c) => {
    c.ok(allowed > 30, `${allowed} allowed cells is not a matrix`)
    c.ok(refused > 30, `${refused} refused cells is not a matrix`)
  })
  await reachCoverage(tally, reach)
  await grantCases(world, tally, (c, cell, log) => runCell(world, c, cell, log))
  await hiddenDealIsHidden(world, tally)
  await accountMatrix(world, tally)
  await historyMatrix(world, tally)
  await siblingContact(world, tally)
  for (const fact of FACTS) {
    const name = `fact: ${fact.who.id} ${fact.probe} ${fact.chain}`
    await tally.run('scope-facts', name, async (c) => {
      const chain = world.seeded.chains.get(fact.chain)
      if (!chain) throw new Error(`no chain ${fact.chain}`)
      const door = await askDoor(world, fact.who, fact.probe, chain)
      c.eq(door.ok, fact.allowed, fact.why)
    })
  }
}
