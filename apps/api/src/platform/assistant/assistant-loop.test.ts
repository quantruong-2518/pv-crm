// @vitest-environment node
import 'reflect-metadata'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Controller, Get } from '@nestjs/common'
import { AssistantRecordKind, type AssistantEvent } from '@pv/contracts'
import { createAccessControl, DEFAULT_ROLE_PERMISSIONS, type Actor } from '@pv/engines'
import { eq, sql } from 'drizzle-orm'
import { PgDialect, getTableConfig } from 'drizzle-orm/pg-core'
import { migrate } from 'drizzle-orm/pglite/migrator'
import type { PgliteDatabase } from 'drizzle-orm/pglite'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { Need } from '../access/need.decorator'
import {
  AiVendorError,
  type AiClient,
  type AiConverseRequest,
  type AiLimits,
  type AiRound,
} from '../ai/ai-client'
import { AiGateway } from '../ai/ai-gateway'
import { AiLedger } from '../ai/ai-ledger'
import { AiRouteRepository } from '../ai/ai-route.repository'
import { AuditRepository } from '../audit/audit.repository'
import { createDb, type Db } from '../db/create-db'
import { audit } from '../db/platform.schema'
import { isDbConstraint } from '../http/db-error'
import { AssistantRunner } from './assistant-loop'
import { AssistantToolGate, defineTool, door } from './assistant-tools'
import { AssistantRepository } from './assistant.repository'
import { assistantMessage, assistantSession, assistantToolCall } from './assistant.schema'

/** The round's order on the real migrations, gateway, ledger and audit, with a
 *  scripted vendor. The caps and the scope matrix belong to the eval suite. */

const FOLDER = resolve(dirname(fileURLToPath(import.meta.url)), '../../../drizzle')

@Controller('fake')
class FakeDoors {
  @Get('lead')
  @Need({ branch: 'Sales', permission: 'lead.view' })
  lead() {}

  @Get('contract')
  @Need({ branch: 'Sales', permission: 'contract.view' })
  contract() {}
}

const marketing: Actor = {
  id: 'u-mkt',
  name: 'Marketing',
  email: 'mkt@pv.test',
  role: 'Marketing',
  roleIds: ['marketing'],
  permissions: DEFAULT_ROLE_PERMISSIONS.marketing,
  branches: ['Sales'],
}

const STORED = 'Stored by the public intake form'
const Input = z.object({ kind: z.enum(['lead', 'contract']) }).strict()
const tool = defineTool({
  name: 'read_x',
  description: 'Fake.',
  input: Input,
  doors: { lead: door(FakeDoors, 'lead'), contract: door(FakeDoors, 'contract') },
  doorFor: (input) => input.kind,
  run: async () => ({
    data: { trusted: { code: 'LD-0001' }, untrusted: { company: STORED } },
    codes: ['LD-0001'],
    rowCount: 1,
    hidden: null,
  }),
})

/* Same code as `read_x`: what a second tool on one record leaves in the trail. */
const skim = defineTool({
  name: 'skim_x',
  description: 'Fake.',
  input: Input,
  doors: { lead: door(FakeDoors, 'lead') },
  doorFor: () => 'lead',
  run: async () => ({ data: {}, codes: ['LD-0001'], rowCount: 1, hidden: null }),
})

/* Reveals gated text; `huge` also breaks the turn's token cap, so the model never sees it. */
const reveal = (name: string, pad: string) =>
  defineTool({
    name,
    description: 'Fake.',
    input: Input,
    doors: { lead: door(FakeDoors, 'lead'), contract: door(FakeDoors, 'contract') },
    doorFor: (input) => input.kind,
    reveals: 'comm.view-content',
    run: async () => ({
      data: { untrusted: { pad } },
      codes: ['LD-0001'],
      rowCount: 1,
      hidden: null,
      revealsContent: true,
    }),
  })
const shows = reveal('shows_x', 'summary')
const huge = reveal('huge_x', 'x'.repeat(200_000))

