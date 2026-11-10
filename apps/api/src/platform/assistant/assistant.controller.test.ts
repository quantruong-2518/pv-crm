// @vitest-environment node
import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Controller, Get, type ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { FastifyReply } from 'fastify'
import { AssistantReportQuery, type AssistantEvent, type AssistantRef } from '@pv/contracts'
import { createAccessControl, DEFAULT_ROLE_PERMISSIONS, type Actor } from '@pv/engines'
import { and, eq, sql } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/pglite/migrator'
import type { PgliteDatabase } from 'drizzle-orm/pglite'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { AccessGuard } from '../access/access.guard'
import { Need } from '../access/need.decorator'
import {
  AiVendorError,
  type AiClient,
  type AiConverseRequest,
  type AiLimits,
  type AiRound,
} from '../ai/ai-client'
import { aiCall } from '../ai/ai-cost.schema'
import { AiGateway } from '../ai/ai-gateway'
import { AiLedger } from '../ai/ai-ledger'
import { AiRouteRepository } from '../ai/ai-route.repository'
import { AuditRepository } from '../audit/audit.repository'
import type { Env } from '../config/env'
import { createDb, type Db } from '../db/create-db'
import { audit } from '../db/platform.schema'
import { CrossSiteGuard } from '../http/cross-site.guard'
import { zod } from '../http/zod.pipe'
import { AssistantBootSweeper } from './assistant-boot.sweeper'
import { AssistantRunner } from './assistant-loop'
import { AssistantSessionRepository } from './assistant-session.repository'
import { openTurnStream } from './assistant-stream'
import { AssistantToolGate, defineTool, door } from './assistant-tools'
import { AssistantTurns, titleOf } from './assistant-turns'
import { AssistantController } from './assistant.controller'
import { AssistantRepository } from './assistant.repository'
import { assistantMessage, assistantReport, assistantSession } from './assistant.schema'
import { AssistantService } from './assistant.service'

/** The `/assistant` doors on the real migrations, gateway and runner, with a
 *  scripted vendor: no network, no key. The guards are asked over the handlers'
 *  own metadata. */

const FOLDER = resolve(dirname(fileURLToPath(import.meta.url)), '../../../drizzle')

@Controller('fake')
class FakeDoors {
  @Get('lead')
  @Need({ branch: 'Sales', permission: 'lead.view' })
  lead() {}

  @Get('leads')
  @Need({ branch: 'Sales', permission: 'lead.view', scoped: true })
  leads() {}
}

const seat = (id: string, role: 'director' | 'head-of-sales'): Actor => ({
  id,
  name: `Name of ${id}`,
  email: `${id}@pv.test`,
  role,
  roleIds: [role],
  permissions: DEFAULT_ROLE_PERMISSIONS[role],
  branches: ['Sales'],
})
const director = seat('u-dir', 'director')
const other = seat('u-other', 'director')
const head = seat('u-head', 'head-of-sales')
/** Every role holds `assistant.use` by default; this one had it unticked in the matrix. */
const unticked: Actor = {
  ...head,
  permissions: head.permissions.filter((p) => p !== 'assistant.use'),
}
/** A seat of its own for the counts that the other tests' turns would move. */
const counted = seat('u-count', 'director')
/** The same person after the role editor took `lead.view` away. */
const lostLeads: Actor = {
  ...director,
  permissions: director.permissions.filter((p) => p !== 'lead.view'),
}

const COMPANY = 'Công ty Sao Đỏ'
/** A code whose re-check read fails, as a database error would. */
const BROKEN = 'LD-0500'

/** The batched re-read, one call per kind: counted, so a test can see when it ran. */
const reread = vi.fn(async (_who: Actor, _kind: string, codes: readonly string[]) => {
  if (codes.includes(BROKEN)) throw new Error('the book is down')
  return codes.map((code): AssistantRef => ({ kind: 'lead', code, label: COMPANY }))
})

/* Named `get_record` so the suggestion templates for it apply. */
const readLead = defineTool({
  name: 'get_record',
  description: 'Fake.',
  input: z.object({ kind: z.literal('lead'), code: z.string() }).strict(),
  doors: { lead: door(FakeDoors, 'lead') },
  doorFor: () => 'lead',
  run: async (_who, { code }) => ({
    data: { trusted: { code } },
    codes: [code],
    rowCount: 1,
    hidden: null,
    refs: [{ kind: 'lead', code, label: COMPANY }],
  }),
  recheck: {
    kindOf: (code) => (code.startsWith('LD-') ? 'lead' : null),
    doors: { lead: door(FakeDoors, 'leads') },
    read: reread,
    one: (code) => ({ kind: 'lead', code }),
  },
})

/** The comms door's reach for a revealing call; every code by default. */
const reach = vi.fn(async (_who: Actor, codes: readonly string[]): Promise<ReadonlySet<string>> => {
  return new Set(codes)
})

