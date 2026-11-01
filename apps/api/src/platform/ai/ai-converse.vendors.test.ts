// @vitest-environment node
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AnthropicClient } from './anthropic.client'
import {
  AiVendorError,
  type AiConverseRequest,
  type AiLimits,
  type AiMessage,
  type AiRound,
} from './ai-client'
import { GeminiClient } from './gemini.client'

/** Both vendor clients against their real SDKs and real fetch. A loopback server
 *  plays the vendor, so stream framing, abort and partial usage are the SDK's own
 *  behaviour, not a mock's. `fetch` is stubbed to send every host to loopback: no
 *  vendor is reachable from here. */

type Reply = { status?: number; body: string; hold?: boolean }
type Sent = { url: string; body: Record<string, unknown> }

const replies: Reply[] = []
const sent: Sent[] = []
let server: Server
let port = 0
const realFetch = globalThis.fetch

/** Installed before any client exists: the Anthropic SDK binds `console.error` once. */
const printed = vi.spyOn(console, 'error')

const serve = (...reply: Reply[]) => replies.push(...reply)
const framesOf = (...chunks: object[]) =>
  chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('')
const eventsOf = (...events: { type: string; [key: string]: unknown }[]) =>
  events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('')

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      sent.push({
        url: req.url ?? '',
        body: JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>,
      })
      const reply = replies.shift()
      res.writeHead(reply?.status ?? 200, { 'content-type': 'text/event-stream' })
      res.write(reply?.body ?? '')
      if (!reply?.hold) res.end()
    })
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  port = (server.address() as AddressInfo).port
  vi.stubGlobal('fetch', (url: string | URL | Request, init?: RequestInit) => {
    const { pathname, search } = new URL(url instanceof Request ? url.url : url)
    return realFetch(`http://127.0.0.1:${port}${pathname}${search}`, init)
  })
})

afterAll(async () => {
  vi.unstubAllGlobals()
  server.closeAllConnections()
  await new Promise((done) => server.close(done))
})

beforeEach(() => {
  replies.length = 0
  sent.length = 0
  printed.mockClear()
})

const tool = {
  name: 'get_record',
  description: 'read one record',
  parameters: {
    type: 'object',
    properties: { code: { type: 'string', minLength: 1 } },
    required: ['code'],
    additionalProperties: false,
  },
}
const REQUEST: AiConverseRequest = {
  system: 'stable rules',
  systemRole: 'you serve sales',
  tools: [tool],
  toolChoice: 'auto',
  messages: [{ role: 'user', text: 'tìm LD-1' }],
}

const limits = (signal = new AbortController().signal): AiLimits & { signal: AbortSignal } => ({
  maxTokensOut: 1000,
  timeoutMs: 5000,
  signal,
})

/** The request a tool round's caller builds next: earlier messages, the turn, its results. */
const next = (round: AiRound, results: { output: unknown; isError?: boolean }[]) => {
  const messages: AiMessage[] = [
    ...REQUEST.messages,
    { role: 'assistant-round', text: round.text, calls: round.calls, vendor: round.vendor },
    {
      role: 'tool',
      results: round.calls.map((c, i) => ({
        callId: c.id,
        name: c.name,
        output: results[i]?.output,
        isError: results[i]?.isError ?? false,
      })),
    },
  ]
  return { ...REQUEST, messages }
}

/** Resolves once `count` deltas arrived; the stream itself stays open. */
const deltasThenAbort = (count: number) => {
  const stop = new AbortController()
  const seen: string[] = []
  const onText = (delta: string) => {
    seen.push(delta)
    if (seen.length === count) stop.abort()
  }
  return { signal: stop.signal, seen, onText }
}

const BAD_FRAME = 'data: {"text": Nguyen Van A}\n\n'

