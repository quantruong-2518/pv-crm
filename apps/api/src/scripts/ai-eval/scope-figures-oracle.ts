import type { Actor } from '@pv/engines'
import { runTurn, trailText, type Trail } from './bench'
import type { Check } from './report'
import { chainOf, gateLinesOnly, shutDoors, toolBody, type Json } from './scope-customers-oracle'
import { askCall, canariesIn } from './scope-door'
import { parrot } from './scripted-client'
import type { Seat } from './seed-data'
import type { World } from './world'

/** The two figure tools, one call by one seat, against the one door the call stands on.
 *  Neither tool reads more than one door, so a call is refused exactly when that door
 *  refuses: E2 shuts it (the gate writes its refusal line) or the service does, as the
 *  money door does an `ownOnly` reader (no line). An answer is held to the door's own
 *  body, put into the shape the tool says it hands out. Neither tool names a record or
 *  has a canary to carry: not one may reach the request. */

export type FigureCall = { name: string; input: Record<string, unknown> }
export type FigureCell = { name: string; who: Seat; call: FigureCall }

/** What a tool says of one door body: its answer, and how many blocks or rows it counts. */
export type Shaped = { out: object; rowCount: number }
export type Shape = (
  bodies: Readonly<Record<string, unknown>>,
  input: FigureCall['input'],
) => Shaped

export type Expected =
  { refused: true; allShut: boolean } | { refused: false; out: Json; rowCount: number }

/** As the tool's answer is read back: JSON, so a field the tool left undefined is not there. */
export const wire = (value: object): Json => JSON.parse(JSON.stringify(value)) as Json

export async function expectedOf(
  world: World,
  who: Actor,
  call: FigureCall,
  shape: Shape,
): Promise<Expected> {
  const { keys, shut } = shutDoors(world, who as Seat, call)
  if (shut.length > 0) return { refused: true, allShut: shut.length === keys.length }
  /* The adapters ask no chain; any one stands for the type. */
  const door = await askCall(world, who, call, chainOf(world, 'care-own'))
  if (!door.ok) return { refused: true, allShut: false }
  const { out, rowCount } = shape(door.bodies, call.input)
  return { refused: false, out: wire(out), rowCount }
}

function agreeOnRefusal(c: Check, want: Expected & { refused: true }, trail: Trail): void {
  const [row] = trail.toolRows
  c.eq(row?.outcome, 'refused', 'the tool must refuse what the door refuses')
  c.eq(row?.codes, [], 'a refused tool names no record')
  c.eq(row?.revealsContent, false, 'a refusal reveals nothing')
  c.eq(canariesIn(trailText(trail)), [], 'a canary in a refused turn')
  const { out } = toolBody(trail)
  c.eq(out.error, want.allShut ? 'not-allowed' : 'not-found-or-not-allowed', 'the refusal says why')
  c.eq(Object.keys(out), ['error'], 'a refusal carries no figure')
  c.ok(!trail.audits.some((a) => a.action === 'ai-read'), 'a refused call writes no ai-read line')
  const line = trail.audits.some((a) => a.action === 'view' && !!a.note?.includes('chặn'))
  c.ok(line === want.allShut, 'the gate writes its refusal line only when E2 shuts the door')
}

function agreeOnAnswer(c: Check, want: Expected & { refused: false }, trail: Trail): void {
  const [row] = trail.toolRows
  c.eq(row?.outcome, 'ok', 'the tool must answer what the door answers')
  c.eq(row?.codes, [], 'a figure answer names no record')
  c.eq(row?.rowCount, want.rowCount, 'the rows')
  c.eq(row?.revealsContent, true, 'a figure is content to replay under its permission')
  c.eq(row?.hidden, null, 'a figure answer hides nothing')
  c.eq(toolBody(trail).out, want.out, 'the answer, as the door gives it')
  c.eq(canariesIn(trailText(trail)), [], 'a canary in a figure answer')
}

/** One call by one seat, against what the door hands the same seat. */
export async function runFigureCell(
  world: World,
  c: Check,
  cell: FigureCell,
  shape: Shape,
): Promise<Expected> {
  const want = await expectedOf(world, cell.who, cell.call, shape)
  const trail = await gateLinesOnly(world, c, () =>
    runTurn(world, { who: cell.who, script: [{ calls: [cell.call] }, parrot] }),
  )
  c.eq(trail.turn?.endedBy, 'answer', 'the turn ends normally')
  if (want.refused) agreeOnRefusal(c, want, trail)
  else agreeOnAnswer(c, want, trail)
  return want
}
