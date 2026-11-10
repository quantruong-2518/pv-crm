import { runTurn, trailText, type Trail } from './bench'
import type { Check, Tally } from './report'
import { askCall, canariesIn, needOf, optionalDrift, unbound, type DoorAnswer } from './scope-door'
import { contentLines, SUMMARY_LINE, TRANSCRIPT_LINE } from './scope-history-audit'
import { reachRecheck } from './scope-history-reach'
import { contactsIn, holdsExport } from './scope-reach'
import { parrot, toolOutputs } from './scripted-client'
import {
  canariesOf,
  HISTORY_CELLS,
  NAMED_SEATS,
  RICH_COMMS,
  RICH_TOUCHES,
  ROLE_SEATS,
  ROLES,
  wideSeatId,
  type Seat,
} from './seed-data'
import type { Chain } from './seed'
import type { World } from './world'

/** `get_history`, seat by seat. The oracle asks the three doors as the seat and the
 *  tool must show exactly their newest 20, with what is cut told by `more`. What a
 *  door refuses to a part that is not the first is `skipped` and never "no history".
 *
 *  Three things hold for every seat: a transcript never appears (the tool reads none,
 *  and the doors it opens write no transcript audit line), a rule the doors enforce
 *  stays enforced (no summary without `comm.view-content`, no phone without
 *  `data.export`), and a row cut by the 20 shows nowhere. A stored answer that read a
 *  summary is shut again when the reader loses the comms door's reach (`scope-history-reach`). */

const GROUP = 'scope-history'
const CALL = 'get_history'
/* Typed, not imported: the tool's list size and the loop's token ceiling are what is under test. */
const LIST = 20
const TOKEN_CAP = 40_000

type Kind = 'lead' | 'opportunity'
type HistoryCell = { name: string; who: Seat; kind: Kind; chain: string }

type Listed = {
  trusted?: { count?: number; more?: boolean }
  rows?: { trusted?: Record<string, unknown>; untrusted?: Record<string, unknown> }[]
}
type Out = {
  trusted?: { skipped?: string[] }
  touches?: Listed
  comms?: Listed
  meetings?: Listed
  contactInfoWithheld?: unknown
}

const seatOf = (id: string): Seat => {
  const found = ROLE_SEATS.find((s) => s.id === id)
  if (!found) throw new Error(`no seat ${id}`)
  return found
}

type Permission = Seat['permissions'][number]

const grant = (seat: Seat, permission: Permission): Seat => ({
  ...seat,
  permissions: [...seat.permissions, permission],
})

const without = (seat: Seat, permission: Permission): Seat => ({
  ...seat,
  permissions: seat.permissions.filter((p) => p !== permission),
})

function cellsOf(): HistoryCell[] {
  const { saleA, saleB, bdCo, collector, unlicensed } = NAMED_SEATS
  const on = (who: Seat, chain: string, kinds: readonly Kind[] = ['lead', 'opportunity']) =>
    kinds.map((kind) => ({ name: `${who.id} ${kind} ${chain}`, who, kind, chain }))
  const executive = seatOf(wideSeatId('account-executive'))
  return [
    ...ROLES.flatMap((role) =>
      ROLE_SEATS.filter((s) => s.roleIds[0] === role).flatMap((who) => [
        ...on(who, `own-${role}`),
        ...on(who, 'rival', ['lead']),
      ]),
    ),
    ...on(saleA, 'a'),
    ...on(saleA, 'b', ['lead']),
    ...on(saleB, 'a', ['lead']),
    ...on(saleB, 'b'),
    ...on(bdCo, 'co-open'),
    ...on(bdCo, 'co-signed'),
    ...on(collector, 'collected'),
    ...on(unlicensed, 'rival', ['lead']),
    ...on(without(executive, 'comm.view-content'), 'hist-rich', ['lead']).map((c) => ({
      ...c,
      name: 'executive without comm.view-content lead hist-rich',
    })),
    ...on(without(executive, 'data.export'), 'a', ['lead']).map((c) => ({
      ...c,
      name: 'executive without data.export lead a',
    })),
    ...on(grant(saleA, 'data.export'), 'a', ['lead']).map((c) => ({
      ...c,
      name: 'sale-a with data.export lead a',
    })),
    ...on(saleA, 'hist-rich'),
    ...on(executive, 'hist-rich'),
    ...on(executive, 'hist-wide', ['lead']),
  ]
}

