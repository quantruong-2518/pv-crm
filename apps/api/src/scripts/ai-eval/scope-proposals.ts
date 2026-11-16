import type { Actor } from '@pv/engines'
import { and, eq, sql } from 'drizzle-orm'
import { touch } from '@api/branches/sales/touch/touch.schema'
import { AiRouteRepository } from '@api/platform/ai/ai-route.repository'
import { AssistantProposalRepository } from '@api/platform/assistant/assistant-proposal.repository'
import { AssistantProposals } from '@api/platform/assistant/assistant-proposals.service'
import { AssistantToolGate } from '@api/platform/assistant/assistant-tools'
import { assistantProposal } from '@api/platform/assistant/assistant.schema'
import { audit } from '@api/platform/db/platform.schema'
import { PvError } from '@api/platform/http/problem'
import { releaseHour, runTurn } from './bench'
import type { Check, Tally } from './report'
import { NAMED_SEATS, ROLE_SEATS, wideSeatId } from './seed-data'
import { withRoute } from './stub-tools'
import type { World } from './world'

/** ADR 0162 cards on the real runner, doors and step hook: who gets a card, and what a
 *  press does. Runs AFTER `no-write`, because a press writes a step: the chain is
 *  `co-open`, which no case of the live run reads.
 *
 *  Each card comes from a scripted turn, so the loop's caps, rows and events are on
 *  the path; the press is the service the controller calls, built by hand as the
 *  world has no platform module. */

const GROUP = 'proposals'
const TOOL = 'propose_next_step'
const { saleA, saleB, bdCo } = NAMED_SEATS
const DUE = '2026-12-20'

const wide = (role: Parameters<typeof wideSeatId>[0]): Actor => {
  const found = ROLE_SEATS.find((s) => s.id === wideSeatId(role))
  if (!found) throw new Error(`no wide ${role} seat`)
  return found
}

type Input = { kind: 'lead' | 'opportunity'; code: string; action: 'set' | 'done' } & Partial<{
  text: string
  due: string
}>

const input = (i: Input) => ({ reason: 'Khách hẹn gọi lại.', ...i })

/** The status a press answered, or 200. */
async function status(work: Promise<unknown>): Promise<number> {
  try {
    await work
    return 200
  } catch (error) {
    if (error instanceof PvError) return error.getStatus()
    throw error
  }
}

function pressOf(world: World) {
  const source = { tools: () => world.tools, proposals: () => world.proposals }
  const gate = new AssistantToolGate(source, world.gateAccess)
  const routes = new AiRouteRepository(world.db)
  const cards = new AssistantProposalRepository(world.db)
  return { gate, press: new AssistantProposals(cards, gate, routes, world.audits, source) }
}

/** One turn whose model calls the tool with `calls`, then answers; the cards it left. */
async function cardsOf(world: World, who: Actor, calls: readonly Input[]) {
  const trail = await runTurn(world, {
    who,
    question: 'Đặt việc tiếp theo giúp tôi.',
    script: [
      { calls: calls.map((c) => ({ name: TOOL, input: input(c) })) },
      { deltas: ['Tôi đã để thẻ bên dưới, bạn bấm Làm nếu đồng ý.'] },
    ],
  })
  const rows = trail.turnId
    ? await world.db
        .select()
        .from(assistantProposal)
        .where(eq(assistantProposal.messageId, trail.turnId))
    : []
  return { trail, rows }
}

const stateOf = async (world: World, id: string) =>
  (await world.db.select().from(assistantProposal).where(eq(assistantProposal.id, id)))[0]?.state

const marks = async (world: World, code: string) =>
  (
    await world.db
      .select({ id: touch.id })
      .from(touch)
      .where(and(eq(touch.subjectCode, code), eq(touch.kind, 'assistant-applied')))
  ).length

const stepOf = async (world: World, code: string) =>
  (
    (await world.db.execute(
      sql`SELECT text, due::text AS due FROM sales.next_step WHERE subject_code = ${code}`,
    )) as unknown as { rows: { text: string; due: string }[] }
  ).rows[0] ?? null

function chainOf(world: World) {
  const chain = world.seeded.chains.get('co-open')
  if (!chain) throw new Error('no chain co-open')
  return chain
}