describe('gemini', () => {
  const client = () => new GeminiClient('test-key')
  const usage = {
    promptTokenCount: 120,
    cachedContentTokenCount: 50,
    candidatesTokenCount: 9,
    thoughtsTokenCount: 4,
  }
  const SIGNED_EMPTY = { text: '', thoughtSignature: 'sig-empty' }
  const CALL_ONE = {
    functionCall: { name: 'get_record', args: { code: 'LD-1' } },
    thoughtSignature: 'sig-call',
  }
  const CALL_TWO = { functionCall: { id: 'vendor-id', name: 'get_record', args: { code: 'LD-2' } } }
  const toolRound = framesOf(
    { candidates: [{ content: { role: 'model', parts: [{ text: 'Đang tìm ' }] } }] },
    { candidates: [{ content: { role: 'model', parts: [SIGNED_EMPTY] } }] },
    { candidates: [{ content: { role: 'model', parts: [CALL_ONE] } }] },
    {
      candidates: [{ content: { role: 'model', parts: [CALL_TWO] }, finishReason: 'STOP' }],
      usageMetadata: usage,
    },
  )

  it('reports no more cached tokens than input: the ledger CHECK would lose the row', async () => {
    serve({
      body: framesOf({
        candidates: [{ content: { role: 'model', parts: [{ text: 'ok' }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 10, cachedContentTokenCount: 40 },
      }),
    })

    const round = await client().converse('gemini-3.8-flash', REQUEST, limits(), vi.fn())

    expect(round).toMatchObject({ tokensIn: 10, tokensCached: 10 })
  })

  it('keeps every part in stream order, signatures and empty text included', async () => {
    serve({ body: toolRound })
    const deltas: string[] = []

    const round = await client().converse('gemini-3.8-flash', REQUEST, limits(), (d) =>
      deltas.push(d),
    )

    expect(deltas).toEqual(['Đang tìm '])
    expect(round).toMatchObject({
      text: 'Đang tìm ',
      stop: 'tools',
      finish: 'STOP',
      tokensIn: 120,
      tokensCached: 50,
      tokensCacheWrite: 0,
      tokensOut: 13,
    })
    expect(round.calls).toEqual([
      { id: 'g1-0', name: 'get_record', input: { code: 'LD-1' } },
      { id: 'vendor-id', name: 'get_record', input: { code: 'LD-2' } },
    ])
    expect(round.vendor).toEqual({
      model: 'gemini-3.8-flash',
      raw: { role: 'model', parts: [{ text: 'Đang tìm ' }, SIGNED_EMPTY, CALL_ONE, CALL_TWO] },
    })
  })

  it('keeps thought text out of the deltas and the answer, and in the replay', async () => {
    const THOUGHT = { text: 'suy nghĩ riêng', thought: true }
    serve({
      body: framesOf({
        candidates: [
          { content: { role: 'model', parts: [THOUGHT, { text: 'Xong' }] }, finishReason: 'STOP' },
        ],
      }),
    })
    const deltas: string[] = []

    const round = await client().converse('gemini-3.8-flash', REQUEST, limits(), (d) =>
      deltas.push(d),
    )

    expect(deltas).toEqual(['Xong'])
    expect(round.text).toBe('Xong')
    expect(round.vendor.raw).toEqual({ role: 'model', parts: [THOUGHT, { text: 'Xong' }] })
  })

  it('sends system, tools and the mode the spec names', async () => {
    serve({ body: framesOf({ candidates: [{ finishReason: 'STOP' }] }) })

    await client().converse(
      'gemini-3.8-flash',
      { ...REQUEST, toolChoice: 'none' },
      limits(),
      () => undefined,
    )

    const body = sent[0]?.body as Record<string, unknown>
    expect(sent[0]?.url).toContain('gemini-3.8-flash:streamGenerateContent')
    expect(body['systemInstruction']).toMatchObject({
      parts: [{ text: 'stable rules\n\nyou serve sales' }],
    })
    expect(body['tools']).toEqual([
      {
        functionDeclarations: [
          {
            name: 'get_record',
            description: 'read one record',
            parametersJsonSchema: tool.parameters,
          },
        ],
      },
    ])
    expect(body['toolConfig']).toEqual({ functionCallingConfig: { mode: 'NONE' } })
  })

  it('replays the turn verbatim and answers in call order, echoing only a vendor id', async () => {
    serve({ body: toolRound }, { body: framesOf({ candidates: [{ finishReason: 'STOP' }] }) })
    const first = await client().converse('gemini-3.8-flash', REQUEST, limits(), () => undefined)
    const request = next(first, [{ output: { hidden: 1 } }, { output: 'no', isError: true }])

    await client().converse('gemini-3.8-flash', request, limits(), () => undefined)

    const contents = sent[1]?.body['contents'] as unknown[]
    expect(contents).toEqual([
      { role: 'user', parts: [{ text: 'tìm LD-1' }] },
      { role: 'model', parts: [{ text: 'Đang tìm ' }, SIGNED_EMPTY, CALL_ONE, CALL_TWO] },
      {
        role: 'user',
        parts: [
          { functionResponse: { name: 'get_record', response: { output: { hidden: 1 } } } },
          { functionResponse: { id: 'vendor-id', name: 'get_record', response: { error: 'no' } } },
        ],
      },
    ])
  })

  it('appends only after a round with no text: request 2 starts with request 1, byte for byte', async () => {
    const parts = [SIGNED_EMPTY, CALL_ONE]
    serve(
      { body: framesOf({ candidates: [{ content: { parts }, finishReason: 'STOP' }] }) },
      { body: framesOf({ candidates: [{ finishReason: 'STOP' }] }) },
    )
    const first = await client().converse('gemini-3.8-flash', REQUEST, limits(), () => undefined)

    await client().converse(
      'gemini-3.8-flash',
      next(first, [{ output: 1 }]),
      limits(),
      () => undefined,
    )

    expect(first.text).toBe('')
    const [one, two] = sent.map((s) => s.body['contents'] as unknown[])
    expect(JSON.stringify(two?.slice(0, one?.length))).toBe(JSON.stringify(one))
    expect(two?.[one?.length ?? 0]).toEqual({ role: 'model', parts })
  })

  it('sends a tool note as its own user content after the results', async () => {
    serve({ body: toolRound }, { body: framesOf({ candidates: [{ finishReason: 'STOP' }] }) })
    const first = await client().converse('gemini-3.8-flash', REQUEST, limits(), () => undefined)
    const request = next(first, [{ output: 1 }, { output: 2 }])
    const results = request.messages.at(-1) as Extract<AiMessage, { role: 'tool' }>

    await client().converse(
      'gemini-3.8-flash',
      { ...request, messages: [...request.messages.slice(0, -1), { ...results, note: 'hết chỗ' }] },
      limits(),
      () => undefined,
    )

    expect((sent[1]?.body['contents'] as unknown[]).at(-1)).toEqual({
      role: 'user',
      parts: [{ text: 'hết chỗ' }],
    })
  })

  it.each([
    ['STOP', 'end'],
    ['MAX_TOKENS', 'cut'],
    ['SAFETY', 'refused'],
    ['MALFORMED_FUNCTION_CALL', 'refused'],
  ])('maps a finish of %s to %s', async (finishReason, stop) => {
    serve({
      body: framesOf({
        candidates: [{ content: { role: 'model', parts: [{ text: 'x' }] }, finishReason }],
      }),
    })

    const round = await client().converse('gemini-3.8-flash', REQUEST, limits(), () => undefined)

    expect(round).toMatchObject({ stop, finish: finishReason })
  })

  it('reports a blocked prompt as refused, with no text', async () => {
    serve({
      body: framesOf({ promptFeedback: { blockReason: 'SAFETY' }, usageMetadata: usage }),
    })

    const round = await client().converse('gemini-3.8-flash', REQUEST, limits(), () => undefined)

    expect(round).toMatchObject({ stop: 'refused', finish: 'SAFETY', text: '', tokensIn: 120 })
  })

  it('keeps every usage count seen, field by field, when the caller aborts mid-stream', async () => {
    serve({
      hold: true,
      body: framesOf(
        {
          candidates: [{ content: { role: 'model', parts: [{ text: 'nửa' }] } }],
          usageMetadata: usage,
        },
        {
          candidates: [{ content: { role: 'model', parts: [{ text: ' câu' }] } }],
          usageMetadata: { candidatesTokenCount: 11 },
        },
      ),
    })
    const { signal, seen, onText } = deltasThenAbort(2)

    const failure = await client()
      .converse('gemini-3.8-flash', REQUEST, limits(signal), onText)
      .catch((e: unknown) => e)

    expect(seen).toEqual(['nửa', ' câu'])
    expect(failure).toBeInstanceOf(AiVendorError)
    expect(failure).toMatchObject({
      kind: 'transient',
      spent: { tokensIn: 120, tokensCached: 50, tokensOut: 15 },
    })
    expect((failure as AiVendorError).message).toContain('AbortError')
  })

  it('takes a stream that ends with no finish reason for a transient failure', async () => {
    serve({
      body: framesOf({ candidates: [{ content: { role: 'model', parts: [{ text: 'nửa' }] } }] }),
    })

    await expect(
      client().converse('gemini-3.8-flash', REQUEST, limits(), () => undefined),
    ).rejects.toMatchObject({ kind: 'transient' })
  })

  it('keeps a malformed frame out of the error and off the console', async () => {
    serve({ body: BAD_FRAME })

    const failure = await client()
      .converse('gemini-3.8-flash', REQUEST, limits(), () => undefined)
      .catch((e: unknown) => e)

    expect(failure).toMatchObject({ kind: 'transient' })
    expect((failure as AiVendorError).message).not.toContain('Nguyen')
    expect(printed).not.toHaveBeenCalled()
  })

  it.each([
    [503, 'transient'],
    [404, 'vendor'],
    [400, 'refused'],
  ])('classes a %i like generate does', async (status, kind) => {
    serve({ status, body: JSON.stringify({ error: { code: status, message: 'nope' } }) })

    await expect(
      client().converse('gemini-3.8-flash', REQUEST, limits(), () => undefined),
    ).rejects.toMatchObject({ kind })
  })
})

describe('anthropic', () => {
  const client = () => new AnthropicClient('test-key')
  const start = (usage: object) => ({
    type: 'message_start',
    message: {
      id: 'msg_1',
      type: 'message',
      role: 'assistant',
      model: 'claude-sonnet-5-5',
      content: [],
      stop_reason: null,
      usage,
    },
  })
  const USAGE = {
    input_tokens: 100,
    cache_read_input_tokens: 40,
    cache_creation_input_tokens: 10,
    output_tokens: 1,
  }
  const THINKING = { type: 'thinking', thinking: '', signature: 'sig-thinking' }
  const TOOL_USE = {
    type: 'tool_use',
    id: 'toolu_1',
    name: 'get_record',
    input: { code: 'LD-1' },
  }
  const toolRoundEvents = [
    start(USAGE),
    {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'thinking', thinking: '', signature: '' },
    },
    {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'signature_delta', signature: 'sig-thinking' },
    },
    { type: 'content_block_stop', index: 0 },
    { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'Đang tìm' } },
    { type: 'content_block_stop', index: 1 },
    {
      type: 'content_block_start',
      index: 2,
      content_block: { type: 'tool_use', id: 'toolu_1', name: 'get_record', input: {} },
    },
    {
      type: 'content_block_delta',
      index: 2,
      delta: { type: 'input_json_delta', partial_json: '{"code":"LD-1"}' },
    },
    { type: 'content_block_stop', index: 2 },
    {
      type: 'message_delta',
      delta: { stop_reason: 'tool_use', stop_sequence: null },
      usage: { output_tokens: 30 },
    },
    { type: 'message_stop' },
  ]
  const closing = (stop_reason: string) => [
    start(USAGE),
    {
      type: 'message_delta',
      delta: { stop_reason, stop_sequence: null },
      usage: { output_tokens: 2 },
    },
    { type: 'message_stop' },
  ]

  it('reads text, calls and the whole input off the stream', async () => {
    serve({ body: eventsOf(...toolRoundEvents) })
    const deltas: string[] = []

    const round = await client().converse('claude-sonnet-5-5', REQUEST, limits(), (d) =>
      deltas.push(d),
    )

    expect(deltas).toEqual(['Đang tìm'])
    expect(round).toMatchObject({
      text: 'Đang tìm',
      stop: 'tools',
      finish: 'tool_use',
      tokensIn: 150,
      tokensCached: 40,
      tokensCacheWrite: 10,
      tokensOut: 30,
    })
    expect(round.calls).toEqual([{ id: 'toolu_1', name: 'get_record', input: { code: 'LD-1' } }])
  })

  it('sends two cached system blocks, strict tools and no thinking; round 1 has no top-level cache', async () => {
    serve({ body: eventsOf(...closing('end_turn')) })

    await client().converse('claude-sonnet-5-5', REQUEST, limits(), () => undefined)

    const body = sent[0]?.body as Record<string, unknown>
    expect(body['system']).toEqual([
      { type: 'text', text: 'stable rules', cache_control: { type: 'ephemeral' } },
      { type: 'text', text: 'you serve sales', cache_control: { type: 'ephemeral' } },
    ])
    expect(body['tools']).toMatchObject([
      { name: 'get_record', strict: true, input_schema: { additionalProperties: false } },
    ])
    expect(JSON.stringify(body['tools'])).not.toContain('"minLength"')
    expect(body['tool_choice']).toEqual({ type: 'auto' })
    expect(body['output_config']).toEqual({ effort: 'low' })
    expect(body).not.toHaveProperty('thinking')
    expect(body).not.toHaveProperty('cache_control')
    expect(JSON.stringify(body)).not.toContain('eager_input_streaming')
  })

  it('leaves an empty role text out: the API refuses an empty block', async () => {
    serve({ body: eventsOf(...closing('end_turn')) })

    await client().converse(
      'claude-sonnet-5-5',
      { ...REQUEST, systemRole: '' },
      limits(),
      () => undefined,
    )

    expect(sent[0]?.body['system']).toHaveLength(1)
  })

  it('replays finalMessage content verbatim, append-only, with results in one user message', async () => {
    serve({ body: eventsOf(...toolRoundEvents) }, { body: eventsOf(...closing('end_turn')) })
    const first = await client().converse('claude-sonnet-5-5', REQUEST, limits(), () => undefined)
    const request = next(first, [{ output: { rows: [] } }])
    const results = request.messages.at(-1) as Extract<AiMessage, { role: 'tool' }>

    await client().converse(
      'claude-sonnet-5-5',
      {
        ...request,
        toolChoice: 'none',
        messages: [...request.messages.slice(0, -1), { ...results, note: 'hết chỗ' }],
      },
      limits(),
      () => undefined,
    )

    const body = sent[1]?.body as Record<string, unknown>
    expect(body['messages']).toEqual([
      { role: 'user', content: 'tìm LD-1' },
      {
        role: 'assistant',
        content: [THINKING, { type: 'text', text: 'Đang tìm' }, TOOL_USE],
      },
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'toolu_1',
            content: '{"rows":[]}',
            is_error: false,
          },
          { type: 'text', text: 'hết chỗ' },
        ],
      },
    ])
    expect(body['cache_control']).toEqual({ type: 'ephemeral' })
    expect(body['tool_choice']).toEqual({ type: 'none' })
  })

  it('appends only after a round with no text: request 2 starts with request 1, byte for byte', async () => {
    const noText = toolRoundEvents
      .filter((e) => !('index' in e) || e.index !== 1)
      .map((e) => ('index' in e && e.index === 2 ? { ...e, index: 1 } : e))
    serve({ body: eventsOf(...noText) }, { body: eventsOf(...closing('end_turn')) })
    const first = await client().converse('claude-sonnet-5-5', REQUEST, limits(), () => undefined)

    await client().converse(
      'claude-sonnet-5-5',
      next(first, [{ output: 1 }]),
      limits(),
      () => undefined,
    )

    expect(first.text).toBe('')
    const [one, two] = sent.map((s) => s.body['messages'] as unknown[])
    expect(JSON.stringify(two?.slice(0, one?.length))).toBe(JSON.stringify(one))
    expect(two?.[one?.length ?? 0]).toEqual({ role: 'assistant', content: [THINKING, TOOL_USE] })
  })

  it.each([
    ['end_turn', 'end'],
    ['stop_sequence', 'end'],
    ['max_tokens', 'cut'],
    ['model_context_window_exceeded', 'cut'],
    ['refusal', 'refused'],
    ['pause_turn', 'refused'],
  ])('maps a stop of %s to %s', async (reason, stop) => {
    serve({ body: eventsOf(...closing(reason)) })

    const round = await client().converse('claude-sonnet-5-5', REQUEST, limits(), () => undefined)

    expect(round).toMatchObject({ stop, finish: reason })
  })

  it('drops the half-parsed calls of a cut round', async () => {
    const cut = toolRoundEvents.map((e) =>
      e.type === 'message_delta'
        ? { ...e, delta: { stop_reason: 'max_tokens', stop_sequence: null } }
        : e,
    )
    serve({ body: eventsOf(...cut) })

    const round = await client().converse('claude-sonnet-5-5', REQUEST, limits(), () => undefined)

    expect(round).toMatchObject({ stop: 'cut', calls: [] })
  })

  it('keeps the usage message_start gave when the caller aborts mid-stream', async () => {
    serve({
      hold: true,
      body: eventsOf(
        start(USAGE),
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'nửa' } },
      ),
    })
    const { signal, seen, onText } = deltasThenAbort(1)

    const failure = await client()
      .converse('claude-sonnet-5-5', REQUEST, limits(signal), onText)
      .catch((e: unknown) => e)

    expect(seen).toEqual(['nửa'])
    expect(failure).toBeInstanceOf(AiVendorError)
    expect(failure).toMatchObject({
      kind: 'transient',
      spent: { tokensIn: 150, tokensCached: 40, tokensCacheWrite: 10, tokensOut: 1 },
    })
  })

  it('keeps usage when the connection closes before message_stop', async () => {
    serve({ body: eventsOf(start(USAGE)) })

    await expect(
      client().converse('claude-sonnet-5-5', REQUEST, limits(), () => undefined),
    ).rejects.toMatchObject({ kind: 'transient', spent: { tokensIn: 150 } })
  })

  it('takes a mid-stream error frame for transient, with the usage so far', async () => {
    serve({
      body: eventsOf(start(USAGE), {
        type: 'error',
        error: { type: 'overloaded_error', message: 'Overloaded' },
      }),
    })

    await expect(
      client().converse('claude-sonnet-5-5', REQUEST, limits(), () => undefined),
    ).rejects.toMatchObject({ kind: 'transient', spent: { tokensIn: 150 } })
  })

  it('keeps a malformed frame out of the error and off the console', async () => {
    serve({ body: `event: content_block_delta\n${BAD_FRAME}` })

    const failure = await client()
      .converse('claude-sonnet-5-5', REQUEST, limits(), () => undefined)
      .catch((e: unknown) => e)

    expect(failure).toMatchObject({ kind: 'transient' })
    expect((failure as AiVendorError).message).not.toContain('Nguyen')
    expect(printed).not.toHaveBeenCalled()
  })

  it.each([
    [529, 'transient'],
    [404, 'vendor'],
    [400, 'refused'],
  ])('classes a %i like generate does', async (status, kind) => {
    serve({ status, body: JSON.stringify({ type: 'error', error: { message: 'nope' } }) })

    await expect(
      client().converse('claude-sonnet-5-5', REQUEST, limits(), () => undefined),
    ).rejects.toMatchObject({ kind })
  })
})

it('refuses to converse without a key, for both vendors', async () => {
  for (const unkeyed of [new GeminiClient(''), new AnthropicClient('')]) {
    await expect(unkeyed.converse('m', REQUEST, limits(), () => undefined)).rejects.toMatchObject({
      kind: 'vendor',
    })
  }
})
