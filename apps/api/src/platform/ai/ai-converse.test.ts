// @vitest-environment node
import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { Logger } from '@nestjs/common'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { Db } from '../db/create-db'
import {
  AiVendorError,
  type AiAnswer,
  type AiClient,
  type AiConverseRequest,
  type AiLimits,
  type AiRound,
} from './ai-client'
import { AiOutputError, AiTransientError, AiUnavailableError } from './ai-errors'
import { AiGateway, type AiClients } from './ai-gateway'
import { AiLedger } from './ai-ledger'
import { ProviderLimiter } from './ai-limiter'
import { AiRouteRepository } from './ai-route.repository'

/** The failure rules of ADR 0133 D6, on the real gateway, ledger, route table
 *  and migrations in in-memory PGlite; only the vendor client is scripted. What
 *  the two vendor clients do with a real SDK is `ai-converse.vendors.test.ts`. */

const FOLDER = resolve(dirname(fileURLToPath(import.meta.url)), '../../../drizzle')
const PRIMARY = 'gemini-3.8-flash'
const FALLBACK = 'claude-sonnet-5-5'
const OVERLOADED = 'gemini: 503: overloaded'

type Step = {
  deltas?: string[]
  fail?: AiVendorError
  /** Waits for the attempt's signal, then fails like a real aborted stream. */
  hang?: true
  answer?: Partial<AiRound>
}
const SPENT = { tokensIn: 100, tokensCached: 40, tokensCacheWrite: 10, tokensOut: 20 }
const said = (text: string): Step => ({ deltas: [text], answer: { text } })
const toolsOnly: Step = {
  answer: {
    calls: [{ id: 'c1', name: 'get_record', input: {} }],
    stop: 'tools',
    vendor: { model: PRIMARY, raw: { role: 'model', parts: [{ text: '' }] } },
  },
}
const down = () => ({ fail: new AiVendorError('transient', OVERLOADED, SPENT) })

/** Replays `steps`; an unscripted call throws, so "no second vendor call" needs no extra assert. */
class ScriptedClient implements AiClient {
  readonly keyed = true
  readonly seen: { model: string; request: AiConverseRequest; limits: AiLimits }[] = []
  answers: AiAnswer[] = []

  constructor(readonly steps: Step[] = []) {}

  async generate(): Promise<AiAnswer> {
    const answer = this.answers.shift()
    if (!answer) throw new AiVendorError('transient', 'unscripted generate')
    return answer
  }

  countTokens(): Promise<number> {
    return Promise.resolve(1)
  }

  async converse(
    model: string,
    request: AiConverseRequest,
    limits: AiLimits & { signal: AbortSignal },
    onText: (delta: string) => void,
  ): Promise<AiRound> {
    this.seen.push({ model, request, limits })
    const step = this.steps.shift()
    if (!step) throw new Error(`unscripted call to ${model}`)
    step.deltas?.forEach(onText)
    if (step.hang) await hangUntil(limits.signal)
    if (step.fail) throw step.fail
    return {
      text: '',
      calls: [],
      vendor: { model, raw: [] },
      stop: 'end',
      finish: 'STOP',
      ...SPENT,
      ...step.answer,
    }
  }
}

const hangUntil = (signal: AbortSignal) =>
  new Promise<never>((_resolve, reject) => {
    signal.addEventListener('abort', () =>
      reject(new AiVendorError('transient', 'gemini: AbortError: aborted', SPENT)),
    )
  })

const REQUEST: AiConverseRequest = {
  system: 'stable rules',
  systemRole: 'you serve sales',
  tools: [
    { name: 'get_record', description: 'read', parameters: { $schema: 'x', type: 'object' } },
  ],
  toolChoice: 'auto',
  messages: [{ role: 'user', text: 'hello' }],
  prompt: 'assistant@1',
}
const writing: AiConverseRequest = { ...REQUEST, toolChoice: 'none' }

type LedgerRow = {
  model: string
  attempt: number
  round: number | null
  turn_id: string | null
  outcome: string
  tokens_in: number
  tokens_cached: number
  tokens_cache_write: number
  prompt_version: string | null
}

let client: PGlite
let db: Db
let gemini: ScriptedClient
let claude: ScriptedClient
let gateway: AiGateway
let turnId: string