async function noCard(world: World, tally: Tally): Promise<void> {
  const { gate } = pressOf(world)
  const { lead, opportunity } = chainOf(world)
  const ask = (who: Actor, i: Input) => gate.call(who, { id: 'x', name: TOOL, input: input(i) })
  const cases: [string, Actor, Input][] = [
    ['presales holds no lead.edit', wide('presales'), { kind: 'lead', code: lead, action: 'set' }],
    [
      'marketing holds no opportunity.edit',
      wide('marketing'),
      { kind: 'opportunity', code: opportunity, action: 'set' },
    ],
    [
      'an own-only seller on another seller’s lead',
      saleB,
      { kind: 'lead', code: lead, action: 'set' },
    ],
    [
      'a BD on the deal reads the lead, holds it not',
      bdCo,
      { kind: 'lead', code: lead, action: 'set' },
    ],
  ]
  for (const [name, who, i] of cases) {
    await tally.run(GROUP, `no card: ${name}`, async (c) => {
      const verdict = await ask(who, { ...i, text: 'Gọi lại cho khách', due: DUE })
      c.eq(verdict.outcome, 'refused', 'the call is refused')
      c.ok(!verdict.proposal, 'no card is made')
    })
  }
  const links = [
    'Gửi báo giá qua https://evil.example/x',
    'Xem tại pebble.vn',
    'Mail ABC.COM',
    'Mở phầnmềm.vn',
    'Mở abc．vn',
    'Mở abc[.]vn',
  ]
  for (const text of links) {
    await tally.run(GROUP, `no card: a link in the text (${text})`, async (c) => {
      const verdict = await ask(saleA, { kind: 'lead', code: lead, action: 'set', text, due: DUE })
      c.ok(!verdict.proposal, 'no card is made')
      c.ok(JSON.stringify(verdict.output).includes('"link"'), 'the model is told why')
    })
  }
  await tally.run(GROUP, 'a city short form is no link: TP.HCM gets a card', async (c) => {
    const text = 'Hẹn gặp ở văn phòng TP.HCM'
    const verdict = await ask(saleA, { kind: 'lead', code: lead, action: 'set', text, due: DUE })
    c.ok(!!verdict.proposal, 'a card is made')
  })
  const signedChain = world.seeded.chains.get('a')
  const shut: [string, Input['kind'], string][] = [
    ['a converted lead', 'lead', signedChain?.lead ?? ''],
    ['a signed deal', 'opportunity', signedChain?.opportunity ?? ''],
  ]
  for (const [name, kind, code] of shut) {
    await tally.run(GROUP, `no card: ${name} is not open`, async (c) => {
      const text = 'Gọi lại cho khách'
      const verdict = await ask(saleA, { kind, code, action: 'set', text, due: DUE })
      c.ok(!verdict.proposal, 'no card is made')
      c.ok(JSON.stringify(verdict.output).includes('"not-open"'), 'the model is told why')
    })
  }
}

async function presses(world: World, tally: Tally): Promise<void> {
  const { press } = pressOf(world)
  const { lead, opportunity } = chainOf(world)
  const setLead = (text: string): Input => ({
    kind: 'lead',
    code: lead,
    action: 'set',
    text,
    due: DUE,
  })

  const first = await cardsOf(world, saleA, [
    setLead('Gọi lại cho khách'),
    setLead('Gửi lại báo giá'),
    { kind: 'opportunity', code: opportunity, action: 'set', text: 'Hẹn demo', due: DUE },
  ])
  const [leadCard, dealCard] = first.rows
  await tally.run(GROUP, 'one card per record: the second on the lead is refused', async (c) => {
    c.eq(first.rows.length, 2, 'two cards stored')
    c.eq(first.trail.events.filter((e) => e.type === 'proposal').length, 2, 'two card events')
    c.eq(
      first.trail.toolRows.map((r) => r.outcome),
      ['ok', 'refused', 'ok'],
      'call outcomes',
    )
  })
  if (!leadCard || !dealCard) return

  await tally.run(GROUP, 'another person’s card is not there: 404', async (c) => {
    c.eq(await status(press.apply(bdCo, dealCard.id)), 404, 'apply')
    c.eq(await status(press.dismiss(saleB, dealCard.id)), 404, 'dismiss')
    c.eq(await stateOf(world, dealCard.id), 'pending', 'the card is untouched')
  })
  await tally.run(GROUP, 'the route off refuses the press', async (c) => {
    const answered = await withRoute(world.db, sql`enabled = false`, () =>
      status(press.apply(saleA, leadCard.id)),
    )
    c.eq(answered, 409, 'apply while off')
    c.eq(await stateOf(world, leadCard.id), 'pending', 'the card is untouched')
  })
  await tally.run(GROUP, 'a press writes the step, one mark and one audit line', async (c) => {
    const card = await press.apply(saleA, leadCard.id)
    c.eq([card.state, card.canPress], ['applied', false], 'the card as it now stands')
    c.eq(await stepOf(world, lead), { text: 'Gọi lại cho khách', due: DUE }, 'the step')
    c.eq(await marks(world, lead), 1, 'one assistant-applied touch')
    const lines = await world.db
      .select({ code: audit.code })
      .from(audit)
      .where(sql`${audit.note} LIKE ${`assistant.proposal.applied · card ${leadCard.id}%`}`)
    c.eq(lines, [{ code: lead }], 'one audit line naming the record')
  })
  await tally.run(GROUP, 'a pressed card pressed again is 409', async (c) => {
    c.eq(await status(press.apply(saleA, leadCard.id)), 409, 'second press')
    c.eq(await marks(world, lead), 1, 'still one mark')
  })
  await tally.run(GROUP, 'dismiss then apply is 409', async (c) => {
    const card = await press.dismiss(saleA, dealCard.id)
    c.eq(card.state, 'dismissed', 'dismissed')
    c.eq(await status(press.apply(saleA, dealCard.id)), 409, 'apply after dismiss')
    c.eq(await stepOf(world, opportunity), null, 'no step on the deal')
  })

  await stalePress(world, tally, press, setLead)
  await doublePress(world, tally, press, lead)
  await expiredPress(world, tally, press, setLead)
  await handedPress(world, tally, press, setLead)
  await releaseHour(world, new Date(Date.now() - 60 * 60_000))
}

