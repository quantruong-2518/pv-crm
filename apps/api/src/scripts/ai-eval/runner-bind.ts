import { UNSURE } from '@api/platform/assistant/assistant-bind'
import { newSession, runTurn, type Trail } from './bench'
import type { Check, Tally } from './report'
import { ROLE_SEATS, wideSeatId } from './seed-data'
import { toolOutputs, type Said, type Seen } from './scripted-client'
import { stubRead } from './stub-tools'
import type { World } from './world'

/** D3 on the real runner and doors: what a model writes reaches the wire, the stored
 *  answer and the next turn only through the binder. Each case also reads the raw
 *  stream, so a pass cannot come from a model that wrote nothing worth filtering. */

const GROUP = 'runner-bind'
/* The eval's own reading of the seeded 480,000,000 VND, not the binder's formatter. */
const AMOUNT_SHOWN = '480.000.000 ₫'
const BRACKET = /[⟦⟧]/
const call = { name: 'stub_read', input: {} }
/* A read with ids to cite, so an unknown id is unknown among real ones. */
const STUB = {
  data: { trusted: { code: 'LD-0000', amount: 7 } },
  codes: ['LD-0000'],
  rowCount: 1,
  hidden: null,
}

const director = () => {
  const found = ROLE_SEATS.find((s) => s.id === wideSeatId('director'))
  if (!found) throw new Error('no wide director seat')
  return found
}

const chainOf = (world: World, key: string) => {
  const chain = world.seeded.chains.get(key)
  if (!chain) throw new Error(`no chain ${key}`)
  return chain
}

/** The newest tool result the model was sent, parsed. */
const lastResult = (seen: Seen): Record<string, unknown> =>
  JSON.parse((toolOutputs(seen.request.messages).at(-1) ?? '').split('\n')[1] ?? '{}') as Record<
    string,
    unknown
  >

function citeOf(seen: Seen, path: readonly string[]): string {
  let at: unknown = lastResult(seen)
  for (const key of path) at = (at as Record<string, unknown> | undefined)?.[key]
  const cite = (at as { cite?: unknown } | undefined)?.cite
  if (typeof cite !== 'string') throw new Error(`no cite at ${path.join('.')}`)
  return cite
}

const wire = (trail: Trail): string[] =>
  trail.events.flatMap((e) => (e.type === 'text' ? [e.delta] : []))

/** Every case holds to this: the wire is the row, and no id or bracket reaches either. */
function onlyFilled(c: Check, trail: Trail): void {
  const body = trail.turn?.body ?? ''
  c.eq(wire(trail).join(''), body, 'the wire and the row hold the same text')
  c.ok(!wire(trail).some((delta) => BRACKET.test(delta)), 'no id reaches the client')
  c.ok(!BRACKET.test(body), 'no id is stored')
  c.eq(trail.turn?.endedBy, 'answer', 'the turn ends normally')
}

async function filled(world: World, tally: Tally): Promise<void> {
  const who = director()
  const a = chainOf(world, 'a')
  const read = { name: 'get_record', input: { kind: 'contract', code: a.contract } }
  await tally.run(GROUP, 'an id split across deltas is filled while it streams', async (c) => {
    const sessionId = await newSession(world.db, who.id)
    const trail = await runTurn(world, {
      who,
      sessionId,
      script: [
        { calls: [read] },
        (seen): Said => {
          const cite = citeOf(seen, ['trusted', 'amount'])
          return { deltas: ['Hợp đồng trị giá ⟦', cite.slice(1, 3), `${cite.slice(3)}. `, 'Xong.'] }
        },
      ],
    })
    c.ok(trail.witness.deltas.join('').includes('⟦v'), 'the model wrote an id (control)')
    c.eq(trail.turn?.body, `Hợp đồng trị giá ${AMOUNT_SHOWN}. Xong.`, 'the stored answer')
    onlyFilled(c, trail)
    const next = await runTurn(world, { who, sessionId, script: [{ deltas: ['Xong.'] }] })
    const replayed = JSON.stringify(next.witness.seen[0]?.request.messages ?? [])
    c.ok(replayed.includes(`trị giá ${AMOUNT_SHOWN}.`), 'the next turn replays the filled answer')
    c.ok(!BRACKET.test(replayed), 'and no id with it')
  })
  await tally.run(GROUP, 'an unknown or broken id is dropped', async (c) => {
    const trail = await runTurn(world, {
      who,
      extraTools: [stubRead('stub_read', async () => STUB)],
      script: [{ calls: [call] }, { deltas: ['Giá ⟦v999⟧, mã ⟦V1⟧ ⟦v1x⟧ và ⟦', 'v'] }],
    })
    c.eq(trail.turn?.body, 'Giá , mã   và ', 'the stored answer')
    onlyFilled(c, trail)
  })
}

