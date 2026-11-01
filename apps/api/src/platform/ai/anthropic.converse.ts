import type Anthropic from '@anthropic-ai/sdk'
import { transformJSONSchema } from '@anthropic-ai/sdk/lib/transform-json-schema'
import type {
  ContentBlockParam,
  MessageParam,
  StopReason,
  Tool,
  ToolResultBlockParam,
  Usage,
} from '@anthropic-ai/sdk/resources/messages'
import type { MessageStreamParams } from '@anthropic-ai/sdk/resources/messages/messages'
import type {
  AiConverseRequest,
  AiLimits,
  AiMessage,
  AiRound,
  AiSpent,
  AiToolCall,
  AiToolDecl,
  AiToolResult,
} from './ai-client'

/** Claude's half of `AiClient.converse` (ADR 0133 D6).
 *
 *  `finalMessage().content` goes back verbatim on the next round: thinking
 *  blocks with empty text carry the signature the API checks, and a turn is
 *  append-only. `thinking` stays out of the body because `disabled` is a 400
 *  on Sonnet 5.5 and Opus 5.5.
 *
 *  Usage is read off every stream event, not off the final message: a message
 *  that dies mid-stream has none, and the snapshot is gone by then. Input and
 *  cache counts arrive with `message_start`; output arrives with `message_delta`
 *  near the end, so a stream cut before it reports almost no output tokens. */

const EPHEMERAL = { type: 'ephemeral' } as const

const STOP: Partial<Record<StopReason, AiRound['stop']>> = {
  end_turn: 'end',
  stop_sequence: 'end',
  tool_use: 'tools',
  max_tokens: 'cut',
  model_context_window_exceeded: 'cut',
}

export async function anthropicRound(
  sdk: Anthropic,
  model: string,
  r: AiConverseRequest,
  limits: AiLimits & { signal: AbortSignal },
  onText: (delta: string) => void,
  spent: AiSpent,
): Promise<AiRound> {
  const stream = sdk.messages.stream(bodyOf(model, r, limits), { signal: limits.signal })
  stream.on('text', (delta) => onText(delta))
  stream.on('streamEvent', (_event, snapshot) => Object.assign(spent, spentOf(snapshot.usage)))
  const message = await stream.finalMessage()
  const finish = message.stop_reason ?? 'unknown'
  const stop = STOP[finish as StopReason] ?? 'refused'
  return {
    text: message.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join(''),
    /* A cut stream can end inside a tool call, whose input is then half-parsed. */
    calls: stop === 'tools' ? message.content.flatMap(callOf) : [],
    vendor: { model, raw: message.content },
    stop,
    finish,
    ...spent,
  }
}

const spentOf = (usage: Usage): AiSpent => {
  const cached = usage.cache_read_input_tokens ?? 0
  const written = usage.cache_creation_input_tokens ?? 0
  return {
    tokensIn: usage.input_tokens + cached + written,
    tokensCached: cached,
    tokensCacheWrite: written,
    tokensOut: usage.output_tokens,
  }
}

const callOf = (block: Anthropic.ContentBlock): AiToolCall[] =>
  block.type === 'tool_use'
    ? [{ id: block.id, name: block.name, input: block.input as Record<string, unknown> }]
    : []

function bodyOf(
  model: string,
  r: AiConverseRequest,
  limits: AiLimits & { signal: AbortSignal },
): MessageStreamParams {
  const replaying = r.messages.some((m) => m.role === 'assistant-round')
  return {
    model,
    max_tokens: limits.maxTokensOut,
    system: [r.system, r.systemRole]
      .filter(Boolean)
      .map((text) => ({ type: 'text', text, cache_control: EPHEMERAL })),
    messages: r.messages.map(messageOf),
    /* The API refuses a `tool_choice` with no tools, and `none` must keep them: replayed turns name them. */
    ...(r.tools.length > 0
      ? { tools: r.tools.map(toolOf), tool_choice: { type: r.toolChoice } }
      : {}),
    /* The first round has nothing past the system blocks worth a cache write. */
    ...(replaying ? { cache_control: EPHEMERAL } : {}),
    output_config: { effort: r.effort ?? 'low' },
  }
}

/** Narrowed like `generate`'s schema: `strict` refuses keywords such as `minLength`.
 *  The server's zod parse of the input still holds the full contract. */
const toolOf = (tool: AiToolDecl): Tool => ({
  name: tool.name,
  description: tool.description,
  input_schema: transformJSONSchema(tool.parameters) as Tool.InputSchema,
  strict: true,
})

function messageOf(m: AiMessage): MessageParam {
  if (m.role === 'user' || m.role === 'assistant') return { role: m.role, content: m.text }
  if (m.role === 'assistant-round') {
    return { role: 'assistant', content: m.vendor.raw as ContentBlockParam[] }
  }
  const results = m.results.map(resultOf)
  return {
    role: 'user',
    content: m.note ? [...results, { type: 'text', text: m.note }] : results,
  }
}

const resultOf = (result: AiToolResult): ToolResultBlockParam => ({
  type: 'tool_result',
  tool_use_id: result.callId,
  content: typeof result.output === 'string' ? result.output : JSON.stringify(result.output),
  is_error: result.isError,
})