const ledgerOf = async (task: string) => {
  const r = (await db.execute(
    sql`SELECT * FROM platform.ai_call WHERE task = ${task} ORDER BY at, attempt`,
  )) as unknown as { rows: LedgerRow[] }
  return r.rows
}
const script = (primary: Step[], fallback: Step[] = []) => {
  gemini = new ScriptedClient(primary)
  claude = new ScriptedClient(fallback)
  const clients: AiClients = { gemini, anthropic: claude }
  gateway = new AiGateway(new AiRouteRepository(db), new AiLedger(), clients, db)
}
const open = (extra: { deadlineAt?: number; reserveMs?: number } = {}) =>
  gateway.conversation('assistant', {
    actorId: 'u-me',
    subjectCode: null,
    turnId,
    deadlineAt: Date.now() + 60_000,
    reserveMs: 0,
    ...extra,
  })
const ignore = () => undefined
const signal = () => new AbortController().signal
const setRoute = (set: ReturnType<typeof sql>) =>
  db.execute(sql`UPDATE platform.ai_route SET ${set} WHERE task = 'assistant'`)

beforeAll(async () => {
  client = new PGlite({ extensions: { pg_trgm } })
  await client.exec('CREATE EXTENSION IF NOT EXISTS pg_trgm')
  db = drizzle(client) as unknown as Db
  await migrate(drizzle(client), { migrationsFolder: FOLDER })
  await db.execute(sql`INSERT INTO platform.actor (id, name, email, role, role_ids)
    VALUES ('u-me', 'u-me', 'u-me@example.vn', 'sale', ARRAY['sale'])`)
  vi.spyOn(Logger.prototype, 'warn').mockImplementation(ignore)
  vi.spyOn(Logger.prototype, 'log').mockImplementation(ignore)
}, 120_000)

afterAll(async () => client?.close())

beforeEach(async () => {
  turnId = randomUUID()
  await client.exec(`
    ALTER TABLE platform.ai_call DISABLE TRIGGER USER;
    DELETE FROM platform.ai_call;
    ALTER TABLE platform.ai_call ENABLE TRIGGER USER;
    UPDATE platform.ai_route
       SET enabled = true, daily_calls_per_user = 0, daily_token_budget = 0, timeout_ms = 25000,
           primary_model = 'gemini-3.8-flash', fallback_model = 'claude-sonnet-5-5';`)
})

describe('fallback', () => {
  it('moves to the fallback on round 1 before any delta, and writes one row per attempt', async () => {
    script([down()], [said('xin chào')])
    const seen: string[] = []

    const round = await (await open()).round(REQUEST, (d) => seen.push(d), signal())

    expect(round).toMatchObject({ model: FALLBACK, text: 'xin chào' })
    expect(seen).toEqual(['xin chào'])
    const rows = await ledgerOf('assistant')
    expect(rows).toMatchObject([
      { model: PRIMARY, attempt: 1, round: 1, turn_id: turnId, outcome: 'error', tokens_in: 100 },
      { model: FALLBACK, attempt: 2, round: 1, turn_id: turnId, outcome: 'ok', tokens_cached: 40 },
    ])
    expect(rows[1]).toMatchObject({ tokens_cache_write: 10, prompt_version: 'assistant@1' })
  })

  it('never moves after a delta: the turn ends, the deltas stand, the row keeps its tokens', async () => {
    script([{ deltas: ['nửa câu'], ...down() }], [said('unused')])
    const seen: string[] = []

    await expect((await open()).round(REQUEST, (d) => seen.push(d), signal())).rejects.toThrow(
      AiTransientError,
    )

    expect(seen).toEqual(['nửa câu'])
    expect(claude.seen).toEqual([])
    expect(await ledgerOf('assistant')).toMatchObject([{ attempt: 1, tokens_in: 100 }])
  })

  it('a tool-only round 1 pins the model: round 2 cannot leave it, even after a route edit', async () => {
    script([toolsOnly, down()], [said('unused')])
    const turn = await open()
    await turn.round(REQUEST, ignore, signal())
    await setRoute(sql`primary_model = 'gemini-9', fallback_model = NULL`)

    await expect(turn.round(REQUEST, ignore, signal())).rejects.toThrow(AiTransientError)

    expect(gemini.seen.map((s) => s.model)).toEqual([PRIMARY, PRIMARY])
    expect(claude.seen).toEqual([])
    expect(await ledgerOf('assistant')).toMatchObject([
      { round: 1, attempt: 1 },
      { round: 2, attempt: 1, outcome: 'error' },
    ])
  })
})