/* Two doors in one call: marketing passes the lead one and not the contract one. */
const both = defineTool({
  name: 'both_x',
  description: 'Fake.',
  input: z.object({}).strict(),
  doors: { lead: door(FakeDoors, 'lead'), contract: door(FakeDoors, 'contract') },
  doorFor: () => ['lead', 'contract'] as const,
  run: async (_who, _input, open) => ({
    data: { trusted: { open: [...open] } },
    codes: ['LD-0001'],
    rowCount: 1,
    hidden: null,
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

/** Replays `steps`, records every request, streams text through `onText`. */
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

const toolRound = (kind: string, name = 'read_x'): Partial<AiRound> => ({
  calls: [{ id: 'vendor-1', name, input: { kind } }],
  stop: 'tools',
})

let db: Db
let close: () => Promise<void>
const auditRepo = () => new AuditRepository(db)

function runnerWith(client: Scripted, audits = auditRepo()) {
  const routes = new AiRouteRepository(db)
  const gateway = new AiGateway(routes, new AiLedger(), { gemini: client, anthropic: client }, db)
  const gate = new AssistantToolGate(
    { tools: () => [tool, skim, both, shows, huge] },
    createAccessControl(),
  )
  return new AssistantRunner(gateway, new AssistantRepository(db), audits, gate)
}

async function ask(client: Scripted, audits = auditRepo()) {
  const [session] = await db
    .insert(assistantSession)
    .values({ ownerId: marketing.id })
    .returning({ id: assistantSession.id })
  const events: AssistantEvent[] = []
  const ctx = {
    who: marketing,
    sessionId: session!.id,
    question: 'Lead này thế nào?',
    screen: '/leads/LD-0001',
    task: 'assistant' as const,
  }
  await runnerWith(client, audits).runTurn(
    ctx,
    (e) => {
      events.push(e)
      throw new Error('the socket is gone')
    },
    new AbortController().signal,
  )
  const rows = await db
    .select()
    .from(assistantMessage)
    .where(eq(assistantMessage.sessionId, session!.id))
    .orderBy(assistantMessage.seq)
  return { events, rows, sessionId: session!.id, turn: rows.at(-1)! }
}

const auditOf = (turnId: string) =>
  db
    .select()
    .from(audit)
    .where(sql`${audit.note} LIKE ${`%turn ${turnId}%`}`)

beforeAll(async () => {
  const handle = await createDb('pglite://memory')
  db = handle.db
  close = handle.close
  await migrate(db as unknown as PgliteDatabase, { migrationsFolder: FOLDER })
  await db.execute(sql`INSERT INTO platform.actor (id, name, email, role, role_ids)
    VALUES (${marketing.id}, 'Marketing', 'mkt@pv.test', 'marketing', ARRAY['marketing'])`)
  await db.execute(sql`UPDATE platform.ai_route SET enabled = true WHERE task = 'assistant'`)
}, 120_000)

afterAll(async () => close?.())

describe('a round', () => {
  it('lands the audit and the tool row before the next request is built', async () => {
    const seen = { audits: -1, calls: -1 }
    const client = new Scripted([
      toolRound('lead'),
      async () => {
        seen.audits = (await db.select().from(audit).where(eq(audit.code, 'LD-0001'))).length
        seen.calls = (await db.select().from(assistantToolCall)).length
        return { text: 'Lead đang được chăm sóc.' }
      },
    ])
    const { rows, turn, events } = await ask(client)

    expect(seen).toEqual({ audits: 1, calls: 1 })
    expect(turn).toMatchObject({ state: 'done', endedBy: 'answer', rounds: 2 })
    expect(turn.body).toBe('Lead đang được chăm sóc.')
    expect(turn.promptVersion).toBe('assistant@9')
    expect(rows[0]).toMatchObject({ role: 'user', state: 'done' })
    expect(rows[0]!.finishedAt).not.toBeNull()
    /* The sink threw on every event and the turn still ran to its end. */
    expect(events.at(-1)).toMatchObject({ type: 'done', endedBy: 'answer' })

    const [first, second] = client.requests
    expect(first!.messages).toHaveLength(1)
    const tools = second!.messages.at(-1)
    if (tools?.role !== 'tool') throw new Error('no tool message')
    const lines = (tools.results[0]!.output as string).split('\n')
    expect(lines[0]).toMatch(/^DATA-[0-9a-f-]{36}$/)
    expect(lines[2]).toBe(lines[0])
    expect(JSON.parse(lines[1]!)).toMatchObject({ untrusted: { company: STORED } })
    expect(second!.system + second!.systemRole).not.toContain(lines[0]!)
    expect(first!.messages[0]).toMatchObject({ role: 'user' })
    expect(JSON.stringify(first!.messages[0])).toContain('/leads/LD-0001')
    expect(first!.system).not.toContain('/leads/LD-0001')
    expect(first!.system).toContain('contactInfoWithheld, or any text reads [withheld]')

    const [line] = await auditOf(turn.id)
    const [row] = await db
      .select()
      .from(assistantToolCall)
      .where(eq(assistantToolCall.messageId, turn.id))
    expect(line).toMatchObject({ action: 'ai-read', code: 'LD-0001' })
    expect(line!.note).toBe(`assistant.read_x · turn ${turn.id} · call ${row!.id}`)
    expect(row).toMatchObject({ outcome: 'ok', codes: ['LD-0001'], rowCount: 1, position: 0 })
  })

  it('stores whether a call revealed gated text, and false for one the token cap dropped', async () => {
    const client = new Scripted([
      {
        calls: [
          { id: 'v1', name: 'read_x', input: { kind: 'lead' } },
          { id: 'v2', name: 'shows_x', input: { kind: 'lead' } },
          { id: 'v3', name: 'huge_x', input: { kind: 'lead' } },
        ],
        stop: 'tools' as const,
      },
      { text: 'Xong.' },
    ])
    const { turn } = await ask(client)

    const rows = await db
      .select()
      .from(assistantToolCall)
      .where(eq(assistantToolCall.messageId, turn.id))
    const flag = (name: string) => rows.find((r) => r.name === name)
    expect(flag('read_x')).toMatchObject({ outcome: 'ok', revealsContent: false })
    expect(flag('shows_x')).toMatchObject({ outcome: 'ok', revealsContent: true })
    expect(flag('huge_x')).toMatchObject({ outcome: 'over-cap', revealsContent: false })
  })

  it('ends the turn with nothing sent when the audit write fails', async () => {
    const audits = auditRepo()
    vi.spyOn(audits, 'writeMany').mockRejectedValue(new Error('the disk is full'))
    const client = new Scripted([toolRound('lead'), { text: 'never asked' }])
    const { turn, events } = await ask(client, audits)

    expect(client.requests).toHaveLength(1)
    expect(turn).toMatchObject({ state: 'failed', endedBy: 'crash', rounds: 1 })
    expect(JSON.stringify(events)).not.toContain(STORED)
    expect(events).toContainEqual({
      type: 'error',
      code: 'failed',
      message: 'Trợ lý chưa trả lời được. Thử lại.',
    })
  })

  it('writes a refusal like the guard, and no ai-read line', async () => {
    const client = new Scripted([toolRound('contract'), { text: 'Bạn không xem được.' }])
    const { turn } = await ask(client)

    const lines = await auditOf(turn.id)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ action: 'view', code: null })
    expect(lines[0]!.note).toMatch(/^chặn assistant\.read_x · turn .+ · permission-denied$/)
    expect(JSON.stringify(client.requests[1]!.messages.at(-1))).toContain('not-allowed')
    expect(JSON.stringify(client.requests[1]!.messages)).not.toContain(STORED)
  })

  it('writes a refusal line for the one door refused in a call that ran on the other', async () => {
    const both = { calls: [{ id: 'vendor-1', name: 'both_x', input: {} }], stop: 'tools' as const }
    const client = new Scripted([both, { text: 'Chỉ xem được lead.' }])
    const { turn } = await ask(client)

    const lines = await auditOf(turn.id)
    const refused = lines.filter((l) => l.action === 'view')
    expect(refused).toHaveLength(1)
    expect(refused[0]!.note).toMatch(
      /^chặn assistant\.both_x · turn .+ · contract · permission-denied$/,
    )
    expect(lines.filter((l) => l.action === 'ai-read').map((l) => l.code)).toEqual(['LD-0001'])
    expect(JSON.stringify(client.requests[1]!.messages.at(-1))).not.toContain('contract')
  })

  it('writes a second line when a search hit is opened', async () => {
    const client = new Scripted([
      toolRound('lead', 'skim_x'),
      toolRound('lead'),
      { text: 'Lead đang được chăm sóc.' },
    ])
    const { turn } = await ask(client)

    const lines = await auditOf(turn.id)
    expect(lines.map((l) => l.code)).toEqual(['LD-0001', 'LD-0001'])
    expect(lines.every((l) => l.action === 'ai-read')).toBe(true)
    const notes = lines.map((l) => l.note).sort()
    expect(notes[0]).toContain('assistant.read_x ·')
    expect(notes[1]).toContain('assistant.skim_x ·')
  })

  it('writes one line when one tool opens a record twice', async () => {
    const read = { id: 'vendor-1', name: 'read_x', input: { kind: 'lead' } }
    const client = new Scripted([
      { calls: [read, { ...read, id: 'vendor-2' }], stop: 'tools' },
      toolRound('lead'),
      { text: 'Lead đang được chăm sóc.' },
    ])
    const { turn } = await ask(client)

    expect(await auditOf(turn.id)).toHaveLength(1)
  })

  it('stores a tool name the table would refuse, so an invented one is no crash', async () => {
    const client = new Scripted([
      toolRound('lead', 'getRecord-2'),
      { text: 'Không có công cụ đó.' },
    ])
    const { turn } = await ask(client)

    const [row] = await db
      .select()
      .from(assistantToolCall)
      .where(eq(assistantToolCall.messageId, turn.id))
    expect(turn).toMatchObject({ state: 'done', endedBy: 'answer' })
    expect(row).toMatchObject({ name: 'getrecord__', outcome: 'unknown-tool' })
  })
})

describe('text the database cannot hold', () => {
  it('keeps an answer that holds a NUL, and closes the row', async () => {
    const { turn } = await ask(new Scripted([{ text: 'xin\u0000 chào' }]))

    expect(turn).toMatchObject({ state: 'done', endedBy: 'answer', body: 'xin chào' })
  })

  it('stores a tool input that holds a NUL at any depth', async () => {
    const input = { kind: 'lead\u0000', 'bad\u0000key': [{ deep: 'a\u0000b' }] }
    const client = new Scripted([
      { calls: [{ id: 'vendor-1', name: 'read_x', input }], stop: 'tools' },
      { text: 'Không đọc được.' },
    ])
    const { turn } = await ask(client)

    const [row] = await db
      .select()
      .from(assistantToolCall)
      .where(eq(assistantToolCall.messageId, turn.id))
    expect(turn).toMatchObject({ state: 'done', endedBy: 'answer' })
    expect(row?.input).toEqual({ kind: 'lead', badkey: [{ deep: 'ab' }] })
  })
})

describe('the answer', () => {
  it('sets each round apart with a blank line, on the row and on the wire', async () => {
    const client = new Scripted([
      { ...toolRound('lead'), text: 'Để tôi xem.' },
      { text: 'Lead đang được chăm sóc.' },
    ])
    const { turn, events } = await ask(client)

    expect(turn.body).toBe('Để tôi xem.\n\nLead đang được chăm sóc.')
    const wire = events.flatMap((e) => (e.type === 'text' ? [e.delta] : []))
    expect(wire.join('')).toBe(turn.body)
  })

  it('fills a cited value while it streams, and stores the filled text (D3)', async () => {
    const client = new Scripted([
      toolRound('lead'),
      async (_r, _limits, onText) => {
        onText('Lead ⟦v')
        onText('2⟧ có ⟦v1⟧ hồ sơ, giá 500 triệu. ')
        onText('⟦v9⟧Xong.')
        return {}
      },
    ])
    const { turn, events } = await ask(client)

    const sent = (
      client.requests[1]!.messages.at(-1) as { results: { output: string }[] }
    ).results[0]!.output.split('\n')[1]!
    expect(JSON.parse(sent)).toMatchObject({
      rows: { value: 1, cite: '⟦v1⟧' },
      trusted: { code: { value: 'LD-0001', cite: '⟦v2⟧' } },
    })
    expect(turn.body).toBe('Lead LD-0001 có 1 hồ sơ, giá [chưa rõ] triệu. Xong.')
    const wire = events.flatMap((e) => (e.type === 'text' ? [e.delta] : []))
    expect(wire.join('')).toBe(turn.body)
    expect(wire.some((delta) => /[⟦⟧]/.test(delta))).toBe(false)
  })
})

describe('the time budget', () => {
  const CUT_SHORT = 'Trợ lý chưa trả lời được câu này. Thử lại sau ít phút.'
  const ANSWER = 'Lead đang được chăm sóc.'
  const realNow = Date.now
  let offset = 0

  beforeEach(() => {
    offset = 0
    vi.spyOn(Date, 'now').mockImplementation(() => realNow() + offset)
  })
  afterEach(() => vi.mocked(Date.now).mockRestore())

  const toolRoundAt = (ms: number) => async () => {
    offset = ms
    return toolRound('lead')
  }
  const killed = () => new AiVendorError('transient', 'gemini: AbortError: aborted')
  /** What the reserve timer does to a stream. */
  const stalled = async (_r: AiConverseRequest, limits: Limits): Promise<never> => {
    await new Promise((done) => limits.signal.addEventListener('abort', done))
    throw killed()
  }

  /** The killed round left no trace: the writing round reads what was already held. */
  const expectWrittenFromHeld = (client: Scripted, turn: { state: string }) => {
    expect(turn).toMatchObject({ state: 'done', endedBy: 'cap-time', body: ANSWER })
    expect(client.requests.map((r) => r.toolChoice)).toEqual(['auto', 'auto', 'none'])
    expect(JSON.stringify(client.requests[2]?.messages.at(-1))).toContain(STORED)
  }

  it('writes from the held results when the reserve timer kills a round opened at 30 s', async () => {
    let timeoutMs = 0
    const client = new Scripted([
      toolRoundAt(30_000),
      async (_r, limits) => {
        timeoutMs = limits.timeoutMs
        offset += limits.timeoutMs
        throw killed()
      },
      { text: ANSWER },
    ])
    const { turn } = await ask(client)

    expect(timeoutMs).toBeGreaterThan(17_000)
    expect(timeoutMs).toBeLessThanOrEqual(18_000)
    expectWrittenFromHeld(client, turn)
  })

  it('writes from the held results when a round opened at 47.9 s is killed', async () => {
    const client = new Scripted([toolRoundAt(47_900), stalled, { text: ANSWER }])
    const { turn } = await ask(client)

    expectWrittenFromHeld(client, turn)
  })

  it('does not rewrite a round that had started to answer', async () => {
    const client = new Scripted([
      toolRoundAt(47_900),
      async (_r, _limits, onText) => {
        onText('Lead này')
        offset = 48_000
        throw killed()
      },
      { text: 'never asked' },
    ])
    const { turn } = await ask(client)

    expect(client.requests).toHaveLength(2)
    expect(turn.body).toBe(`Lead này\n\n${CUT_SHORT}`)
  })

  it('fails the turn when nothing was read before the timer', async () => {
    const client = new Scripted([
      async () => {
        offset = 48_000
        throw killed()
      },
      { text: 'never asked' },
    ])
    const { turn } = await ask(client)

    expect(client.requests).toHaveLength(1)
    expect(turn).toMatchObject({ state: 'failed', endedBy: 'vendor' })
  })

  it('counts a cap with no answer as failed, though the row holds the fixed sentence', async () => {
    const stillCalling = { ...toolRound('lead'), text: '' }
    const client = new Scripted([toolRoundAt(48_000), stillCalling])
    const { turn } = await ask(client)

    expect(turn).toMatchObject({ state: 'failed', endedBy: 'cap-time', body: CUT_SHORT })
  })
})

describe('opening a turn', () => {
  const repo = () => new AssistantRepository(db)

  it('replays no exchange with a blank side: a blank text block is a 400', async () => {
    const [session] = await db
      .insert(assistantSession)
      .values({ ownerId: marketing.id })
      .returning({ id: assistantSession.id })
    const id = session!.id
    const bodies = ['hỏi', ' \n ', '   ', 'đáp', 'còn đây', 'thật']
    await db.insert(assistantMessage).values(
      bodies.map((body, i) => ({
        sessionId: id,
        actorId: marketing.id,
        seq: i + 1,
        role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
        body,
        state: 'done' as const,
        finishedAt: new Date(),
      })),
    )

    expect(await repo().beginTurn(marketing.id, id, 'mới')).toMatchObject({
      history: [
        { role: 'user', body: 'còn đây' },
        { role: 'assistant', body: 'thật' },
      ],
    })
  })

  it('refuses a session on a kind no tool reads, the schema saying what the table says', async () => {
    const NAME = 'assistant_session_subject_kind_known'
    const open = (kind: string | null) =>
      db
        .insert(assistantSession)
        .values({ ownerId: marketing.id, subjectKind: kind as never, subjectCode: kind && 'X-1' })
    const refused: unknown = await open('campaign').catch((error: unknown) => error)
    expect(isDbConstraint(refused, NAME)).toBe(true)
    for (const kind of [null, ...AssistantRecordKind.options]) await open(kind)

    const quoted = (text: string) => text.match(/'[^']+'/g)?.sort()
    const declared = getTableConfig(assistantSession).checks.find((c) => c.name === NAME)
    const built = await db.execute(
      sql`SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = ${NAME}`,
    )
    const { def } = (built as unknown as { rows: { def: string }[] }).rows[0]!
    expect(quoted(def)).toEqual(AssistantRecordKind.options.map((k) => `'${k}'`).sort())
    expect(quoted(new PgDialect().sqlToQuery(declared!.value).sql)).toEqual(quoted(def))
  })

  it('refuses a second running turn and leaves no user row', async () => {
    const [session] = await db
      .insert(assistantSession)
      .values({ ownerId: marketing.id })
      .returning({ id: assistantSession.id })
    const id = session!.id

    expect(await repo().beginTurn(marketing.id, id, 'một')).toMatchObject({ ok: true })
    expect(await repo().beginTurn(marketing.id, id, 'hai')).toEqual({
      ok: false,
      reason: 'running',
    })
    const rows = await db.select().from(assistantMessage).where(eq(assistantMessage.sessionId, id))
    expect(rows.map((r) => r.body).sort()).toEqual(['', 'một'])
  })

  it('clears a running row past 90 s, finished_at included', async () => {
    const [session] = await db
      .insert(assistantSession)
      .values({ ownerId: marketing.id })
      .returning({ id: assistantSession.id })
    const id = session!.id
    const begun = await repo().beginTurn(marketing.id, id, 'một')
    if (!begun.ok) throw new Error('turn refused')
    await db
      .update(assistantMessage)
      .set({ createdAt: sql`now() - interval '91 seconds'` })
      .where(eq(assistantMessage.id, begun.turnId))

    expect(await repo().beginTurn(marketing.id, id, 'hai')).toMatchObject({ ok: true })
    const [stale] = await db
      .select()
      .from(assistantMessage)
      .where(eq(assistantMessage.id, begun.turnId))
    expect(stale).toMatchObject({ state: 'failed', endedBy: 'crash' })
    expect(stale!.finishedAt).not.toBeNull()
  })

  it("refuses another person's session", async () => {
    const [session] = await db
      .insert(assistantSession)
      .values({ ownerId: marketing.id })
      .returning({ id: assistantSession.id })
    expect(await repo().beginTurn('u-other', session!.id, 'một')).toEqual({
      ok: false,
      reason: 'no-session',
    })
  })
})
