import type { AfterSaleBookResponse } from '@pv/contracts'
import type { Actor } from '@pv/engines'
import { AfterSaleController } from '@api/branches/sales/after-sale/after-sale.controller'
import { LeadController } from '@api/branches/sales/lead/lead.controller'
import { runTurn, trailText, type Trail } from './bench'
import type { Check } from './report'
import { askCall, canariesIn, doorId, leaves, needOf, unbound } from './scope-door'
import { auditCount } from './scope-history-audit'
import { holdsExport, maskedLeaves } from './scope-reach'
import { parrot, toolOutputs } from './scripted-client'
import { ROLE_SEATS, type Seat } from './seed-data'
import type { Chain } from './seed'
import type { World } from './world'

/** `list_customers`, seat by seat. The oracle asks the three doors as the seat: the
 *  after-sale book, the lead book for the leads on its page, and the lead profile for
 *  the ones the book left out. A row stays only when one of the last two opens its lead;
 *  every other row is counted in `hidden`. The book and the lead book must both be open
 *  or the call is refused. What the tool shows never carries `collected`: the book sums
 *  every contract of a lead, past an ownOnly scope. */

export const GROUP = 'scope-customers'
export const CALL = 'list_customers'
const BOOK = doorId([AfterSaleController, 'list'])
const LEADS = doorId([LeadController, 'book'])
const PROFILE = doorId([LeadController, 'profile'])

export type Json = Record<string, unknown>
type Row = AfterSaleBookResponse['rows'][number]

export type ListCell = { name: string; who: Seat; input: Record<string, unknown> }

export const seatOf = (id: string): Seat => {
  const found = ROLE_SEATS.find((s) => s.id === id)
  if (!found) throw new Error(`no seat ${id}`)
  return found
}

type Permission = Seat['permissions'][number]
export const without = (seat: Seat, permission: Permission): Seat => ({
  ...seat,
  permissions: seat.permissions.filter((p) => p !== permission),
})

export function chainOf(world: World, key: string): Chain {
  const found = world.seeded.chains.get(key)
  if (!found) throw new Error(`no chain ${key}`)
  return found
}

/** The doors of the call this seat is shut out of, as E2 says it. */
export function shutDoors(world: World, who: Seat, call: { name: string; input: unknown }) {
  const tool = world.tools.find((t) => t.name === call.name)
  const prepared = tool?.prepare(call.input)
  if (!tool || !prepared?.ok) throw new Error(`oracle: ${call.name} does not take this input`)
  const shut = prepared.doorKeys.filter((key) => {
    const named = tool.doors[key]
    return !named || !world.doorAccess.check(who, needOf(named)).ok
  })
  return { keys: prepared.doorKeys, shut }
}

export type Expected =
  | { refused: true; allShut: boolean }
  | {
      refused: false
      page: AfterSaleBookResponse
      kept: Row[]
      booked: ReadonlySet<string>
      opened: ReadonlySet<string>
      hidden: number
      shut: string[]
      json: string
    }

/** What the doors hand this seat, put together the way the tool says it does. */
export async function expectedOf(world: World, who: Actor, input: object): Promise<Expected> {
  const call = { name: CALL, input }
  const { keys, shut } = shutDoors(world, who as Seat, call)
  if (shut.includes('customers') || shut.includes('leads')) {
    return { refused: true, allShut: shut.length === keys.length }
  }
  /* The adapters ask no chain; any one stands for the type. */
  const door = await askCall(world, who, call, chainOf(world, 'care-own'))
  if (!door.ok) return { refused: true, allShut: false }
  const page = door.bodies[BOOK] as AfterSaleBookResponse
  const booked = new Set((door.bodies[LEADS] as { rows: string[] }).rows)
  const opened = new Set((door.bodies[PROFILE] as { rows: string[] } | undefined)?.rows ?? [])
  const kept = page.rows.filter((r) => booked.has(r.leadCode) || opened.has(r.leadCode))
  const hidden = page.hidden + page.rows.length - kept.length
  return { refused: false, page, kept, booked, opened, hidden, shut, json: JSON.stringify(page) }
}

/** The tool's answer as the second request carried it, without the binder's frame. */
export function toolBody(trail: Trail): { out: Json; text: string; rows: unknown } {
  const [, text = '{}'] = (
    toolOutputs(trail.witness.seen[1]?.request.messages ?? [])[0] ?? ''
  ).split('\n')
  const { rows, ...parsed } = JSON.parse(text) as { rows?: unknown }
  return { out: unbound(parsed) as Json, text, rows: unbound(rows) }
}

export const dig = (value: unknown, ...path: string[]): unknown =>
  path.reduce<unknown>((at, key) => (at as Json | undefined)?.[key], value)

/** Every line of the turn is the gate's own: the doors write none of theirs. */
export async function gateLinesOnly(world: World, c: Check, run: () => Promise<Trail>) {
  const before = await auditCount(world)
  const trail = await run()
  c.eq(
    (await auditCount(world)) - before,
    trail.audits.length,
    'the doors write no audit line of their own',
  )
  return trail
}