describe('pinning', () => {
  it('holds the fallback once it has answered: round 2 never returns to the primary', async () => {
    const fallbackTools = {
      answer: { ...toolsOnly.answer, vendor: { model: FALLBACK, raw: [] } },
    }
    script([down()], [fallbackTools, said('xong')])
    const turn = await open()
    await turn.round(REQUEST, ignore, signal())

    expect(await turn.round(writing, ignore, signal())).toMatchObject({ model: FALLBACK })

    expect(gemini.seen).toHaveLength(1)
    expect(await ledgerOf('assistant')).toMatchObject([
      { model: PRIMARY, round: 1, attempt: 1 },
      { model: FALLBACK, round: 1, attempt: 2 },
      { model: FALLBACK, round: 2, attempt: 1 },
    ])
  })
})

describe('route', () => {
  it('reads the route each round, so a pause in the turn stands', async () => {
    script([toolsOnly])
    const turn = await open()
    await setRoute(sql`enabled = false`)

    await expect(turn.round(REQUEST, ignore, signal())).rejects.toThrow(AiUnavailableError)

    expect(gemini.seen).toEqual([])
  })

  it('switched off between rounds ends the turn with no vendor call and no row', async () => {
    script([toolsOnly])
    const turn = await open()
    await turn.round(REQUEST, ignore, signal())
    await setRoute(sql`enabled = false`)

    const refused = await turn.round(REQUEST, ignore, signal()).catch((e: unknown) => e)

    expect(refused).toBeInstanceOf(AiUnavailableError)
    expect(refused).toMatchObject({ reason: 'disabled' })
    expect(gemini.seen).toHaveLength(1)
    expect(await ledgerOf('assistant')).toHaveLength(1)
  })

  it('applies a route edit between rounds to the limits', async () => {
    script([toolsOnly, said('xong')])
    const turn = await open()
    await turn.round(REQUEST, ignore, signal())
    await setRoute(sql`max_tokens_out = 77`)

    await turn.round(writing, ignore, signal())

    expect(gemini.seen.map((s) => s.limits.maxTokensOut)).toEqual([8192, 77])
  })
})

describe('retry', () => {
  it('asks the same model once more for an empty answer, and only then fails', async () => {
    script([{}, {}])

    await expect((await open()).round(REQUEST, ignore, signal())).rejects.toThrow(AiOutputError)

    expect(await ledgerOf('assistant')).toMatchObject([
      { attempt: 1, round: 1, model: PRIMARY, outcome: 'error' },
      { attempt: 2, round: 1, model: PRIMARY, outcome: 'error' },
    ])
  })

  it('takes the second answer when the empty one was a wobble', async () => {
    script([toolsOnly, {}, said('xong')])
    const turn = await open()
    await turn.round(REQUEST, ignore, signal())

    expect(await turn.round(writing, ignore, signal())).toMatchObject({ text: 'xong' })

    expect(await ledgerOf('assistant')).toMatchObject([
      { round: 1, attempt: 1 },
      { round: 2, attempt: 1, outcome: 'error' },
      { round: 2, attempt: 2, outcome: 'ok' },
    ])
  })

  it('never retries once a delta went out, whatever the round says', async () => {
    script([{ deltas: ['đã gửi'] }])

    expect(await (await open()).round(REQUEST, ignore, signal())).toMatchObject({ text: '' })

    expect(gemini.seen).toHaveLength(1)
  })

  it('leaves a cut or refused round to the caller instead of retrying it', async () => {
    script([{ answer: { stop: 'cut' } }, { answer: { stop: 'refused' } }])
    const turn = await open()

    expect(await turn.round(REQUEST, ignore, signal())).toMatchObject({ stop: 'cut' })
    expect(await turn.round(REQUEST, ignore, signal())).toMatchObject({ stop: 'refused' })

    expect(await ledgerOf('assistant')).toMatchObject([
      { round: 1, attempt: 1, outcome: 'error' },
      { round: 2, attempt: 1, outcome: 'error' },
    ])
  })
})

