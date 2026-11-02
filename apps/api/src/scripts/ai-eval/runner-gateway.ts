import { sql } from 'drizzle-orm'
import { AiVendorError } from '@api/platform/ai/ai-client'
import { ASSISTANT_PROMPT_VERSION } from '@api/platform/assistant/assistant-context'
import { runTurn } from './bench'
import type { Tally } from './report'
import { NAMED_SEATS } from './seed-data'
import type { Said } from './scripted-client'
import { STUB_READ, stubRead, withRoute } from './stub-tools'
import type { World } from './world'

/** The turn against the gateway: when it may fall back, what a route change does
 *  mid-turn, and what the ledger and the quota see. `AiVendorError` only: a plain
 *  error is a crash, not a vendor failure, and would test the wrong path. */

const GROUP = 'runner-gateway'
const who = NAMED_SEATS.runner
const PRIMARY = 'gemini-3.8-flash'
const FALLBACK = 'claude-sonnet-5-5'
const stub = stubRead('stub_read', async () => STUB_READ)
const call = { name: 'stub_read', input: {} }
const down = (): AiVendorError => new AiVendorError('transient', 'scripted 503')
const models = (trail: Awaited<ReturnType<typeof runTurn>>) =>
  trail.witness.seen.map((s) => s.model)

async function fallback(world: World, tally: Tally): Promise<void> {
  await tally.run(GROUP, 'round 1 before any text falls back', async (c) => {
    const trail = await runTurn(world, {
      who,
      script: [{ fail: down() }],
      fallback: [{ deltas: ['Đã trả lời.'] }],
    })
    c.eq(models(trail), [PRIMARY, FALLBACK], 'models tried')
    c.eq(trail.turn?.model, FALLBACK, 'model of the turn')
    c.eq(trail.turn?.endedBy, 'answer', 'ended by')
    c.eq(
      trail.ledger.map((l) => [l.model, l.round, l.attempt, l.outcome]),
      [
        [PRIMARY, 1, 1, 'error'],
        [FALLBACK, 1, 2, 'ok'],
      ],
      'one ledger row per attempt',
    )
  })
  await tally.run(GROUP, 'no fallback after the first delta', async (c) => {
    const trail = await runTurn(world, {
      who,
      script: [{ deltas: ['Một phần.'], fail: down() }],
      fallback: [{ deltas: ['không được gọi'] }],
    })
    c.eq(models(trail), [PRIMARY], 'models tried')
    c.ok(trail.turn?.body.startsWith('Một phần.') ?? false, 'the partial text stays')
    c.ok(!(trail.turn?.body.includes('không được gọi') ?? true), 'the other model wrote nothing')
    c.eq(trail.turn?.endedBy, 'vendor', 'ended by')
  })
  await tally.run(GROUP, 'no fallback on round 2: a tool round pins the model', async (c) => {
    const trail = await runTurn(world, {
      who,
      extraTools: [stub],
      script: [{ calls: [call] }, { fail: down() }],
      fallback: [{ deltas: ['không được gọi'] }],
    })
    c.eq(models(trail), [PRIMARY, PRIMARY], 'models tried')
    c.eq(trail.turn?.endedBy, 'vendor', 'ended by')
  })
  await tally.run(GROUP, 'an empty answer is retried on the same model', async (c) => {
    const trail = await runTurn(world, {
      who,
      script: [{}, { deltas: ['Lần hai.'] }],
    })
    c.eq(models(trail), [PRIMARY, PRIMARY], 'models tried')
    c.eq(
      trail.ledger.map((l) => [l.round, l.attempt, l.outcome]),
      [
        [1, 1, 'error'],
        [1, 2, 'ok'],
      ],
      'attempts inside one round',
    )
  })
}