/* Named `get_history`, a tool that reveals gated text and re-asks its door's reach. */
const readNote = defineTool({
  name: 'get_history',
  description: 'Fake.',
  input: z.object({ kind: z.literal('lead'), code: z.string() }).strict(),
  doors: { lead: door(FakeDoors, 'lead') },
  doorFor: () => 'lead',
  reveals: 'comm.view-content',
  revealReach: { door: 'lead', read: reach },
  run: async (_who, { code }) => ({
    data: { trusted: { code }, untrusted: { summary: 'Hẹn gọi lại' } },
    codes: [code],
    rowCount: 1,
    hidden: null,
    refs: [{ kind: 'lead', code, label: COMPANY }],
  }),
})

type Limits = AiLimits & { signal: AbortSignal }
type Step =
  | Partial<AiRound>
  | ((
      r: AiConverseRequest,
      limits: Limits,
      onText: (delta: string) => void,
    ) => Promise<Partial<AiRound>>)

class Scripted implements AiClient {
  readonly keyed = true
  readonly requests: AiConverseRequest[] = []
  constructor(private readonly steps: Step[]) {}

  generate(): never {
    throw new Error('not used')
  }
  countTokens(): never {
    throw new Error('not used')
  }

  async converse(
    _model: string,
    r: AiConverseRequest,
    limits: Limits,
    onText: (delta: string) => void,
  ): Promise<AiRound> {
    this.requests.push(r)
    const step = this.steps.shift()
    if (!step) throw new Error('the script ran out')
    const round = typeof step === 'function' ? await step(r, limits, onText) : step
    if (round.text) onText(round.text)
    return {
      text: '',
      calls: [],
      vendor: { model: 'gemini-3.8-flash', raw: null },
      stop: 'end',
      finish: 'STOP',
      tokensIn: 10,
      tokensCached: 0,
      tokensCacheWrite: 0,
      tokensOut: 5,
      ...round,
    }
  }
}

const readRound = (code = 'LD-0001'): Partial<AiRound> => ({
  calls: [{ id: 'vendor-1', name: 'get_record', input: { kind: 'lead', code } }],
  stop: 'tools',
})

const noteRound = (...codes: string[]): Partial<AiRound> => ({
  calls: codes.map((code, i) => ({
    id: `vendor-${i}`,
    name: 'get_history',
    input: { kind: 'lead', code },
  })),
  stop: 'tools',
})

let db: Db
let close: () => Promise<void>

function doors(client: Scripted) {
  const routes = new AiRouteRepository(db)
  const gateway = new AiGateway(routes, new AiLedger(), { gemini: client, anthropic: client }, db)
  const gate = new AssistantToolGate({ tools: () => [readLead, readNote] }, createAccessControl())
  const repo = new AssistantRepository(db)
  const audits = new AuditRepository(db)
  const runner = new AssistantRunner(gateway, repo, audits, gate)
  const sessions = new AssistantSessionRepository(db)
  const turns = new AssistantTurns(runner, gateway, sessions)
  const access = createAccessControl()
  const service = new AssistantService(sessions, repo, gate, turns, routes, audits, access)
  return { turns, service, controller: new AssistantController(service, turns) }
}

/** One turn through `AssistantTurns.run`, as the controller drives it. */
async function ask(
  client: Scripted,
  who: Actor = director,
  body: { question: string; sessionId?: string } = { question: 'Lead LD-0001 thế nào?' },
) {
  const { turns } = doors(client)
  const events: AssistantEvent[] = []
  const session = await turns.sessionOf(who, body)
  await turns.run(who, body, session, (e) => events.push(e))
  const sessionId = events.find((e) => e.type === 'session')?.sessionId ?? body.sessionId
  const rows = sessionId
    ? await db
        .select()
        .from(assistantMessage)
        .where(eq(assistantMessage.sessionId, sessionId))
        .orderBy(assistantMessage.seq)
    : []
  return { events, sessionId, rows, turn: rows.at(-1) }
}

const route = (enabled: boolean) =>
  db.execute(sql`UPDATE platform.ai_route SET enabled = ${enabled} WHERE task = 'assistant'`)

const sessionsOf = (ownerId: string) =>
  db.select().from(assistantSession).where(eq(assistantSession.ownerId, ownerId))

beforeAll(async () => {
  const handle = await createDb('pglite://memory')
  db = handle.db
  close = handle.close
  await migrate(db as unknown as PgliteDatabase, { migrationsFolder: FOLDER })
  for (const who of [director, other, head, counted]) {
    await db.execute(sql`INSERT INTO platform.actor (id, name, email, role, role_ids)
      VALUES (${who.id}, ${who.name}, ${who.email}, ${who.role},
        ${sql.raw(`ARRAY['${who.roleIds[0]}']`)})`)
  }
}, 120_000)

afterAll(async () => close?.())

beforeEach(async () => {
  await route(true)
  reread.mockClear()
  reach.mockClear()
  reach.mockImplementation(async (_who, codes) => new Set(codes))
})

afterEach(() => vi.restoreAllMocks())

describe('availability', () => {
  const enabled = async (who: Actor) =>
    (await doors(new Scripted([])).service.availability(who)).enabled

  it('is on for a holder of assistant.use while the route is on', async () => {
    expect(await enabled(director)).toBe(true)
  })

  it('is off while the route is off, for the holder too', async () => {
    await route(false)
    expect(await enabled(director)).toBe(false)
  })

  it('is off for a role without the permission, and off the Sales branch', async () => {
    expect(await enabled(unticked)).toBe(false)
    expect(await enabled({ ...director, branches: [] })).toBe(false)
  })
})