describe('replay', () => {
  it('sends each round the earlier messages untouched, empty assistant round included', async () => {
    script([toolsOnly, said('xong')])
    const turn = await open()
    const first = await turn.round(REQUEST, ignore, signal())
    const messages = [
      ...REQUEST.messages,
      {
        role: 'assistant-round' as const,
        text: first.text,
        calls: first.calls,
        vendor: first.vendor,
      },
      {
        role: 'tool' as const,
        results: [{ callId: 'c1', name: 'get_record', output: {}, isError: false }],
      },
    ]

    await turn.round({ ...REQUEST, messages }, ignore, signal())

    const [one, two] = gemini.seen
    expect(two?.request.messages.slice(0, one?.request.messages.length)).toEqual(
      one?.request.messages,
    )
    expect(two?.request.messages[1]).toMatchObject({ text: '', vendor: toolsOnly.answer?.vendor })
  })
})

describe('quota', () => {
  it('counts a whole turn once, and never re-checks inside it', async () => {
    await setRoute(sql`daily_calls_per_user = 1`)
    script([toolsOnly, toolsOnly, said('xong')])
    const turn = await open()
    await turn.round(REQUEST, ignore, signal())
    await turn.round(REQUEST, ignore, signal())
    await turn.round(REQUEST, ignore, signal())

    expect(await new AiRouteRepository(db).callsLastDay('assistant', 'u-me')).toBe(1)
    expect(await ledgerOf('assistant')).toHaveLength(3)
    await expect(open()).rejects.toMatchObject({ reason: 'user-limit' })
  })

  it('still spends the token budget on every round', async () => {
    script([toolsOnly, said('xong')])
    const turn = await open()
    await turn.round(REQUEST, ignore, signal())
    await turn.round(REQUEST, ignore, signal())

    expect(await new AiRouteRepository(db).tokensLastDay('assistant')).toBe(240)
  })
})

describe('breaker', () => {
  /** Three transient failures on the primary, each its own turn on the same gateway. */
  const pausePrimary = async () => {
    for (let i = 0; i < 3; i += 1) {
      gemini.steps.push(down())
      claude.steps.push(said('fallback'))
      await (await open()).round(REQUEST, ignore, signal())
    }
  }

  it('skips a paused primary on round 1, with no row for the skip', async () => {
    script([])
    await pausePrimary()
    claude.steps.push(said('fallback'))

    expect(await (await open()).round(REQUEST, ignore, signal())).toMatchObject({ model: FALLBACK })

    expect(gemini.seen).toHaveLength(3)
  })

  it('ends the turn when the pinned model is paused between rounds', async () => {
    script([toolsOnly])
    const turn = await open()
    await turn.round(REQUEST, ignore, signal())
    await pausePrimary()

    await expect(turn.round(REQUEST, ignore, signal())).rejects.toThrow(/is paused/)
  })

  it('does not take a caller stop for a vendor failure', async () => {
    script([])
    for (let i = 0; i < 3; i += 1) {
      gemini.steps.push({ hang: true })
      const stop = new AbortController()
      const round = (await open()).round(REQUEST, ignore, stop.signal)
      await vi.waitFor(() => expect(gemini.seen).toHaveLength(i + 1))
      stop.abort()
      await expect(round).rejects.toThrow(AiTransientError)
    }
    gemini.steps.push(said('vẫn chạy'))

    expect(await (await open()).round(REQUEST, ignore, signal())).toMatchObject({ model: PRIMARY })
  })

  it('blames no model for a timer the turn clipped below the route timeout', async () => {
    await setRoute(sql`fallback_model = NULL`)
    script([])
    for (let i = 0; i < 3; i += 1) {
      gemini.steps.push({ hang: true })
      const turn = await open({ deadlineAt: Date.now() + 20 })
      await expect(turn.round(writing, ignore, signal())).rejects.toThrow(AiTransientError)
    }
    gemini.steps.push(said('vẫn chạy'))

    expect(await (await open()).round(REQUEST, ignore, signal())).toMatchObject({ model: PRIMARY })
  })

  it('still blames the model for a stall at the route timeout', async () => {
    await setRoute(sql`fallback_model = NULL, timeout_ms = 20`)
    script([])
    for (let i = 0; i < 3; i += 1) {
      gemini.steps.push({ hang: true })
      await expect((await open()).round(REQUEST, ignore, signal())).rejects.toThrow(/transient/)
    }

    await expect((await open()).round(REQUEST, ignore, signal())).rejects.toThrow(/is paused/)
  })
})