type Press = ReturnType<typeof pressOf>['press']

async function stalePress(world: World, tally: Tally, press: Press, setLead: (t: string) => Input) {
  const lead = chainOf(world).lead
  const { rows } = await cardsOf(world, saleA, [setLead('Hẹn gặp trực tiếp')])
  const card = rows[0]
  await tally.run(GROUP, 'a step moved under the card: 409, and the card is stale', async (c) => {
    if (!card) return c.ok(false, 'a card was stored')
    await world.db.execute(
      sql`UPDATE sales.next_step SET text = 'Đổi tay' WHERE subject_code = ${lead}`,
    )
    c.eq(await status(press.apply(saleA, card.id)), 409, 'the press')
    c.eq(await stateOf(world, card.id), 'stale', 'the card is stale')
    c.eq((await stepOf(world, lead))?.text, 'Đổi tay', 'the step is the hand-written one')
    c.eq(await marks(world, lead), 1, 'no second mark')
  })
}

async function doublePress(world: World, tally: Tally, press: Press, lead: string) {
  const { rows } = await cardsOf(world, saleA, [{ kind: 'lead', code: lead, action: 'done' }])
  const card = rows[0]
  await tally.run(GROUP, 'two presses at once write once', async (c) => {
    if (!card) return c.ok(false, 'a card was stored')
    const answered = await Promise.all([1, 2].map(() => status(press.apply(saleA, card.id))))
    c.eq([...answered].sort(), [200, 409], 'one press wins')
    c.eq(await marks(world, lead), 2, 'one more mark')
    c.eq(await stepOf(world, lead), null, 'the step is done, none follows')
    const done = await world.db
      .select({ id: touch.id })
      .from(touch)
      .where(and(eq(touch.subjectCode, lead), eq(touch.kind, 'next-step-done')))
    c.eq(done.length, 1, 'one next-step-done touch')
  })
}

async function expiredPress(
  world: World,
  tally: Tally,
  press: Press,
  setLead: (t: string) => Input,
) {
  const lead = chainOf(world).lead
  const { rows } = await cardsOf(world, saleA, [setLead('Gọi lại sau Tết')])
  const card = rows[0]
  await tally.run(GROUP, 'an expired card is 409 and writes nothing', async (c: Check) => {
    if (!card) return c.ok(false, 'a card was stored')
    await world.db
      .update(assistantProposal)
      .set({ expiresAt: sql`now() - interval '1 minute'` })
      .where(eq(assistantProposal.id, card.id))
    c.eq(await status(press.apply(saleA, card.id)), 409, 'apply')
    c.eq(await status(press.dismiss(saleA, card.id)), 409, 'dismiss')
    c.eq(await stateOf(world, card.id), 'pending', 'expired is read, not stored')
    c.eq(await stepOf(world, lead), null, 'no step written')
  })
}

/** A refusal that is not the step moving (here the lead handed to another seller) rolls
 *  the claim back: the door's own 403, and the card stays pending. */
async function handedPress(
  world: World,
  tally: Tally,
  press: Press,
  setLead: (t: string) => Input,
) {
  const lead = chainOf(world).lead
  const { rows } = await cardsOf(world, saleA, [setLead('Gọi lại xác nhận lịch')])
  const card = rows[0]
  await tally.run(GROUP, 'a lead handed away after the card: 403, card pending', async (c) => {
    if (!card) return c.ok(false, 'a card was stored')
    const owner = (id: string) =>
      world.db.execute(sql`UPDATE sales.lead SET owner_id = ${id} WHERE code = ${lead}`)
    await owner(saleB.id)
    try {
      c.eq(await status(press.apply(saleA, card.id)), 403, 'the press')
    } finally {
      await owner(saleA.id)
    }
    c.eq(await stateOf(world, card.id), 'pending', 'the card is still pending')
    c.eq(await stepOf(world, lead), null, 'no step written')
    c.eq(await marks(world, lead), 2, 'no new mark')
  })
}

export async function proposalPress(world: World, tally: Tally): Promise<void> {
  await noCard(world, tally)
  await presses(world, tally)
}