function agreeOnRefusal(c: Check, want: Expected & { refused: true }, trail: Trail): void {
  const [row] = trail.toolRows
  c.eq(row?.outcome, 'refused', 'the tool must refuse what the doors refuse')
  c.eq(row?.codes, [], 'a refused tool names no record')
  c.ok(!trail.audits.some((a) => a.action === 'ai-read'), 'a refused call writes no ai-read line')
  c.eq(row?.revealsContent, false, 'a refusal reveals nothing')
  c.eq(canariesIn(trailText(trail)), [], 'a canary in a refused turn')
  c.ok(!toolBody(trail).text.includes('"customers"'), 'a refusal is not an empty book')
  const line = trail.audits.some((a) => a.action === 'view' && !!a.note?.includes('chặn'))
  if (want.allShut) c.ok(line, 'the gate writes the refusal')
}

function agreeOnAnswer(
  c: Check,
  who: Seat,
  want: Expected & { refused: false },
  trail: Trail,
): void {
  const [row] = trail.toolRows
  const codes = [...new Set(want.kept.map((r) => r.leadCode))].sort()
  c.eq(row?.outcome, 'ok', 'the tool must answer what the doors answer')
  c.eq([...(row?.codes ?? [])].sort(), codes, 'the kept leads, and no run code')
  c.eq(row?.rowCount, want.kept.length, 'the kept rows')
  c.eq(row?.hidden, want.hidden, 'the door hidden count plus the rows dropped')
  c.eq(row?.revealsContent, want.page.rows.length > 0, 'it reveals when the book gave rows')

  const { out, text, rows } = toolBody(trail)
  const shown = (dig(out, 'customers', 'rows') ?? []) as Json[]
  c.eq(
    shown.map((r) => dig(r, 'trusted', 'code')),
    want.kept.map((r) => r.code),
    'the rows, in the door order',
  )
  c.eq(
    shown.map((r) => dig(r, 'trusted', 'leadCode')),
    want.kept.map((r) => r.leadCode),
    'the lead of each row',
  )
  c.eq(
    dig(out, 'customers', 'trusted'),
    { more: want.page.total > want.page.rows.length },
    'only `more`, no count that would include a dropped row',
  )
  c.eq(rows, want.kept.length, 'the rows the model may cite')
  c.ok(!/collected/i.test(text), 'no collected sum, past an ownOnly scope')
  c.eq(out.hidden, want.hidden, 'hidden reaches the model')

  /* The mask stands in for a door string only where that string held a contact. */
  const atDoor = leaves(JSON.parse(want.json))
  const allowed = new Set(holdsExport(who) ? atDoor : [...atDoor, ...maskedLeaves(atDoor)])
  c.eq(
    leaves(shown).filter((leaf) => !allowed.has(leaf)),
    [],
    'the tool hands over nothing the book did not',
  )
  const dropped = want.page.rows.filter((r) => !want.kept.includes(r))
  const everything = trailText(trail)
  for (const r of dropped) {
    c.ok(!everything.includes(r.leadCode), `the dropped lead ${r.leadCode} stays out`)
    c.ok(!everything.includes(r.code), `the dropped run ${r.code} stays out`)
  }

  const reads = trail.audits.filter((a) => a.action === 'ai-read' && a.code)
  c.eq(reads.map((a) => a.code).sort(), codes, 'one ai-read line per kept lead')
  const counted = trail.audits.filter((a) => a.action === 'ai-read' && !a.code)
  c.eq(
    counted.map((a) => a.note?.split(' · ').slice(-2).join(' · ')),
    want.hidden > 0 ? [`${want.kept.length} row(s) · ${want.hidden} hidden`] : [],
    'a hidden count is written once',
  )
  for (const key of want.shut) {
    c.ok(
      trail.audits.some((a) => a.action === 'view' && !!a.note?.includes(` · ${key} · `)),
      `the refusal line of ${key}`,
    )
  }
  if (want.kept.length === 0 && want.hidden === 0)
    c.eq(trail.audits, [], 'nothing, nothing written')
}

export async function runList(world: World, c: Check, cell: ListCell): Promise<Expected> {
  const want = await expectedOf(world, cell.who, cell.input)
  const call = { name: CALL, input: cell.input }
  const trail = await gateLinesOnly(world, c, () =>
    runTurn(world, { who: cell.who, script: [{ calls: [call] }, parrot] }),
  )
  c.eq(trail.turn?.endedBy, 'answer', 'the turn ends normally')
  if (want.refused) agreeOnRefusal(c, want, trail)
  else agreeOnAnswer(c, cell.who, want, trail)
  const door = want.refused ? '' : want.json
  const shownAtDoor = new Set(canariesIn(door))
  c.eq(
    [...new Set(canariesIn(trailText(trail)).filter((t) => !shownAtDoor.has(t)))],
    [],
    'a canary the book never showed',
  )
  return want
}
