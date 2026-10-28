import Anthropic, { APIError } from '@anthropic-ai/sdk'
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages'
import { transformJSONSchema } from '@anthropic-ai/sdk/lib/transform-json-schema'
import {
  AiVendorError,
  statusKind,
  vendorMessage,
  type AiAnswer,
  type AiClient,
  type AiLimits,
  type AiRequest,
} from './ai-client'

/** Claude behind `AiClient`: structured JSON output with the gateway's schema
 *  (narrowed by the SDK's own transform to the keywords the API accepts — the
 *  gateway still parses the answer by the full zod contract), images and PDFs
 *  as content blocks, effort low.
 *
 *  `maxRetries: 0`: the SDK would otherwise retry on its own, hiding attempts
 *  from the gateway's policy and from the ledger. */

const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const
type ImageMime = (typeof IMAGE_MIME)[number]

export class AnthropicClient implements AiClient {
  readonly keyed: boolean
  private readonly sdk: Anthropic | null

  constructor(apiKey: string) {
    this.keyed = apiKey.length > 0
    this.sdk = this.keyed ? new Anthropic({ apiKey, maxRetries: 0 }) : null
  }

  async generate(
    model: string,
    request: AiRequest,
    schema: object,
    limits: AiLimits,
  ): Promise<AiAnswer> {
    const message = await this.ready()
      .messages.create(
        {
          model,
          max_tokens: limits.maxTokensOut,
          system: request.system,
          messages: [{ role: 'user', content: blocksOf(request) }],
          /* Lowest effort, thinking left adaptive: Sonnet 5.5 and Opus 5.5 refuse
           *  `thinking: disabled` with a 400, and extraction needs little thought. */
          output_config: {
            effort: 'low',
            format: { type: 'json_schema', schema: transformJSONSchema(schema) },
          },
        },
        { timeout: limits.timeoutMs },
      )
      .catch(vendorError)
    const text = message.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
    return {
      text: text || undefined,
      complete: message.stop_reason === 'end_turn',
      finish: message.stop_reason ?? 'unknown',
      tokensIn: message.usage.input_tokens,
      /* Already includes thinking tokens: `output_tokens` is the billed total. */
      tokensOut: message.usage.output_tokens,
    }
  }

  async countTokens(model: string, request: AiRequest, timeoutMs: number): Promise<number> {
    const count = await this.ready()
      .messages.countTokens(
        { model, system: request.system, messages: [{ role: 'user', content: blocksOf(request) }] },
        { timeout: timeoutMs },
      )
      .catch(vendorError)
    return count.input_tokens
  }

  private ready(): Anthropic {
    if (!this.sdk) throw new AiVendorError('vendor', 'anthropic: ANTHROPIC_API_KEY is not set')
    return this.sdk
  }
}

/** A file the API has no block for is the request's fault, so it is final. */
function blocksOf(request: AiRequest): ContentBlockParam[] {
  return request.parts.map((p): ContentBlockParam => {
    if ('text' in p) return { type: 'text', text: p.text }
    const data = p.file.bytes.toString('base64')
    if (p.file.mime === 'application/pdf') {
      return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
    }
    if (isImage(p.file.mime)) {
      return { type: 'image', source: { type: 'base64', media_type: p.file.mime, data } }
    }
    throw new AiVendorError('vendor', `anthropic: unsupported file type ${p.file.mime}`)
  })
}

const isImage = (mime: string): mime is ImageMime =>
  (IMAGE_MIME as readonly string[]).includes(mime)

/** A status means the API answered; none means a timeout or a dropped connection. */
function vendorError(error: unknown): never {
  if (error instanceof APIError && error.status !== undefined) {
    throw new AiVendorError(
      statusKind(error.status),
      vendorMessage('anthropic', error.status, error.message),
    )
  }
  const name = error instanceof Error ? error.name : 'unknown'
  const message = error instanceof Error ? error.message : ''
  throw new AiVendorError('transient', vendorMessage('anthropic', name, message))
}
