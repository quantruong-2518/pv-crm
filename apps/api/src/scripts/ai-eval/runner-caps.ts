import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { AiVendorError } from '@api/platform/ai/ai-client'
import { aiCall } from '@api/platform/ai/ai-cost.schema'
import { assistantSession } from '@api/platform/assistant/assistant.schema'
import { runTurn } from './bench'
import type { Tally } from './report'
import { NAMED_SEATS } from './seed-data'
import { parrot, toolOutputs, type Seen, type Said } from './scripted-client'
import { movableClock, STUB_READ, stubRead } from './stub-tools'
import type { World } from './world'

/** D7's caps, each driven up to its edge. The numbers here are the spec's, typed
 *  rather than imported: importing them would let a changed cap pass unnoticed. */

const GROUP = 'runner-caps'
const who = NAMED_SEATS.runner
/* The tail only: the sentence is product copy, and the check is that it closes the turn. */
const CUT_SHORT = 'Thử lại sau ít phút.'
const stub = stubRead('stub_read', async () => STUB_READ)
const call = { name: 'stub_read', input: {} }

const toolChoices = (seen: readonly Seen[]) => seen.map((s) => s.request.toolChoice)
const lastTool = (s: Seen | undefined) => {
  const last = s?.request.messages.at(-1)
  return last?.role === 'tool' ? last : null
}

async function rounds(world: World, tally: Tally): Promise<void> {
  await tally.run(GROUP, '8 rounds, the last with tools off', async (c) => {
    const trail = await runTurn(world, {
      who,
      extraTools: [stub],
      script: [
        (s): Said => (s.request.toolChoice === 'none' ? { deltas: ['Xong.'] } : { calls: [call] }),
      ],
      loopLast: true,
    })
    c.eq(trail.witness.seen.length, 8, 'requests')
    c.eq(toolChoices(trail.witness.seen), [...Array<string>(7).fill('auto'), 'none'], 'choices')
    c.ok(!!lastTool(trail.witness.seen[7])?.note, 'the last request says to answer now')
    c.eq(trail.turn?.rounds, 8, 'rounds')
    c.eq(trail.turn?.endedBy, 'cap-rounds', 'ended by')
    c.eq(trail.turn?.state, 'done', 'state')
    c.eq(new Set(trail.toolRows.map((r) => r.round)).size, 7, 'rounds that ran a tool')
  })
  await tally.run(GROUP, 'a model that calls on round 8 runs no tool', async (c) => {
    const trail = await runTurn(world, {
      who,
      extraTools: [stub],
      script: [{ calls: [call] }],
      loopLast: true,
    })
    c.eq(trail.witness.seen.length, 8, 'requests')
    c.ok(!trail.toolRows.some((r) => r.round === 8), 'no tool row on round 8')
    c.eq(trail.turn?.endedBy, 'cap-rounds', 'ended by')
    c.ok(trail.turn?.body.endsWith(CUT_SHORT) ?? false, 'the fixed sentence closes the turn')
  })
}

async function time(world: World, tally: Tally): Promise<void> {
  await tally.run(GROUP, 'no tool runs after 48 s', async (c) => {
    const clock = movableClock()
    let ran = 0
    const counted = stubRead('stub_read', async () => {
      ran += 1
      return STUB_READ
    })
    const trail = await runTurn(world, {
      who,
      clock: clock.now,
      extraTools: [counted],
      script: [
        (): Said => {
          clock.advance(49_000)
          return { calls: [call, call] }
        },
        parrot,
      ],
    })
    c.eq(ran, 0, 'tools run past the mark')
    c.eq(
      trail.toolRows.map((r) => r.outcome),
      ['over-cap', 'over-cap'],
      'outcomes',
    )
    c.eq(lastTool(trail.witness.seen[1])?.results.length, 2, 'each call still gets a result')
    c.eq(trail.witness.seen[1]?.request.toolChoice, 'none', 'the next round only writes')
    c.eq(trail.turn?.endedBy, 'cap-time', 'ended by')
  })
  await tally.run(GROUP, 'a round starting past 48 s has tools off', async (c) => {
    const clock = movableClock()
    const slow = stubRead('stub_read', async () => {
      clock.advance(48_000)
      return STUB_READ
    })
    const trail = await runTurn(world, {
      who,
      clock: clock.now,
      extraTools: [slow],
      script: [{ calls: [call] }, { deltas: ['Xong.'] }],
    })
    c.eq(toolChoices(trail.witness.seen), ['auto', 'none'], 'choices')
    c.eq(trail.toolRows[0]?.outcome, 'ok', 'the tool that started in time finished')
    c.eq(trail.turn?.endedBy, 'cap-time', 'ended by')
  })
}