function chainOf(world: World, key: string): Chain {
  const found = world.seeded.chains.get(key)
  if (!found) throw new Error(`no chain ${key}`)
  return found
}

/** The tool's answer as the second request carried it, without the binder's frame. */
function toolBody(trail: Trail): { out: Out; text: string } {
  const [, text = '{}'] = (
    toolOutputs(trail.witness.seen[1]?.request.messages ?? [])[0] ?? ''
  ).split('\n')
  const { rows: _cited, ...parsed } = JSON.parse(text) as { rows?: unknown }
  return { out: unbound(parsed) as Out, text }
}

const callOf = (cell: HistoryCell, chain: Chain) => ({
  name: CALL,
  input: { kind: cell.kind, code: cell.kind === 'lead' ? chain.lead : chain.opportunity },
})

/** The newest 20 of a door's rows, as the tool orders them. */
function newest<R extends { createdAt?: string; at?: string }>(rows: readonly R[]): R[] {
  const when = (r: R) => Date.parse(r.createdAt ?? r.at ?? '')
  return [...rows].sort((a, b) => when(b) - when(a)).slice(0, LIST)
}

type Bodies = {
  touches?: { rows: unknown[] }
  comms?: { rows: unknown[] }
  meetings?: { rows: unknown[] }
}

function bodiesOf(door: Extract<DoorAnswer, { ok: true }>, kind: Kind): Bodies {
  const owner = kind === 'lead' ? 'LeadController' : 'OpportunityController'
  const at = (id: string) => door.bodies[id] as { rows: unknown[] } | undefined
  return {
    touches: at(`${owner}.touches`),
    comms: at('DebriefController.list'),
    meetings: at(`${owner}.meetings`),
  }
}

const PART = { comms: 'comms', leadMeetings: 'meetings', dealMeetings: 'meetings' } as Record<
  string,
  string
>

/** Every transcript and every cut row of the world: none may ever reach a request. */
function forbidden(world: World): string[] {
  return [...world.seeded.chains.values()].flatMap((chain) => {
    const c = canariesOf(chain.n)
    return [c.transcript, c.cut]
  })
}

/** The gate writes its line only when E2 shuts every door; a service refusal leaves none. */
function agreeOnRefusal(c: Check, cell: HistoryCell, trail: Trail, allShut: boolean): void {
  const [row] = trail.toolRows
  c.eq(row?.outcome, 'refused', 'the tool must refuse what the doors refuse')
  c.eq(row?.codes, [], 'a refused tool names no record')
  c.ok(!trail.audits.some((a) => a.action === 'ai-read'), 'a refused call writes no ai-read line')
  c.eq(canariesIn(trailText(trail)), [], 'a canary in a refused turn')
  c.ok(!toolBody(trail).text.includes('"touches"'), 'a refusal is not an empty history')
  if (allShut) {
    c.ok(
      trail.audits.some((a) => a.action === 'view' && !!a.note?.includes('chặn')),
      `the gate writes the refusal of ${cell.name}`,
    )
  }
}

function closedDoors(world: World, who: Seat, call: { name: string; input: unknown }) {
  const tool = world.tools.find((t) => t.name === call.name)
  const prepared = tool?.prepare(call.input)
  if (!tool || !prepared?.ok) throw new Error(`oracle: ${call.name} does not take this input`)
  const shut = prepared.doorKeys.filter((key) => {
    const named = tool.doors[key]
    return !named || !world.doorAccess.check(who, needOf(named)).ok
  })
  return { keys: prepared.doorKeys, shut }
}

