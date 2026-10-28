import { ApiError, GoogleGenAI, ThinkingLevel, type Part } from '@google/genai'
import {
  AiVendorError,
  statusKind,
  vendorMessage,
  type AiAnswer,
  type AiClient,
  type AiLimits,
  type AiRequest,
} from './ai-client'

/** Gemini behind `AiClient`: JSON mode with the gateway's schema, Google
 *  Search grounding when the request asks for the web, the lowest thinking
 *  level the models accept, and the route's ceiling and timeout per request.
 *
 *  `retryOptions: { attempts: 1 }`: the SDK would otherwise retry 408/429/5xx
 *  on its own, hiding attempts from the gateway's policy and from the ledger. */
export class GeminiClient implements AiClient {
  readonly keyed: boolean
  private readonly sdk: GoogleGenAI | null

  constructor(apiKey: string) {
    this.keyed = apiKey.length > 0
    this.sdk = this.keyed
      ? new GoogleGenAI({ apiKey, httpOptions: { retryOptions: { attempts: 1 } } })
      : null
  }

  async generate(
    model: string,
    request: AiRequest,
    schema: object,
    limits: AiLimits,
  ): Promise<AiAnswer> {
    const response = await this.ready()
      .models.generateContent({
        model,
        contents: [{ role: 'user', parts: partsOf(request) }],
        config: {
          systemInstruction: request.system,
          maxOutputTokens: limits.maxTokensOut,
          responseMimeType: 'application/json',
          responseJsonSchema: schema,
          /* Gemini 3 accepts the JSON schema and search grounding together (preview). */
          ...(request.webSearch ? { tools: [{ googleSearch: {} }] } : {}),
          /* LOW, not MINIMAL: gemini-3.8-flash refuses MINIMAL with a 400. */
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          httpOptions: { timeout: limits.timeoutMs },
        },
      })
      .catch(vendorError)
    const usage = response.usageMetadata
    const finish = response.candidates?.[0]?.finishReason ?? 'unknown'
    return {
      text: response.text,
      complete: finish === 'STOP',
      finish,
      tokensIn: usage?.promptTokenCount ?? 0,
      tokensOut: (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0),
    }
  }

  /** The Developer API refuses `systemInstruction` on a count, so the system
   *  text is counted as a leading text part — close enough for a ceiling. */
  async countTokens(model: string, request: AiRequest, timeoutMs: number): Promise<number> {
    const response = await this.ready()
      .models.countTokens({
        model,
        contents: [{ role: 'user', parts: [{ text: request.system }, ...partsOf(request)] }],
        config: { httpOptions: { timeout: timeoutMs } },
      })
      .catch(vendorError)
    return response.totalTokens ?? 0
  }

  private ready(): GoogleGenAI {
    if (!this.sdk) throw new AiVendorError('vendor', 'gemini: GEMINI_API_KEY is not set')
    return this.sdk
  }
}

function partsOf(request: AiRequest): Part[] {
  return request.parts.map((p) =>
    'text' in p
      ? { text: p.text }
      : { inlineData: { mimeType: p.file.mime, data: p.file.bytes.toString('base64') } },
  )
}

/** An `ApiError` carries the vendor's status; anything else is a timeout or a
 *  dropped connection, which another model may well survive. */
function vendorError(error: unknown): never {
  if (error instanceof ApiError) {
    throw new AiVendorError(
      statusKind(error.status),
      vendorMessage('gemini', error.status, error.message),
    )
  }
  const name = error instanceof Error ? error.name : 'unknown'
  const message = error instanceof Error ? error.message : ''
  throw new AiVendorError('transient', vendorMessage('gemini', name, message))
}