describe('a turn', () => {
  it('opens with `session`, streams, and ends with `done` carrying the footer', async () => {
    const client = new Scripted([readRound(), { text: 'Lead đang được chăm sóc.' }])
    const { events, turn, sessionId } = await ask(client)

    expect(events[0]).toEqual({
      type: 'session',
      sessionId,
      messageId: turn!.id,
      title: 'Lead LD-0001 thế nào?',
    })
    expect(events.map((e) => e.type)).toEqual([
      'session',
      'step',
      'step',
      'tool-result',
      'step',
      /* The binder holds the last word until the round ends (D3). */
      'text',
      'text',
      'refs',
      'suggestions',
      'done',
    ])
    const wire = events.flatMap((e) => (e.type === 'text' ? [e.delta] : []))
    expect(wire).toEqual(['Lead đang được chăm ', 'sóc.'])
    expect(events).toContainEqual({
      type: 'refs',
      refs: [{ kind: 'lead', code: 'LD-0001', label: COMPANY }],
    })
    /* A key and a code: the screen words the chip in the viewer's language. */
    expect(events).toContainEqual({
      type: 'suggestions',
      items: [{ key: 'lead-converted', params: { code: 'LD-0001' } }],
    })
    const done = events.at(-1)
    if (done?.type !== 'done') throw new Error('no done')
    expect(done).toMatchObject({ messageId: turn!.id, endedBy: 'answer' })
    expect(done.footer.read).toEqual([{ kind: 'lead', count: 1 }])
    expect(done.footer.at).toMatch(/^\d{4}-\d{2}-\d{2}T.+Z$/)
    expect(JSON.stringify(client.requests)).not.toContain(COMPANY)
    expect(turn).toMatchObject({ state: 'done', body: 'Lead đang được chăm sóc.' })
  })

  it('gives an `off` event with the route off, calls no vendor and opens no session', async () => {
    await route(false)
    const client = new Scripted([{ text: 'never asked' }])
    const before = await db.select().from(assistantSession)
    const { events } = await ask(client)

    expect(events).toEqual([{ type: 'error', code: 'off', message: 'Trợ lý đang tắt.' }])
    expect(client.requests).toEqual([])
    expect(await db.select().from(assistantSession)).toHaveLength(before.length)
  })

  it('refuses a person past their daily quota before any session or row', async () => {
    await db.insert(aiCall).values({
      task: 'assistant',
      model: 'gemini-3.8-flash',
      tokensIn: 1,
      tokensOut: 1,
      outcome: 'ok',
      actorId: other.id,
      turnId: randomUUID(),
      round: 1,
    })
    await db.execute(
      sql`UPDATE platform.ai_route SET daily_calls_per_user = 1 WHERE task = 'assistant'`,
    )
    try {
      const client = new Scripted([{ text: 'never asked' }])
      const { events } = await ask(client, other, { question: 'Hôm nay có gì?' })

      expect(events).toEqual([expect.objectContaining({ type: 'error', code: 'limit' })])
      expect(client.requests).toEqual([])
      expect(await sessionsOf(other.id)).toEqual([])
    } finally {
      await db.execute(
        sql`UPDATE platform.ai_route SET daily_calls_per_user = 0 WHERE task = 'assistant'`,
      )
    }
  })

  it('answers `busy` to a second turn while the first runs, and the first still ends', async () => {
    let release: () => void = () => {}
    const held = new Promise<void>((done) => (release = done))
    const first = new Scripted([
      async () => {
        await held
        return { text: 'Xong.' }
      },
    ])
    const { turns } = doors(first)
    const events: AssistantEvent[] = []
    const running = turns.run(director, { question: 'Một' }, null, (e) => events.push(e))
    await vi.waitFor(() => expect(events[0]?.type).toBe('session'))
    const sessionId = events[0]?.type === 'session' ? events[0].sessionId : ''

    const second = await ask(new Scripted([{ text: 'never asked' }]), director, {
      question: 'Hai',
      sessionId,
    })
    release()
    await running

    expect(second.events).toEqual([
      {
        type: 'error',
        code: 'busy',
        message: 'Câu trước chưa trả lời xong. Chờ một chút rồi hỏi lại.',
      },
    ])
    expect(events.at(-1)).toMatchObject({ type: 'done', endedBy: 'answer' })
  })

  it('ends a stopped turn as `stopped` and keeps the text written so far', async () => {
    const client = new Scripted([
      async (_r, limits, onText) => {
        onText('Lead này')
        await new Promise((done) => limits.signal.addEventListener('abort', done))
        throw new AiVendorError('transient', 'gemini: AbortError: aborted')
      },
    ])
    const { turns, controller } = doors(client)
    const events: AssistantEvent[] = []
    const running = turns.run(director, { question: 'Dừng giúp' }, null, (e) => events.push(e))
    await vi.waitFor(() => expect(events.some((e) => e.type === 'text')).toBe(true))
    /* The id the stop button names, known from the first event, before `done`. */
    const id = events[0]?.type === 'session' ? events[0].messageId : ''

    expect(turns.stop(other, id)).toBe(false)
    controller.stop(director, { id })
    await running

    const [row] = await db.select().from(assistantMessage).where(eq(assistantMessage.id, id))
    expect(row).toMatchObject({ state: 'stopped', endedBy: 'stopped', body: 'Lead này' })
    expect(events.at(-1)).toMatchObject({ type: 'done', messageId: id, endedBy: 'stopped' })
  })

  it('takes a stop for a turn that ended or never ran here as a no-op', () => {
    const { turns, controller } = doors(new Scripted([]))
    const unknown = '00000000-0000-4000-8000-000000000000'

    expect(() => controller.stop(director, { id: unknown })).not.toThrow()
    expect(turns.stop(director, unknown)).toBe(false)
  })

  it('saves the whole turn when the socket closes mid-turn, and writes nothing after', async () => {
    const frames: string[] = []
    const handlers = new Map<string, () => void>()
    const raw = {
      writableEnded: false,
      destroyed: false,
      writeHead: vi.fn(),
      write: (chunk: string) => frames.push(chunk) > 0,
      end: () => (raw.writableEnded = true),
      on: (name: string, fn: () => void) => handlers.set(name, fn),
      once: (name: string, fn: () => void) => handlers.set(name, fn),
    }
    const reply = {
      hijack: vi.fn(),
      raw,
      getHeaders: () => ({ 'access-control-allow-origin': 'http://localhost:5173' }),
    }
    const client = new Scripted([
      async () => {
        raw.destroyed = true
        handlers.get('close')?.()
        return readRound()
      },
      { text: 'Vẫn trả lời đủ.' },
    ])
    const { controller } = doors(client)
    await controller.turn(director, { question: 'Đóng tab' }, reply as unknown as FastifyReply)

    expect(raw.writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({
        'access-control-allow-origin': 'http://localhost:5173',
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
      }),
    )
    expect(frames[0]).toMatch(/^event: session\ndata: \{"type":"session".+\}\n\n$/)
    expect(frames.join('')).not.toContain('Vẫn trả lời đủ.')
    const sessionId = (JSON.parse(frames[0]!.split('data: ')[1]!) as { sessionId: string })
      .sessionId
    const [turn] = await db
      .select()
      .from(assistantMessage)
      .where(
        sql`${assistantMessage.sessionId} = ${sessionId} AND ${assistantMessage.role} = 'assistant'`,
      )
    expect(turn).toMatchObject({ state: 'done', endedBy: 'answer', body: 'Vẫn trả lời đủ.' })
  })

  it('beats every 25 s and stops beating when the stream ends', () => {
    vi.useFakeTimers()
    try {
      const frames: string[] = []
      const raw = {
        writableEnded: false,
        destroyed: false,
        writeHead: vi.fn(),
        write: (chunk: string) => frames.push(chunk) > 0,
        end: () => (raw.writableEnded = true),
        on: vi.fn(),
        once: vi.fn(),
      }
      const reply = { hijack: vi.fn(), raw, getHeaders: () => ({}) }
      const stream = openTurnStream(reply as unknown as FastifyReply)
      vi.advanceTimersByTime(25_000)
      stream.end()
      vi.advanceTimersByTime(50_000)

      expect(frames).toEqual(['event: heartbeat\ndata: {"type":"heartbeat"}\n\n'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('cuts a long first question into a title on a word boundary', () => {
    const question = `${'chữ '.repeat(30)}cuối`
    const title = titleOf(question)
    expect(title.length).toBeLessThanOrEqual(80)
    expect(question.startsWith(title)).toBe(true)
    expect(title.endsWith('chữ')).toBe(true)
  })
})

describe('closing a turn', () => {
  const finish = () => vi.spyOn(AssistantRepository.prototype, 'finishTurn')

  it('retries a finish that failed once, and the answer stands', async () => {
    finish().mockRejectedValueOnce(new Error('connection reset'))
    const { events, turn } = await ask(new Scripted([{ text: 'Đã lưu.' }]))

    expect(turn).toMatchObject({ state: 'done', endedBy: 'answer', body: 'Đã lưu.' })
    expect(events.some((e) => e.type === 'error')).toBe(false)
    expect(events.at(-1)).toMatchObject({ type: 'done', endedBy: 'answer' })
  })

  it('reads back a finish that landed and then threw, and does not call it lost', async () => {
    const spy = finish()
    const real = spy.getMockImplementation() ?? AssistantRepository.prototype.finishTurn
    spy.mockImplementationOnce(async function (this: AssistantRepository, ...args) {
      await real.apply(this, args)
      throw new Error('reply lost after commit')
    })
    const { events } = await ask(new Scripted([{ text: 'Đã lưu.' }]))

    expect(events.at(-1)).toMatchObject({ type: 'done', endedBy: 'answer' })
  })

  it('tells the client `interrupted` when two finishes fail', async () => {
    finish()
      .mockRejectedValueOnce(new Error('connection reset'))
      .mockRejectedValueOnce(new Error('connection reset'))
    const { events, turn } = await ask(new Scripted([{ text: 'Không lưu được.' }]))

    expect(turn).toMatchObject({ state: 'running' })
    expect(events).toContainEqual(expect.objectContaining({ type: 'error', code: 'interrupted' }))
    expect(events.at(-1)).toMatchObject({ type: 'done', endedBy: 'crash' })
  })
})

describe('a record the person can no longer read', () => {
  it('is withheld on load, with every later answer, and left out of the replay', async () => {
    const before = await ask(new Scripted([{ text: 'Chào anh.' }]), director, {
      question: 'Chào',
    })
    const sessionId = before.sessionId!
    await ask(new Scripted([readRound(), { text: `${COMPANY} đang làm.` }]), director, {
      question: 'Lead LD-0001 thế nào?',
      sessionId,
    })
    /* No tool, and it repeats the name: only the walk forward can shut it. */
    await ask(new Scripted([{ text: `Vẫn là ${COMPANY}.` }]), director, {
      question: 'Còn khách đó?',
      sessionId,
    })
    reread.mockClear()

    const kept = await doors(new Scripted([])).service.detail(director, sessionId)
    /* One batched read for the whole chat, not one per record. */
    expect(reread).toHaveBeenCalledTimes(1)
    const answer = kept.messages[3]!
    expect(answer).toMatchObject({
      withheld: false,
      unchecked: false,
      body: `${COMPANY} đang làm.`,
      refs: [{ kind: 'lead', code: 'LD-0001', label: COMPANY }],
      footer: { read: [{ kind: 'lead', count: 1 }], at: answer.finishedAt },
    })
    expect(kept.messages[0]!.footer).toBeNull()

    const shut = await doors(new Scripted([])).service.detail(lostLeads, sessionId)
    expect(shut.messages.map((m) => [m.role, m.withheld, m.body, m.footer])).toEqual([
      ['user', false, 'Chào', null],
      ['assistant', false, 'Chào anh.', expect.anything()],
      ['user', false, 'Lead LD-0001 thế nào?', null],
      ['assistant', true, '', null],
      ['user', false, 'Còn khách đó?', null],
      ['assistant', true, '', null],
    ])

    const next = new Scripted([{ text: 'Chào.' }])
    await ask(next, lostLeads, { question: 'Còn gì nữa?', sessionId })
    expect(next.requests[0]!.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user'])
    expect(JSON.stringify(next.requests[0]!.messages[1])).toContain('Chào anh.')
    expect(JSON.stringify(next.requests)).not.toContain(COMPANY)
  })

  it('marks an answer whose re-check failed unchecked, and keeps it out of the replay', async () => {
    const first = await ask(new Scripted([readRound(BROKEN), { text: `${COMPANY} ổn.` }]))
    const detail = await doors(new Scripted([])).service.detail(director, first.sessionId!)

    expect(detail.messages[1]).toMatchObject({ unchecked: true, withheld: false, body: '' })
    const next = new Scripted([{ text: 'Chào.' }])
    await ask(next, director, { question: 'Còn gì?', sessionId: first.sessionId })
    expect(next.requests[0]!.messages).toHaveLength(1)
  })

  it('re-checks once while a turn runs, and touches nothing until it ends', async () => {
    const first = await ask(new Scripted([readRound(), { text: 'Xong.' }]))
    const sessionId = first.sessionId!
    let release: () => void = () => {}
    let asking = false
    const held = new Promise<void>((done) => (release = done))
    const { turns, service } = doors(
      new Scripted([
        async () => {
          asking = true
          await held
          return { text: 'Lâu.' }
        },
      ]),
    )
    const body = { question: 'Chờ', sessionId }
    const running = turns.run(director, body, await turns.sessionOf(director, body), () => {})
    /* Past the turn's own replay check: the vendor is being asked. */
    await vi.waitFor(() => expect(asking).toBe(true))
    const opened = sql`now() - interval '10 days'`
    await db
      .update(assistantSession)
      .set({ lastOpenedAt: opened })
      .where(eq(assistantSession.id, sessionId))
    reread.mockClear()

    await service.detail(director, sessionId)
    await service.detail(director, sessionId)
    const [polled] = await sessionsOf(director.id).then((rows) =>
      rows.filter((r) => r.id === sessionId),
    )
    expect(reread).toHaveBeenCalledTimes(1)
    expect(Date.now() - polled!.lastOpenedAt.getTime()).toBeGreaterThan(9 * 86_400_000)

    release()
    await running
    await service.detail(director, sessionId)
    expect(reread).toHaveBeenCalledTimes(2)
  })
})

describe('a stored answer that read comm summaries', () => {
  /** The `view` lines a serve left for this session, by subject code. */
  const linesOf = async (where: string) =>
    (await db.select().from(audit).where(eq(audit.action, 'view')))
      .filter((l) => l.note?.startsWith(where))
      .map((l) => l.code)
      .sort()

  async function chatOf(...codes: string[][]) {
    let sessionId: string | undefined
    for (const [i, calls] of codes.entries()) {
      const turn = await ask(new Scripted([noteRound(...calls), { text: 'Đã xem.' }]), director, {
        question: `Lần ${i}`,
        sessionId,
      })
      sessionId = turn.sessionId
    }
    return sessionId!
  }

  it('withholds a holder out of the comms reach, with the later answers, and audits nothing', async () => {
    const sessionId = await chatOf(['LD-0701'], [])
    reach.mockResolvedValue(new Set())

    const shut = await doors(new Scripted([])).service.detail(director, sessionId)
    expect(shut.messages.filter((m) => m.role === 'assistant').map((m) => m.withheld)).toEqual([
      true,
      true,
    ])
    expect(await linesOf(`assistant · session ${sessionId}`)).toEqual([])
  })

  it('marks the answer unchecked when the reach read throws', async () => {
    const sessionId = await chatOf(['LD-0702'])
    reach.mockRejectedValue(new Error('the mirror is down'))

    const shut = await doors(new Scripted([])).service.detail(director, sessionId)
    expect(shut.messages[1]).toMatchObject({ unchecked: true, withheld: false, body: '' })
  })

  it('writes one view line per subject code on every serve, and none while a turn runs', async () => {
    const sessionId = await chatOf(['LD-0703', 'LD-0704'], ['LD-0703'])
    const { service } = doors(new Scripted([]))
    const where = `assistant · session ${sessionId}`
    reach.mockClear()

    const shown = await service.detail(director, sessionId)
    expect(shown.messages[3]).toMatchObject({ withheld: false, body: 'Đã xem.' })
    expect(await linesOf(where)).toEqual(['LD-0703', 'LD-0704'])
    expect(reach).toHaveBeenCalledTimes(1)
    await service.detail(director, sessionId)
    expect(await linesOf(where)).toEqual(['LD-0703', 'LD-0703', 'LD-0704', 'LD-0704'])

    let release: () => void = () => {}
    let asking = false
    const held = new Promise<void>((done) => (release = done))
    const slow = doors(
      new Scripted([
        async () => {
          asking = true
          await held
          return { text: 'Lâu.' }
        },
      ]),
    ).turns
    const body = { question: 'Chờ', sessionId }
    const running = slow.run(director, body, await slow.sessionOf(director, body), () => {})
    await vi.waitFor(() => expect(asking).toBe(true))
    await service.detail(director, sessionId)
    expect(await linesOf(where)).toHaveLength(4)
    release()
    await running
    await service.detail(director, sessionId)
    expect(await linesOf(where)).toHaveLength(6)
  })

  it('writes no code line for a plain answer', async () => {
    const first = await ask(new Scripted([readRound('LD-0705'), { text: 'Rồi.' }]))
    await doors(new Scripted([])).service.detail(director, first.sessionId!)

    expect(await linesOf(`assistant · session ${first.sessionId}`)).toEqual([])
  })

  it('adds the code lines to the report page line, and only for a row it serves', async () => {
    const sessionId = await chatOf(['LD-0706'], ['LD-0707'])
    const { service } = doors(new Scripted([]))
    const [, second] = (
      await db.select().from(assistantMessage).where(eq(assistantMessage.sessionId, sessionId))
    )
      .filter((r) => r.role === 'assistant')
      .sort((a, b) => a.seq - b.seq)
    await service.report(director, second!.id, { reason: 'missing' })
    const query = zod(AssistantReportQuery).transform({ size: '1' })

    const page = await service.reports(director, query)
    expect(page.rows[0]).toMatchObject({ withheld: false })
    expect(await linesOf('assistant · page 1 ·')).toEqual(['LD-0706', 'LD-0707'])
    const pageLine = `assistant.reports · page 1 · 1 answer(s) read: ${second!.id}`
    expect(await linesOf(pageLine)).toEqual([null])

    const before = (await linesOf('assistant · page 1 ·')).length
    reach.mockResolvedValue(new Set())
    const shut = await service.reports(director, query)
    expect(shut.rows[0]).toMatchObject({ withheld: true, answer: '' })
    expect(await linesOf('assistant · page 1 ·')).toHaveLength(before)
  })
})

describe('sessions are the owner’s', () => {
  it('answers 404 to another person on every door, and on a turn', async () => {
    const { sessionId } = await ask(new Scripted([{ text: 'Chào.' }]))
    const { service, turns } = doors(new Scripted([]))
    const id = sessionId!

    await expect(service.detail(other, id)).rejects.toMatchObject({ status: 404 })
    await expect(service.patch(other, id, { pinned: true })).rejects.toMatchObject({ status: 404 })
    await expect(service.remove(other, id)).rejects.toMatchObject({ status: 404 })
    await expect(turns.sessionOf(other, { question: 'x', sessionId: id })).rejects.toMatchObject({
      status: 404,
    })
    expect(
      await db.select().from(assistantSession).where(eq(assistantSession.id, id)),
    ).toHaveLength(1)
  })

  it('touches last_opened_at on open, pins, renames, and deletes for the owner', async () => {
    const { sessionId } = await ask(new Scripted([{ text: 'Chào.' }]))
    const id = sessionId!
    const { service } = doors(new Scripted([]))
    await db
      .update(assistantSession)
      .set({ lastOpenedAt: sql`now() - interval '10 days'` })
      .where(eq(assistantSession.id, id))

    const opened = await service.detail(director, id)
    expect(Date.now() - Date.parse(opened.session.lastOpenedAt)).toBeLessThan(60_000)
    expect(await service.patch(director, id, { title: 'Sao Đỏ', pinned: true })).toMatchObject({
      title: 'Sao Đỏ',
      pinned: true,
    })
    expect((await service.list(director, {})).sessions[0]).toMatchObject({ id, pinned: true })
    await service.remove(director, id)
    expect(await db.select().from(assistantSession).where(eq(assistantSession.id, id))).toEqual([])
  })

  it('pages the list by cursor, pinned first, with no row twice or missed', async () => {
    const at = (minutes: number) => new Date(Date.now() - minutes * 60_000)
    await db.insert(assistantSession).values(
      Array.from({ length: 55 }, (_, i) => ({
        ownerId: counted.id,
        title: `S${i}`,
        lastOpenedAt: at(i % 3 === 0 ? 5 : i),
        pinnedAt: i === 54 ? at(1) : null,
      })),
    )
    const { service } = doors(new Scripted([]))

    const first = await service.list(counted, {})
    const second = await service.list(counted, { before: first.nextBefore! })
    const titles = [...first.sessions, ...second.sessions].map((s) => s.title)

    expect(first.sessions).toHaveLength(50)
    expect(first.sessions[0]).toMatchObject({ title: 'S54', pinned: true })
    expect(second).toMatchObject({ nextBefore: null })
    expect(new Set(titles).size).toBe(55)
    await expect(service.list(counted, { before: 'not-a-cursor' })).rejects.toMatchObject({
      status: 400,
    })
    await db.delete(assistantSession).where(eq(assistantSession.ownerId, counted.id))
  })

  it('pages rows opened in the same microsecond, as `now()` writes them', async () => {
    await db.insert(assistantSession).values(
      Array.from({ length: 55 }, (_, i) => ({
        ownerId: counted.id,
        title: `T${i}`,
        lastOpenedAt: sql`now()`,
      })),
    )
    const { service } = doors(new Scripted([]))

    const first = await service.list(counted, {})
    const second = await service.list(counted, { before: first.nextBefore! })

    expect(second.nextBefore).toBeNull()
    expect(new Set([...first.sessions, ...second.sessions].map((s) => s.title)).size).toBe(55)
    await db.delete(assistantSession).where(eq(assistantSession.ownerId, counted.id))
  })
})

describe('the hourly cap', () => {
  it('counts turns from the ledger, so deleting the chats gives none back', async () => {
    const repo = new AssistantRepository(db)
    await db.insert(aiCall).values(
      Array.from({ length: 60 }, () => ({
        task: 'assistant' as const,
        model: 'gemini-3.8-flash',
        tokensIn: 1,
        tokensOut: 1,
        outcome: 'ok' as const,
        actorId: counted.id,
        turnId: randomUUID(),
        round: 1,
      })),
    )
    const [session] = await db
      .insert(assistantSession)
      .values({ ownerId: counted.id })
      .returning({ id: assistantSession.id })

    expect(await repo.beginTurn(counted.id, session!.id, 'Một')).toEqual({
      ok: false,
      reason: 'hourly-limit',
    })
    await db.delete(aiCall).where(eq(aiCall.actorId, counted.id))
    expect(await repo.beginTurn(counted.id, session!.id, 'Một')).toMatchObject({ ok: true })
    await db.delete(assistantSession).where(eq(assistantSession.ownerId, counted.id))
  })
})

describe('reporting a wrong answer', () => {
  it('keeps one row per person and answer, and a second press moves it to the top', async () => {
    const { turn, rows } = await ask(new Scripted([{ text: 'Sai rồi.' }]))
    const { service } = doors(new Scripted([]))
    await service.report(director, turn!.id, { reason: 'missing' })
    await db.update(assistantReport).set({ createdAt: sql`now() - interval '1 day'` })
    await service.report(director, turn!.id, { reason: 'wrong-figure', note: 'Số sai' })

    const saved = await db
      .select()
      .from(assistantReport)
      .where(eq(assistantReport.messageId, turn!.id))
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({ reason: 'wrong-figure', note: 'Số sai' })
    expect(Date.now() - saved[0]!.createdAt.getTime()).toBeLessThan(60_000)

    await expect(
      service.report(director, rows[0]!.id, { reason: 'missing' }),
    ).rejects.toMatchObject({ status: 404 })
    await expect(service.report(other, turn!.id, { reason: 'missing' })).rejects.toMatchObject({
      status: 404,
    })
  })

  it('lists the answer and the question before it, and trails the read', async () => {
    const first = await ask(new Scripted([{ text: 'Đáp một.' }]), director, { question: 'Hỏi một' })
    const second = await ask(new Scripted([{ text: 'Đáp hai.' }]), director, {
      question: 'Hỏi hai',
      sessionId: first.sessionId,
    })
    const { service } = doors(new Scripted([]))
    await service.report(director, second.turn!.id, { reason: 'off-target' })

    const page = await service.reports(director, zod(AssistantReportQuery).transform({ size: '1' }))
    expect(page.rows).toHaveLength(1)
    expect(Object.keys(page.rows[0]!).sort()).toEqual(
      [
        'answer',
        'at',
        'id',
        'note',
        'question',
        'reason',
        'reporterName',
        'unchecked',
        'withheld',
      ].sort(),
    )
    expect(page.rows[0]).toMatchObject({
      reporterName: director.name,
      reason: 'off-target',
      note: null,
      question: 'Hỏi hai',
      answer: 'Đáp hai.',
      withheld: false,
    })
    expect(JSON.stringify(page)).not.toContain('Hỏi một')
    expect(page.hidden).toBe(0)
    const [line] = await db
      .select()
      .from(audit)
      .where(
        and(
          eq(audit.actorId, director.id),
          eq(audit.note, `assistant.reports · page 1 · 1 answer(s) read: ${second.turn!.id}`),
        ),
      )
    expect(line).toMatchObject({ action: 'view', code: null })
  })

  it('shuts a reported answer naming a record the reader cannot read, question and note too', async () => {
    const first = await ask(new Scripted([readRound(), { text: `${COMPANY} sai số.` }]), director, {
      question: `${COMPANY} thế nào?`,
    })
    const later = await ask(new Scripted([{ text: `Vẫn ${COMPANY}.` }]), director, {
      question: 'Còn gì?',
      sessionId: first.sessionId,
    })
    const { service } = doors(new Scripted([]))
    await service.report(director, later.turn!.id, { reason: 'missing', note: COMPANY })

    const page = await service.reports(lostLeads, zod(AssistantReportQuery).transform({}))
    const row = page.rows.find((r) => r.withheld)
    expect(row).toMatchObject({ question: '', answer: '', note: null, withheld: true })
    expect(JSON.stringify(page.rows.filter((r) => r.withheld))).not.toContain(COMPANY)
  })
})

describe('the guards', () => {
  const ctx = (handler: unknown, who: Actor, req: Record<string, unknown> = {}) =>
    ({
      getHandler: () => handler,
      getClass: () => AssistantController,
      switchToHttp: () => ({
        getRequest: () => ({ actor: who, method: 'GET', url: '/assistant/reports', ...req }),
      }),
    }) as unknown as ExecutionContext
  const gate = (handler: unknown, who: Actor) =>
    new AccessGuard(new Reflector(), createAccessControl(), new AuditRepository(db)).canActivate(
      ctx(handler, who),
    )

  it('lets only assistant.review read the reports', async () => {
    await expect(gate(AssistantController.prototype.reports, director)).resolves.toBe(true)
    await expect(gate(AssistantController.prototype.reports, head)).rejects.toMatchObject({
      status: 403,
    })
  })

  it('refuses the turn door to a role without assistant.use', async () => {
    await expect(gate(AssistantController.prototype.turn, unticked)).rejects.toMatchObject({
      status: 403,
    })
  })

  it('lets the web origin post a turn and a bodiless stop past the cross-site fence', () => {
    const env = { NODE_ENV: 'production', PV_CORS_ORIGINS: ['https://one.pv.test'] } as Env
    const guard = new CrossSiteGuard(new Reflector(), env)
    const origin = 'https://one.pv.test'
    const post = (headers: Record<string, string>) =>
      guard.canActivate(
        ctx(AssistantController.prototype.turn, director, { method: 'POST', headers }),
      )

    expect(post({ origin, 'content-type': 'application/json' })).toBe(true)
    expect(post({ origin })).toBe(true)
    expect(() =>
      post({ origin: 'https://evil.test', 'content-type': 'application/json' }),
    ).toThrow()
  })
})

describe('the boot sweep', () => {
  it('closes a turn left running past the mark as a crash, and leaves a live one', async () => {
    const [session] = await db
      .insert(assistantSession)
      .values({ ownerId: director.id })
      .returning({ id: assistantSession.id })
    const values = { sessionId: session!.id, actorId: director.id, role: 'assistant' as const }
    const [old] = await db
      .insert(assistantMessage)
      .values({
        ...values,
        seq: 2,
        state: 'running',
        createdAt: sql`now() - interval '91 seconds'`,
      })
      .returning({ id: assistantMessage.id })
    const [other2] = await db
      .insert(assistantSession)
      .values({ ownerId: director.id })
      .returning({ id: assistantSession.id })
    const [live] = await db
      .insert(assistantMessage)
      .values({ ...values, sessionId: other2!.id, seq: 2, state: 'running' })
      .returning({ id: assistantMessage.id })

    await new AssistantBootSweeper(new AssistantRepository(db), { NODE_ENV: 'test' } as Env).sweep()

    const state = async (id: string) =>
      (await db.select().from(assistantMessage).where(eq(assistantMessage.id, id)))[0]
    expect(await state(old!.id)).toMatchObject({ state: 'failed', endedBy: 'crash' })
    expect(await state(live!.id)).toMatchObject({ state: 'running', endedBy: null })
  })
})