describe('timeout and stop', () => {
  it('aborts a stalled stream at the route timeout, then falls back on round 1', async () => {
    await setRoute(sql`timeout_ms = 20`)
    script([{ hang: true }], [said('kịp')])

    expect(await (await open()).round(REQUEST, ignore, signal())).toMatchObject({ model: FALLBACK })

    expect(await ledgerOf('assistant')).toMatchObject([{ tokens_in: 100, outcome: 'error' }, {}])
  })

  it('takes the shorter of the route and the turn deadline, less the answer reserve', async () => {
    script([said('xong')])
    const turn = await open({ deadlineAt: Date.now() + 20_000, reserveMs: 5_000 })

    await turn.round(REQUEST, ignore, signal())

    const { timeoutMs } = gemini.seen[0]?.limits ?? { timeoutMs: 0 }
    expect(timeoutMs).toBeGreaterThan(14_000)
    expect(timeoutMs).toBeLessThanOrEqual(15_000)
  })

  it('gives a writing round everything left: the reserve exists for it', async () => {
    script([said('xong')])
    const turn = await open({ deadlineAt: Date.now() + 10_000, reserveMs: 5_000 })

    await turn.round(writing, ignore, signal())

    expect(gemini.seen[0]?.limits.timeoutMs).toBeGreaterThan(9_000)
  })

  it('stops holding back the reserve once the round writes', async () => {
    script([{ deltas: ['Lead này'], hang: true }])
    const openedAt = Date.now()
    const turn = await open({ deadlineAt: openedAt + 200, reserveMs: 150 })

    await expect(turn.round(REQUEST, ignore, signal())).rejects.toThrow(AiTransientError)

    expect(Date.now() - openedAt).toBeGreaterThanOrEqual(190)
  })

  it('still ends a stream that stalls after its first words at the route limit', async () => {
    await setRoute(sql`timeout_ms = 40`)
    script([{ deltas: ['Lead này'], hang: true }])
    const openedAt = Date.now()
    const turn = await open({ deadlineAt: openedAt + 5_000, reserveMs: 0 })

    await expect(turn.round(REQUEST, ignore, signal())).rejects.toThrow(AiTransientError)

    expect(Date.now() - openedAt).toBeLessThan(2_000)
  })

  it('opens no attempt that cannot fit the deadline, and writes no row', async () => {
    script([])
    const turn = await open({ deadlineAt: Date.now() + 5_000, reserveMs: 12_000 })

    await expect(turn.round(REQUEST, ignore, signal())).rejects.toThrow(/fits the deadline/)

    expect(await ledgerOf('assistant')).toEqual([])
  })

  it('a caller stop writes the billed row and neither falls back nor retries', async () => {
    script([{ hang: true }], [said('unused')])
    const stop = new AbortController()
    const round = (await open()).round(REQUEST, ignore, stop.signal)
    await vi.waitFor(() => expect(gemini.seen).toHaveLength(1))

    stop.abort()

    await expect(round).rejects.toThrow(/stopped by the caller/)
    expect(claude.seen).toEqual([])
    expect(await ledgerOf('assistant')).toMatchObject([{ attempt: 1, tokens_in: 100 }])
  })
})

describe('stopped before the request', () => {
  it('writes no row: nothing reached a vendor', async () => {
    script([], [said('unused')])
    const stop = new AbortController()
    stop.abort()

    await expect((await open()).round(REQUEST, ignore, stop.signal)).rejects.toThrow(
      /stopped by the caller/,
    )

    expect(await ledgerOf('assistant')).toEqual([])
  })
})