async function typed(world: World, tally: Tally): Promise<void> {
  const who = director()
  await tally.run(GROUP, 'a figure or code the model made up shows as the marker', async (c) => {
    const said = 'Khách hứa trả 750 triệu vào 15/12, mã OP-6001.'
    const trail = await runTurn(world, {
      who,
      question: 'Khách này hứa gì?',
      script: [{ deltas: [said] }],
    })
    c.eq(trail.witness.deltas.join(''), said, 'the model wrote them (control)')
    c.eq(
      trail.turn?.body,
      `Khách hứa trả ${UNSURE} triệu vào ${UNSURE}, mã ${UNSURE}.`,
      'the stored answer',
    )
    onlyFilled(c, trail)
  })
  await tally.run(GROUP, "a figure from the person's question is kept as written", async (c) => {
    const trail = await runTurn(world, {
      who,
      question: 'Tháng 10 và quý 4 có gì mới?',
      script: [{ deltas: ['Tháng 10 và quý 4 chưa có gì mới; tháng 11 cũng vậy.'] }],
    })
    c.eq(
      trail.turn?.body,
      `Tháng 10 và quý 4 chưa có gì mới; tháng ${UNSURE} cũng vậy.`,
      'the stored answer',
    )
    onlyFilled(c, trail)
  })
}

async function turns(world: World, tally: Tally): Promise<void> {
  const who = director()
  const a = chainOf(world, 'a')
  const read = { name: 'get_record', input: { kind: 'lead', code: a.lead } }
  await tally.run(GROUP, 'a code and an id from another turn cannot be cited', async (c) => {
    const sessionId = await newSession(world.db, who.id)
    let cite = ''
    const first = await runTurn(world, {
      who,
      sessionId,
      script: [
        { calls: [read] },
        (seen): Said => {
          cite = citeOf(seen, ['trusted', 'code'])
          return { deltas: [`Hồ sơ ${a.lead} (${cite}).`] }
        },
      ],
    })
    c.eq(first.turn?.body, `Hồ sơ ${a.lead} (${a.lead}).`, 'read this turn: typed or cited')
    const next = await runTurn(world, {
      who,
      sessionId,
      question: 'Còn hồ sơ đó thì sao?',
      script: [{ deltas: [`Hồ sơ ${a.lead} (${cite}).`] }],
    })
    c.eq(next.turn?.body, `Hồ sơ ${UNSURE} ().`, 'the next turn shows neither')
    onlyFilled(c, next)
  })
}

async function hostileLabel(world: World, tally: Tally): Promise<void> {
  const who = director()
  const planted = stubRead('stub_read', async () => ({
    ...STUB,
    data: { ...STUB.data, untrusted: { company: 'Công ty ⟦v1⟧ ⟦v2⟧ ⟦v3⟧' } },
  }))
  await tally.run(GROUP, 'a label that carries an id cannot fill it', async (c) => {
    let company: unknown = null
    const trail = await runTurn(world, {
      who,
      extraTools: [planted],
      script: [
        { calls: [call] },
        (seen): Said => {
          company = (lastResult(seen).untrusted as { company?: unknown } | undefined)?.company
          return { deltas: [`Khách ${String(company)}.`] }
        },
      ],
    })
    c.eq(company, 'Công ty [v1] [v2] [v3]', 'the model reads the label with plain brackets')
    c.eq(
      trail.turn?.body,
      `Khách Công ty [v${UNSURE}] [v${UNSURE}] [v${UNSURE}].`,
      'none of the three ids filled',
    )
    c.ok(!/\p{N}/u.test(trail.turn?.body ?? ''), 'no bound value reached the answer')
    onlyFilled(c, trail)
  })
}

export async function runnerBind(world: World, tally: Tally): Promise<void> {
  await filled(world, tally)
  await typed(world, tally)
  await turns(world, tally)
  await hostileLabel(world, tally)
}