async function runCell(world: World, c: Check, cell: HistoryCell): Promise<void> {
  const chain = chainOf(world, cell.chain)
  const call = callOf(cell, chain)
  const { result: trail, lines } = await contentLines(world, () =>
    runTurn(world, { who: cell.who, script: [{ calls: [call] }, parrot] }),
  )
  c.eq(trail.turn?.endedBy, 'answer', 'the turn ends normally')
  c.eq(
    lines.filter((l) => l.startsWith(TRANSCRIPT_LINE)),
    [],
    'the tool leaves no transcript audit line',
  )
  const door = await askCall(world, cell.who, call, chain)
  const { keys, shut } = closedDoors(world, cell.who, call)
  if (!door.ok) return agreeOnRefusal(c, cell, trail, shut.length === keys.length)

  const [row] = trail.toolRows
  const { out, text } = toolBody(trail)
  const bodies = bodiesOf(door, cell.kind)
  c.eq(row?.outcome, 'ok', 'the tool must answer what the doors answer')
  c.eq(row?.codes, [call.input.code], 'the tool names the one record')
  const shown = (b?: { rows: unknown[] }) => Math.min(LIST, b?.rows.length ?? 0)
  c.eq(
    row?.rowCount,
    shown(bodies.touches) + shown(bodies.comms) + shown(bodies.meetings),
    'the rows it shows are the newest 20 of each list',
  )

  const want = [...new Set(door.skipped.map((key) => PART[key] ?? key))].sort()
  c.eq([...(out.trusted?.skipped ?? [])].sort(), want, 'the parts the model is told it lacks')
  const lists = { touches: out.touches, comms: out.comms, meetings: out.meetings }
  for (const [part, list] of Object.entries(lists)) {
    const body = bodies[part as keyof Bodies]
    c.eq(list !== undefined, body !== undefined, `${part} is shown exactly when its door answered`)
    if (!list || !body) continue
    c.eq(list.trusted?.count, body.rows.length, `${part}: the door's own count`)
    c.eq(list.trusted?.more, body.rows.length > LIST, `${part}: more past ${LIST}`)
    c.eq(list.rows?.length, shown(body), `${part}: rows shown`)
  }

  const everything = trailText(trail)
  const hidden = forbidden(world)
  c.eq(
    canariesIn(everything).filter((t) => hidden.includes(t)),
    [],
    'a transcript or a cut row reached the turn',
  )
  const doorShown = new Set(canariesIn(door.json))
  c.eq(
    [...new Set(canariesIn(everything).filter((t) => !doorShown.has(t)))],
    [],
    'a canary the doors never showed',
  )

  const summaries = out.comms?.rows?.map((r) => r.trusted?.summaryShown) ?? []
  const visible = newest(
    (bodies.comms?.rows ?? []) as { createdAt: string; summary: { state: string } }[],
  ).map((r) => r.summary.state === 'visible')
  c.eq(summaries, visible, 'a summary is shown exactly when the door shows it')
  const summaryLine = lines.some((l) => l.startsWith(SUMMARY_LINE))
  /* The door audits every summary it reveals, not only the 20 the tool shows. */
  const revealed = ((bodies.comms?.rows ?? []) as { summary: { state: string } }[]).some(
    (r) => r.summary.state === 'visible',
  )
  c.eq(summaryLine, revealed, 'the comms door writes its summary line exactly when it reveals one')
  if (!cell.who.permissions.includes('comm.view-content')) {
    c.ok(!summaryLine, 'no summary audit line for a seat without comm.view-content')
    c.ok(!summaries.some(Boolean), 'no summary for a seat without comm.view-content')
    c.ok(!everything.includes(canariesOf(chain.n).summary), 'no summary text without the grant')
  }

  const holder = holdsExport(cell.who)
  const atDoor = contactsIn(door.json)
  if (holder) {
    c.eq(
      atDoor.filter((v) => !text.includes(v)),
      [],
      'the door showed a contact, the model lacks it',
    )
  } else {
    c.eq(contactsIn(everything), [], 'phones and mails left for a seat without data.export')
  }
  c.eq(
    out.contactInfoWithheld,
    !holder && atDoor.length > 0 ? true : undefined,
    'the flag follows the mask',
  )

  const reads = trail.audits.filter((a) => a.action === 'ai-read' && a.code)
  c.eq(
    reads.map((a) => a.code),
    [call.input.code],
    'one ai-read line for the record',
  )
  for (const key of keys) {
    const line = trail.audits.some((a) => a.action === 'view' && !!a.note?.includes(key))
    c.eq(line, shut.includes(key), `the refusal line of ${key}`)
  }
  if (row && row.rowCount !== null && row.rowCount > 0) {
    c.ok(canariesIn(trail.witness.deltas.join('')).length > 0, 'an allowed read reaches the model')
  }
}