async function tokens(world: World, tally: Tally): Promise<void> {
  const BIG = 'x'.repeat(80_000)
  const big = stubRead('stub_read', async () => ({
    data: { trusted: {}, blob: BIG },
    codes: ['LD-0001'],
    rowCount: 1,
    hidden: null,
  }))
  await tally.run(
    GROUP,
    '40,000 tool tokens, then a flagged cut and a writing round',
    async (c) => {
      const trail = await runTurn(world, {
        who,
        extraTools: [big],
        script: [{ calls: [call, call] }, { deltas: ['Xong.'] }],
      })
      const [first, second] = trail.toolRows
      c.eq(first?.outcome, 'ok', 'the first result fits')
      c.eq(second?.outcome, 'over-cap', 'the second does not')
      c.eq(second?.truncated, true, 'truncated')
      c.eq(second?.toolTokens, 0, 'no tokens counted for what was cut')
      const outputs = toolOutputs(trail.witness.seen[1]?.request.messages ?? [])
      c.ok(outputs[0]?.includes(BIG) ?? false, 'the first result reached the model')
      c.ok(outputs[1]?.includes('{"truncated":true}') ?? false, 'the second says it was cut')
      c.ok(!(outputs[1]?.includes('xxxx') ?? true), 'nothing of it went along')
      c.ok(!!lastTool(trail.witness.seen[1])?.note, 'the note goes with the results')
      c.eq(trail.witness.seen[1]?.request.toolChoice, 'none', 'then a writing round')
      c.eq(trail.turn?.endedBy, 'cap-tokens', 'ended by')
      c.eq(
        trail.audits.filter((a) => a.action === 'ai-read').length,
        1,
        'the cut result was not read, so one audit line',
      )
    },
  )
}

async function calls(world: World, tally: Tally): Promise<void> {
  await tally.run(GROUP, '6 calls run a round; each extra gets an error result', async (c) => {
    let ran = 0
    const counted = stubRead('stub_read', async () => {
      ran += 1
      return STUB_READ
    })
    const trail = await runTurn(world, {
      who,
      extraTools: [counted],
      script: [{ calls: Array.from({ length: 9 }, () => call) }, { deltas: ['Xong.'] }],
    })
    c.eq(ran, 6, 'tools run')
    c.eq(trail.toolRows.length, 9, 'a row per call')
    const results = lastTool(trail.witness.seen[1])?.results ?? []
    c.eq(
      results.map((r) => r.isError),
      [...Array<boolean>(6).fill(false), ...Array<boolean>(3).fill(true)],
      'errors go to the extras',
    )
  })
  await tally.run(GROUP, 'at most 3 tools run at once', async (c) => {
    let inFlight = 0
    let peak = 0
    const slow = stubRead('stub_read', async () => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 15))
      inFlight -= 1
      return STUB_READ
    })
    await runTurn(world, {
      who,
      extraTools: [slow],
      script: [{ calls: Array.from({ length: 6 }, () => call) }, { deltas: ['Xong.'] }],
    })
    c.eq(peak, 3, 'peak in flight')
  })
}

async function writing(world: World, tally: Tally): Promise<void> {
  const big = stubRead('stub_read', async () => ({
    data: { blob: 'x'.repeat(130_000) },
    codes: [],
    rowCount: 1,
    hidden: null,
  }))
  await tally.run(
    GROUP,
    'a refused writing round keeps the text and adds the sentence',
    async (c) => {
      const trail = await runTurn(world, {
        who,
        extraTools: [big],
        script: [{ calls: [call] }, { deltas: ['Một phần câu trả lời.'], stop: 'refused' }],
      })
      const body = trail.turn?.body ?? ''
      c.ok(body.startsWith('Một phần câu trả lời.\n\n'), 'the partial text stays')
      c.ok(body.endsWith(CUT_SHORT), 'the fixed sentence follows it')
      c.eq(trail.turn?.endedBy, 'vendor', 'ended by')
    },
  )
  await tally.run(
    GROUP,
    'a failed writing round keeps the text and adds the sentence',
    async (c) => {
      const trail = await runTurn(world, {
        who,
        extraTools: [big],
        script: [
          { calls: [call] },
          { deltas: ['Một phần.'], fail: new AiVendorError('transient', 'scripted 503') },
        ],
      })
      const body = trail.turn?.body ?? ''
      c.ok(body.startsWith('Một phần.\n\n'), 'the partial text stays')
      c.ok(body.endsWith(CUT_SHORT), 'the fixed sentence follows it')
      c.eq(trail.turn?.state, 'failed', 'state')
      c.eq(trail.turn?.endedBy, 'vendor', 'ended by')
    },
  )
}

/** The hour counts turns a vendor was asked for, from the ledger, so a chat deleted
 *  gives nothing back: 59 earlier turns are 59 ledger rows of their own turn ids. */
async function hourly(world: World, tally: Tally): Promise<void> {
  const person = NAMED_SEATS.hourly
  const fill = async (n: number): Promise<void> => {
    await world.db.insert(aiCall).values(
      Array.from({ length: n }, () => ({
        task: 'assistant' as const,
        model: 'gemini-3.8-flash',
        tokensIn: 1,
        tokensOut: 1,
        outcome: 'ok' as const,
        actorId: person.id,
        turnId: randomUUID(),
        round: 1,
      })),
    )
  }
  await tally.run(GROUP, 'the 60th turn of the hour runs, the 61st does not', async (c) => {
    await fill(59)
    const sixtieth = await runTurn(world, { who: person, script: [{ deltas: ['Được.'] }] })
    c.eq(sixtieth.turn?.endedBy, 'answer', 'the 60th')
    await world.db.delete(assistantSession).where(eq(assistantSession.ownerId, person.id))
    const next = await runTurn(world, { who: person, script: [{ deltas: ['Không.'] }] })
    c.eq(next.witness.seen.length, 0, 'the 61st reaches no vendor, chats deleted or not')
    c.eq(next.messages, [], 'and leaves no row to count')
    c.ok(
      next.events.some((e) => e.type === 'error'),
      'the person is told',
    )
  })
}

export async function runnerCaps(world: World, tally: Tally): Promise<void> {
  await rounds(world, tally)
  await time(world, tally)
  await tokens(world, tally)
  await calls(world, tally)
  await writing(world, tally)
  await hourly(world, tally)
}
