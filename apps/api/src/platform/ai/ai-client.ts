/** The seam between the gateway and a vendor SDK — internal to `platform/ai`.
 *
 *  A request is vendor-neutral (system text plus text and file parts); each
 *  client turns it into its SDK's shape and every SDK failure into
 *  `AiVendorError`, so the gateway's attempt policy never reads a vendor's
 *  error class. Clients never retry: the SDK retries are off, so each attempt
 *  the gateway makes is one request and one ledger row.
 *
 *  `converse` is the streaming, tool-calling sibling of `generate`, for the
 *  assistant's turns (ADR 0133 D6). Only the client that produced an
 *  `AiVendorTurn` reads its `raw`; everything else treats it as opaque. */

import type { AiFailureKind } from './ai-policy'

/** `recording`: audio too large to travel inline, up to 50 MB (ADR 0135). Only
 *  Gemini takes one, through its Files API. */
export type AiPart =
  | { text: string }
  | { file: { mime: string; bytes: Buffer } }
  | { recording: { mime: string; bytes: Buffer } }
/** `webSearch`: the model may search the web first. Known debt: both vendors
 *  bill each search on top of tokens, and the ledger records tokens only.
 *  `readPages`: it may also open the URLs it is given or finds (Gemini URL
 *  context, Claude web fetch). `effort`: `low` unless the caller asks for more.
 *  `prompt`: the registered prompt's `id@version`, for the ledger only. */
export type AiRequest = {
  system: string
  parts: readonly AiPart[]
  webSearch?: boolean
  readPages?: boolean
  effort?: AiEffort
  prompt?: string
}
export type AiEffort = 'low' | 'medium'
export type AiLimits = { maxTokensOut: number; timeoutMs: number }

/** `complete` is false when the vendor stopped early (token ceiling, safety). */
export type AiAnswer = {
  text: string | undefined
  complete: boolean
  finish: string
  tokensIn: number
  /** Includes thinking: the vendor bills it at the output rate. */
  tokensOut: number
}

export type AiToolDecl = { name: string; description: string; parameters: object }
export type AiToolCall = { id: string; name: string; input: Record<string, unknown> }
export type AiToolResult = { callId: string; name: string; output: unknown; isError: boolean }
/** Vendor's own assistant turn, replayed verbatim. Never stored, logged or read outside its client. */
export type AiVendorTurn = { readonly model: string; readonly raw: unknown }
export type AiMessage =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text: string }
  | { role: 'assistant-round'; text: string; calls: readonly AiToolCall[]; vendor: AiVendorTurn }
  | { role: 'tool'; results: readonly AiToolResult[]; note?: string }
export type AiConverseRequest = {
  system: string
  systemRole: string
  tools: readonly AiToolDecl[]
  toolChoice: 'auto' | 'none'
  messages: readonly AiMessage[]
  effort?: AiEffort
  prompt?: string
}
/** `tokensIn` is the whole input; the two cache counts are parts of it. */
export type AiRound = {
  text: string
  calls: readonly AiToolCall[]
  vendor: AiVendorTurn
  stop: 'end' | 'tools' | 'cut' | 'refused'
  finish: string
  tokensIn: number
  tokensCached: number
  tokensCacheWrite: number
  tokensOut: number
}

export interface AiClient {
  /** False without the vendor's API key: its models are skipped, never tried. */
  readonly keyed: boolean
  generate(model: string, request: AiRequest, schema: object, limits: AiLimits): Promise<AiAnswer>
  countTokens(model: string, request: AiRequest, timeoutMs: number): Promise<number>
  converse(
    model: string,
    r: AiConverseRequest,
    limits: AiLimits & { signal: AbortSignal },
    onText: (delta: string) => void,
  ): Promise<AiRound>
}

/** What an attempt cost, as far as the vendor had reported it. */
export type AiSpent = Pick<AiRound, 'tokensIn' | 'tokensCached' | 'tokensCacheWrite' | 'tokensOut'>

export const NOTHING_SPENT: AiSpent = {
  tokensIn: 0,
  tokensCached: 0,
  tokensCacheWrite: 0,
  tokensOut: 0,
}

/** `kind` is the policy's class (`ai-policy.ts`). The message is the vendor's
 *  status and reason, never request content. `spent`: a stream that died was
 *  still billed for what it reported, so the ledger row keeps it. */
export class AiVendorError extends Error {
  constructor(
    readonly kind: Exclude<AiFailureKind, 'bad-answer'>,
    message: string,
    readonly spent?: AiSpent,
  ) {
    super(message)
    this.name = 'AiVendorError'
  }
}

export type AiProvider = 'anthropic' | 'gemini'

/** The `AiModel` contract and the route CHECK admit exactly these two prefixes. */
export const providerOf = (model: string): AiProvider =>
  model.startsWith('claude-') ? 'anthropic' : 'gemini'

/** 401/403/404 are our key or model id at that vendor — the other model may
 *  pass; any other 4xx but 408/429 is the request's own fault. */
export const statusKind = (status: number): AiVendorError['kind'] => {
  if (status === 408 || status === 429 || status >= 500) return 'transient'
  return status === 401 || status === 403 || status === 404 ? 'vendor' : 'refused'
}

/** A JSON parser's message quotes the frame it choked on, and a frame is vendor content. */
export const plainReason = (error: unknown): string =>
  !(error instanceof Error) || error instanceof SyntaxError || error.cause instanceof SyntaxError
    ? ''
    : error.message

/** 200 chars of the vendor's reason: enough to diagnose, too short to carry a file. */
export const vendorMessage = (vendor: string, status: number | string, message: string) =>
  `${vendor}: ${status}: ${message.slice(0, 200)}`
