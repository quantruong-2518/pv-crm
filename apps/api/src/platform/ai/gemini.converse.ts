import {
  FunctionCallingConfigMode,
  ThinkingLevel,
  type Content,
  type GenerateContentConfig,
  type GenerateContentResponseUsageMetadata,
  type GoogleGenAI,
  type Part,
} from '@google/genai'
import type {
  AiConverseRequest,
  AiEffort,
  AiLimits,
  AiMessage,
  AiRound,
  AiSpent,
  AiToolCall,
  AiToolResult,
} from './ai-client'

/** Gemini's half of `AiClient.converse` (ADR 0133 D6).
 *
 *  Each stream chunk carries only new parts, and the SDK hands them over
 *  untouched. All of them are kept in order in one `Content`, empty-text parts
 *  too: a `thoughtSignature` can sit on one, and the `functionCalls` getter
 *  would drop it. Parts are not merged either, for the same reason.
 *
 *  Abort goes through `abortSignal` alone: `AiConversation` owns the timer, so
 *  no `httpOptions.timeout` runs beside it. An abort stops the read, not the
 *  vendor's billing (the SDK's own note), so `spent` keeps the last counts seen. */

export const THINKING: Record<AiEffort, ThinkingLevel> = {
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
}

const MODE = {
  auto: FunctionCallingConfigMode.AUTO,
  none: FunctionCallingConfigMode.NONE,
} as const

export async function geminiRound(
  sdk: GoogleGenAI,
  model: string,
  r: AiConverseRequest,
  limits: AiLimits & { signal: AbortSignal },
  onText: (delta: string) => void,
  spent: AiSpent,
): Promise<AiRound> {
  const stream = await sdk.models.generateContentStream({
    model,
    contents: contentsOf(r.messages),
    config: configOf(r, limits),
  })
  const parts: Part[] = []
  let usage: GenerateContentResponseUsageMetadata = {}
  let finish: string | undefined
  for await (const chunk of stream) {
    /* Field by field: a count missing from a chunk is not a zero. */
    usage = { ...usage, ...chunk.usageMetadata }
    Object.assign(spent, spentOf(usage))
    const candidate = chunk.candidates?.[0]
    for (const part of candidate?.content?.parts ?? []) {
      parts.push(part)
      if (part.text && !part.thought) onText(part.text)
    }
    finish = candidate?.finishReason ?? chunk.promptFeedback?.blockReason ?? finish
  }
  /* A dropped connection, or an error frame, which the SDK parses into an empty chunk. */
  if (!finish) throw new Error('stream ended with no finish reason')
  const stop = stopOf(finish, parts)
  const round = r.messages.filter((m) => m.role === 'assistant-round').length + 1
  return {
    text: parts.flatMap((p) => (p.text && !p.thought ? [p.text] : [])).join(''),
    calls: stop === 'tools' ? callsOf(parts, round) : [],
    vendor: { model, raw: { role: 'model', parts } satisfies Content },
    stop,
    finish,
    ...spent,
  }
}

function stopOf(finish: string, parts: readonly Part[]): AiRound['stop'] {
  if (finish === 'MAX_TOKENS') return 'cut'
  if (finish !== 'STOP') return 'refused'
  return parts.some((p) => p.functionCall) ? 'tools' : 'end'
}

/** `tokensIn` is the prompt count, which already holds the cached part. Clamped, as
 *  a count the vendor sent over would break the ledger's CHECK and lose the row. */
export const spentOf = (usage: GenerateContentResponseUsageMetadata): AiSpent => {
  const tokensIn = usage.promptTokenCount ?? 0
  return {
    tokensIn,
    tokensCached: Math.min(usage.cachedContentTokenCount ?? 0, tokensIn),
    tokensCacheWrite: 0,
    tokensOut: (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
  }
}

function callsOf(parts: readonly Part[], round: number): AiToolCall[] {
  return parts
    .flatMap((p) => (p.functionCall ? [p.functionCall] : []))
    .map((call, i) => ({
      id: call.id ?? `g${round}-${i}`,
      name: call.name ?? '',
      input: call.args ?? {},
    }))
}

function configOf(
  r: AiConverseRequest,
  limits: AiLimits & { signal: AbortSignal },
): GenerateContentConfig {
  const declarations = r.tools.map((t) => ({
    name: t.name,
    description: t.description,
    parametersJsonSchema: t.parameters,
  }))
  return {
    systemInstruction: [r.system, r.systemRole].filter(Boolean).join('\n\n'),
    maxOutputTokens: limits.maxTokensOut,
    thinkingConfig: { thinkingLevel: THINKING[r.effort ?? 'low'] },
    abortSignal: limits.signal,
    /* Declared on a `none` round too: the replayed turns name these functions. */
    ...(declarations.length > 0
      ? {
          tools: [{ functionDeclarations: declarations }],
          toolConfig: { functionCallingConfig: { mode: MODE[r.toolChoice] } },
        }
      : {}),
  }
}

/** A generated id is ours, so it stays off the wire: the id echoes only if the vendor sent it. */
function contentsOf(messages: readonly AiMessage[]): Content[] {
  const vendorIds = new Set<string>()
  return messages.flatMap((m): Content[] => {
    if (m.role === 'user') return [{ role: 'user', parts: [{ text: m.text }] }]
    if (m.role === 'assistant') return [{ role: 'model', parts: [{ text: m.text }] }]
    if (m.role === 'assistant-round') {
      const content = m.vendor.raw as Content
      for (const part of content.parts ?? []) {
        if (part.functionCall?.id) vendorIds.add(part.functionCall.id)
      }
      return [content]
    }
    const results: Content = { role: 'user', parts: m.results.map(responseOf(vendorIds)) }
    return m.note ? [results, { role: 'user', parts: [{ text: m.note }] }] : [results]
  })
}

const responseOf =
  (vendorIds: ReadonlySet<string>) =>
  (result: AiToolResult): Part => ({
    functionResponse: {
      ...(vendorIds.has(result.callId) ? { id: result.callId } : {}),
      name: result.name,
      response: result.isError ? { error: result.output } : { output: result.output },
    },
  })