/** A co-owner opens the touches and the comms door refuses it: told, and not empty. */
async function coOwner(world: World, tally: Tally): Promise<void> {
  await tally.run(GROUP, 'a co-owner is refused at comms and told so', async (c) => {
    const chain = chainOf(world, 'co-open')
    const call = { name: CALL, input: { kind: 'opportunity', code: chain.opportunity } }
    const who = NAMED_SEATS.bdCo
    const owner = await askCall(world, NAMED_SEATS.saleA, call, chain)
    const door = await askCall(world, who, call, chain)
    c.ok(owner.ok && owner.skipped.length === 0, 'the owner reads all three parts')
    c.ok(
      owner.ok && bodiesOf(owner, 'opportunity').comms !== undefined,
      'the owner has a comms list to be refused',
    )
    c.ok(door.ok && door.skipped.includes('comms'), 'the oracle: comms refuses the co-owner')
    const trail = await runTurn(world, { who, script: [{ calls: [call] }, parrot] })
    const [row] = trail.toolRows
    const { out } = toolBody(trail)
    c.eq(row?.outcome, 'ok', 'the call still answers')
    c.ok(out.trusted?.skipped?.includes('comms') ?? false, 'the model is told comms was skipped')
    c.ok(!('comms' in out), 'no comms key, so no "no contact records"')
    c.ok((out.touches?.trusted?.count ?? 0) > 0, 'the touches are there')
  })
}

/** Everything a transcript could ride on: the door hands it to a holder, the tool never does. */
async function transcript(world: World, tally: Tally): Promise<void> {
  await tally.run(GROUP, 'the transcript is at the door and never in the turn', async (c) => {
    const chain = chainOf(world, 'a')
    const who = seatOf(wideSeatId('account-executive'))
    const call = { name: CALL, input: { kind: 'lead', code: chain.lead } }
    const token = canariesOf(chain.n).transcript
    const asked = await contentLines(world, () => askCall(world, who, call, chain))
    const door = asked.result
    c.ok(door.ok && door.json.includes(token), 'the meeting door hands a holder the transcript')
    c.ok(
      asked.lines.some((l) => l.startsWith(TRANSCRIPT_LINE)),
      'the detector: the meeting door itself writes a transcript line',
    )
    const turn = await contentLines(world, () =>
      runTurn(world, { who, script: [{ calls: [call] }, parrot] }),
    )
    const trail = turn.result
    c.eq(
      turn.lines.filter((l) => l.startsWith(TRANSCRIPT_LINE)),
      [],
      'the tool writes none',
    )
    c.ok(
      turn.lines.some((l) => l.startsWith(SUMMARY_LINE)),
      'a holder reading a summary leaves its line',
    )
    c.ok(trail.toolRows[0]?.outcome === 'ok', 'the tool answers')
    c.ok(!trailText(trail).includes(token), 'the transcript is nowhere in the turn')
    c.ok(canariesIn(trailText(trail)).includes(canariesOf(chain.n).meetingTitle), 'the meeting is')
  })
}

