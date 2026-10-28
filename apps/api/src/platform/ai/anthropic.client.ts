import Anthropic, { APIError } from '@anthropic-ai/sdk'
import type { ContentBlock, ContentBlockParam } from '@anthropic-ai/sdk/resources/messages'
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
 *  as content blocks, the request's effort (low by default).
 *
 *  With `webSearch` the schema goes into the system text instead: web search
 *  always returns citations, and the API refuses citations beside
 *  `output_config.format` with a 400. The gateway's zod parse still decides.
 *
 *  `maxRetries: 0`: the SDK would otherwise retry on its own, hiding attempts
 *  from the gateway's policy and from the ledger. */

/** Basic search, called directly: five searches are plenty for one company.
 *  Known limit: a `pause_turn` stop reads as cut short, so the gateway's retry
 *  starts the searches over (and pays for them again) rather than resuming. */
const WEB_SEARCH = { type: 'web_search_20250305', name: 'web_search', max_uses: 5 } as const
/** Opens a URL from the prompt or a search result; citations stay off (its default).
 *  Five opens: the home page plus the four pages the site prompt names; each page's text is billed as input. */
const WEB_FETCH = { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 5 } as const

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
    const search = request.webSearch === true
    const message = await this.ready()
      .messages.create(
        {
          model,
          max_tokens: limits.maxTokensOut,
          system: search ? `${request.system}\n\n${schemaInstruction(schema)}` : request.system,
          messages: [{ role: 'user', content: blocksOf(request) }],
          ...(search ? { tools: [WEB_SEARCH, ...(request.readPages ? [WEB_FETCH] : [])] } : {}),
          /* Low effort unless asked, thinking left adaptive: Sonnet 5.5 and Opus 5.5
           *  refuse `thinking: disabled` with a 400, and extraction needs little thought. */
          output_config: {
            effort: request.effort ?? 'low',
            ...(search
              ? {}
              : { format: { type: 'json_schema', schema: transformJSONSchema(schema) } }),
          },
        },
        { timeout: limits.timeoutMs },
      )
      .catch(vendorError)
    const text = search ? jsonOf(message.content) : textOf(message.content)
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

const textOf = (blocks: readonly ContentBlock[]): string =>
  blocks.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')

/** The answer is the text after the last search; cited spans split it into
 *  several blocks, and the model may wrap the object in a sentence or a fence. */
function jsonOf(blocks: readonly ContentBlock[]): string {
  let first = blocks.length
  while (first > 0 && blocks[first - 1]?.type === 'text') first -= 1
  const text = textOf(blocks.slice(first))
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  return start >= 0 && end > start ? text.slice(start, end + 1) : ''
}

const schemaInstruction = (schema: object) =>
  `Answer with one JSON object and nothing else. It must match this JSON schema:\n${JSON.stringify(schema)}`

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