describe('limiter', () => {
  const never = () => new Promise<void>(ignore)

  it('frees a queued waiter on abort, without taking a slot', async () => {
    const limiter = new ProviderLimiter()
    for (let i = 0; i < 4; i += 1) void limiter.run('gemini', never)
    const stop = new AbortController()
    const work = vi.fn(() => Promise.resolve())

    const queued = limiter.run('gemini', work, stop.signal)
    stop.abort()

    await expect(queued).rejects.toMatchObject({ name: 'AbortError' })
    expect(work).not.toHaveBeenCalled()
  })

  it('refuses a signal that already fired', async () => {
    const stop = new AbortController()
    stop.abort()

    await expect(new ProviderLimiter().run('gemini', never, stop.signal)).rejects.toMatchObject({
      name: 'AbortError',
    })
  })

  it('hands the freed slot to the next waiter and reports how long it queued', async () => {
    const limiter = new ProviderLimiter()
    let free: () => void = ignore
    const held = new Promise<void>((done) => (free = done))
    for (let i = 0; i < 4; i += 1) void limiter.run('anthropic', () => held)

    const waited = limiter.run('anthropic', (queuedMs) => Promise.resolve(queuedMs))
    await new Promise((done) => setTimeout(done, 20))
    free()

    expect(await waited).toBeGreaterThanOrEqual(15)
  })

  const fillSlots = (pool: 'limiter' | 'assistantLimiter' = 'assistantLimiter') => {
    for (let i = 0; i < 4; i += 1) {
      void gateway[pool].run('gemini', never)
      void gateway[pool].run('anthropic', never)
    }
  }
  const logged = () => vi.mocked(Logger.prototype.log).mock.calls.join()

  it('ends a wait at the deadline as a failed round: no vendor, no row, wait logged', async () => {
    script([])
    fillSlots()
    vi.mocked(Logger.prototype.log).mockClear()
    const turn = await open({ deadlineAt: Date.now() + 30 })

    await expect(turn.round(REQUEST, ignore, signal())).rejects.toThrow(AiTransientError)

    expect([...gemini.seen, ...claude.seen]).toEqual([])
    expect(await ledgerOf('assistant')).toEqual([])
    expect(logged()).toMatch(/waited \d+ ms for a slot/)
  })

  it('tells a caller stop in the queue from the deadline, and logs that wait too', async () => {
    script([])
    fillSlots()
    vi.mocked(Logger.prototype.log).mockClear()
    const stop = new AbortController()
    const round = (await open()).round(REQUEST, ignore, stop.signal)
    await new Promise((done) => setTimeout(done, 15))

    stop.abort()

    await expect(round).rejects.toThrow(/stopped by the caller/)
    expect(logged()).toMatch(/waited \d+ ms for a slot/)
  })

  it('runs a round while lead fill and comm report hold every batch slot', async () => {
    script([said('xong')])
    fillSlots('limiter')
    const turn = await open()

    await turn.round(REQUEST, ignore, signal())

    expect(gemini.seen).toHaveLength(1)
  })

  it('gives its slot back after each round: six rounds pass through the pool', async () => {
    script([toolsOnly, toolsOnly, toolsOnly, toolsOnly, toolsOnly, said('xong')])
    const turn = await open()
    for (let i = 0; i < 6; i += 1) await turn.round(REQUEST, ignore, signal())

    expect(gemini.seen).toHaveLength(6)
  })
})

describe('the other tasks, as before', () => {
  const schema = z.object({ ok: z.boolean() })
  const json: AiAnswer = {
    text: '{"ok":true}',
    complete: true,
    finish: 'STOP',
    tokensIn: 5,
    tokensOut: 6,
  }
  const call = () => gateway.run('lead-enrich', { system: 's', parts: [] }, schema, WHO)
  const WHO = { actorId: 'u-me', subjectCode: null }

  beforeEach(async () => {
    await db.execute(sql`UPDATE platform.ai_route
      SET enabled = true, primary_model = 'gemini-3.8-flash', fallback_model = 'claude-sonnet-5-5',
          daily_calls_per_user = 0
      WHERE task = 'lead-enrich'`)
  })

  it('runs one call into one row, with no turn, no round and no cache counts', async () => {
    script([])
    gemini.answers.push(json)

    expect(await call()).toMatchObject({ value: { ok: true }, model: PRIMARY })

    expect(await ledgerOf('lead-enrich')).toMatchObject([
      { attempt: 1, round: null, turn_id: null, tokens_cached: 0, tokens_cache_write: 0 },
    ])
    expect(await new AiRouteRepository(db).callsLastDay('lead-enrich', 'u-me')).toBe(1)
  })

  it('still retries a bad answer on the same model and charges one call', async () => {
    script([])
    gemini.answers.push({ ...json, text: 'not json' }, json)

    await call()

    expect(await ledgerOf('lead-enrich')).toMatchObject([
      { attempt: 1, outcome: 'error' },
      { attempt: 2, outcome: 'ok' },
    ])
    expect(await new AiRouteRepository(db).callsLastDay('lead-enrich', 'u-me')).toBe(1)
  })

  it('still falls back when the primary is down', async () => {
    script([])
    claude.answers.push(json)

    expect(await call()).toMatchObject({ model: FALLBACK })
  })
})
