/** The seam between the gateway and a vendor SDK — internal to `platform/ai`.
 *
 *  A request is vendor-neutral (system text plus text and file parts); each
 *  client turns it into its SDK's shape and every SDK failure into
 *  `AiVendorError`, so the gateway's attempt policy never reads a vendor's
 *  error class. Clients never retry: the SDK retries are off, so each attempt
 *  the gateway makes is one request and one ledger row. */

import type { AiFailureKind } from './ai-policy'

export type AiPart = { text: string } | { file: { mime: string; bytes: Buffer } }
/** `webSearch`: the model may search the web first. Known debt: both vendors
 *  bill each search on top of tokens, and the ledger records tokens only. */
export type AiRequest = { system: string; parts: readonly AiPart[]; webSearch?: boolean }
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

export interface AiClient {
  /** False without the vendor's API key: its models are skipped, never tried. */
  readonly keyed: boolean
  generate(model: string, request: AiRequest, schema: object, limits: AiLimits): Promise<AiAnswer>
  countTokens(model: string, request: AiRequest, timeoutMs: number): Promise<number>
}

/** `kind` is the policy's class (`ai-policy.ts`). The message is the vendor's
 *  status and reason, never request content. */
export class AiVendorError extends Error {
  constructor(
    readonly kind: Exclude<AiFailureKind, 'bad-answer'>,
    message: string,
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

/** 200 chars of the vendor's reason: enough to diagnose, too short to carry a file. */
export const vendorMessage = (vendor: string, status: number | string, message: string) =>
  `${vendor}: ${status}: ${message.slice(0, 200)}`