async function route(world: World, tally: Tally): Promise<void> {
  await tally.run(GROUP, 'a route switched off between rounds ends the turn', async (c) => {
    await withRoute(world.db, sql`enabled = true`, async () => {
      const closing = stubRead('stub_read', async () => {
        await world.db.execute(
          sql`UPDATE platform.ai_route SET enabled = false WHERE task = 'assistant'`,
        )
        return STUB_READ
      })
      const trail = await runTurn(world, {
        who,
        extraTools: [closing],
        script: [{ calls: [call] }, { deltas: ['không được gọi'] }],
      })
      c.eq(trail.witness.seen.length, 1, 'requests')
      c.eq(trail.turn?.endedBy, 'disabled', 'ended by')
      c.eq(trail.turn?.state, 'failed', 'state')
      c.ok(
        trail.events.some((e) => e.type === 'error'),
        'the person is told',
      )
    })
  })
  await tally.run(GROUP, 'a route off from the start reaches no vendor', async (c) => {
    await withRoute(world.db, sql`enabled = false`, async () => {
      const trail = await runTurn(world, { who, script: [{ deltas: ['không được gọi'] }] })
      c.eq(trail.witness.seen.length, 0, 'requests')
      c.eq(trail.turn?.endedBy, 'disabled', 'ended by')
    })
  })
  await tally.run(GROUP, 'a route edit does not swap the pinned model', async (c) => {
    await withRoute(world.db, sql`enabled = true`, async () => {
      const editing = stubRead('stub_read', async () => {
        await world.db.execute(
          sql`UPDATE platform.ai_route SET primary_model = ${FALLBACK} WHERE task = 'assistant'`,
        )
        return STUB_READ
      })
      const trail = await runTurn(world, {
        who,
        extraTools: [editing],
        script: [{ calls: [call] }, { deltas: ['Xong.'] }],
      })
      c.eq(models(trail), [PRIMARY, PRIMARY], 'models')
    })
  })
}

async function ledger(world: World, tally: Tally): Promise<void> {
  await tally.run(GROUP, 'every attempt is a row with its turn and round', async (c) => {
    const trail = await runTurn(world, {
      who,
      extraTools: [stub],
      script: [
        { calls: [call], tokensIn: 300, tokensOut: 11, tokensCached: 120 },
        { deltas: ['Xong.'], tokensIn: 400, tokensOut: 22, tokensCached: 250 },
      ],
    })
    c.eq(
      trail.ledger.map((l) => [l.round, l.attempt, l.tokensIn, l.tokensOut, l.tokensCached]),
      [
        [1, 1, 300, 11, 120],
        [2, 1, 400, 22, 250],
      ],
      'rows',
    )
    c.ok(
      trail.ledger.every((l) => l.turnId === trail.turnId),
      'each row carries the turn',
    )
    c.ok(
      trail.ledger.every(
        (l) => l.task === 'assistant' && l.promptVersion === ASSISTANT_PROMPT_VERSION,
      ),
      'task and prompt',
    )
    c.ok((trail.turn?.toolTokens ?? 0) > 0, 'the turn counts its tool tokens')
    c.ok(trail.turn?.firstTextMs !== null, 'the turn keeps its first-text time')
    c.eq(trail.turn?.rounds, 2, 'rounds')
    c.eq(trail.turn?.model, PRIMARY, 'model')
  })
}

async function quota(world: World, tally: Tally): Promise<void> {
  const person = NAMED_SEATS.quota
  await tally.run(GROUP, 'a turn of three rounds counts once against the quota', async (c) => {
    await withRoute(world.db, sql`daily_calls_per_user = 2`, async () => {
      const tools: Said[] = [{ calls: [call] }, { calls: [call] }, { deltas: ['Xong.'] }]
      const first = await runTurn(world, { who: person, extraTools: [stub], script: tools })
      c.eq(first.ledger.length, 3, 'three rounds on the ledger')
      const second = await runTurn(world, { who: person, extraTools: [stub], script: tools })
      c.eq(second.turn?.endedBy, 'answer', 'three rounds counted as one left room for this')
      const third = await runTurn(world, { who: person, script: [{ deltas: ['Không.'] }] })
      c.eq(third.witness.seen.length, 0, 'the third turn reaches no vendor')
      c.eq(third.turn?.endedBy, 'disabled', 'ended by')
    })
  })
}

export async function runnerGateway(world: World, tally: Tally): Promise<void> {
  await fallback(world, tally)
  await route(world, tally)
  await ledger(world, tally)
  await quota(world, tally)
}