/** 24 touches and 22 comms: the cut is real, with the rows that are shown ordered newest first. */
async function richCut(world: World, tally: Tally): Promise<void> {
  await tally.run(GROUP, 'the rich record is cut at 20 and says so', async (c) => {
    const chain = chainOf(world, 'hist-rich')
    const who = seatOf(wideSeatId('account-executive'))
    const call = { name: CALL, input: { kind: 'lead', code: chain.lead } }
    const trail = await runTurn(world, { who, script: [{ calls: [call] }, parrot] })
    const { out } = toolBody(trail)
    c.eq(out.touches?.trusted, { count: RICH_TOUCHES, more: true }, 'touches')
    c.eq(out.comms?.trusted, { count: RICH_COMMS, more: true }, 'comms')
    c.eq(out.touches?.rows?.length, LIST, 'touch rows')
    c.eq(out.comms?.rows?.length, LIST, 'comm rows')
    c.eq(out.meetings?.trusted, { count: 1, more: false }, 'meetings')
    c.ok(!trailText(trail).includes(canariesOf(chain.n).cut), 'no row past the 20')
    c.ok(
      (out.touches?.rows?.[0]?.untrusted?.note as string | undefined)?.includes(
        canariesOf(chain.n).touchNote,
      ) ?? false,
      'the newest touch is first',
    )
  })
}

/** Twenty full summaries against the loop's 40k-token ceiling: the realistic read fits,
 *  the widest possible one goes over, and what goes over reaches the model as nothing. */
async function ceiling(world: World, tally: Tally): Promise<void> {
  const who = seatOf(wideSeatId('account-executive'))
  await tally.run(GROUP, 'twenty long summaries still fit under the token ceiling', async (c) => {
    const chain = chainOf(world, 'hist-rich')
    const call = { name: CALL, input: { kind: 'lead', code: chain.lead } }
    const trail = await runTurn(world, { who, script: [{ calls: [call] }, parrot] })
    const [row] = trail.toolRows
    c.eq(row?.outcome, 'ok', 'the read is answered')
    c.eq(row?.truncated, false, 'nothing is cut')
    c.ok((row?.toolTokens ?? 0) > 10_000, `${row?.toolTokens} tokens is not a long read`)
    c.ok((row?.toolTokens ?? TOKEN_CAP) < TOKEN_CAP, `${row?.toolTokens} tokens is over the cap`)
    c.eq(trail.turn?.endedBy, 'answer', 'the turn ends normally')
  })
  await tally.run(GROUP, 'the widest summaries go over the ceiling and leak nothing', async (c) => {
    const chain = chainOf(world, 'hist-wide')
    const call = { name: CALL, input: { kind: 'lead', code: chain.lead } }
    const trail = await runTurn(world, { who, script: [{ calls: [call] }, parrot] })
    const [row] = trail.toolRows
    c.eq(row?.outcome, 'over-cap', 'the read is dropped whole')
    c.eq(row?.truncated, true, 'and marked cut')
    c.eq(trail.turn?.endedBy, 'cap-tokens', 'the turn says why')
    c.eq(canariesIn(trailText(trail)), [], 'nothing of it went along')
  })
}

export async function historyMatrix(world: World, tally: Tally): Promise<void> {
  await tally.run(GROUP, 'the optional doors are the ones the oracle pins', async (c) => {
    c.eq(optionalDrift(world.tools), [], 'registration against the oracle')
  })
  const cells = cellsOf()
  await tally.run(GROUP, 'cell count is the one fixed by hand', async (c) => {
    c.eq(cells.length, HISTORY_CELLS, 'matrix size')
  })
  for (const cell of cells) {
    if (cell.chain === 'hist-wide') continue
    await tally.run(GROUP, cell.name, (c) => runCell(world, c, cell))
  }
  await coOwner(world, tally)
  await transcript(world, tally)
  await richCut(world, tally)
  await ceiling(world, tally)
  await reachRecheck(world, tally)
}
