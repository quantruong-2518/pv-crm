import { Logger } from '@nestjs/common'
import {
  ApiError,
  FileState,
  GoogleGenAI,
  type File as VendorFile,
  type GenerateContentParameters,
  type GenerateContentResponseUsageMetadata,
  type Part,
} from '@google/genai'
import {
  AiVendorError,
  NOTHING_SPENT,
  plainReason,
  statusKind,
  vendorMessage,
  type AiAnswer,
  type AiClient,
  type AiConverseRequest,
  type AiLimits,
  type AiPart,
  type AiRequest,
  type AiRound,
  type AiSpent,
} from './ai-client'
import { geminiRound, spentOf, THINKING } from './gemini.converse'

/** Gemini behind `AiClient`: JSON mode with the gateway's schema, Google
 *  Search grounding and URL context when the request asks for the web, the
 *  request's thinking level (LOW, the lowest the models accept, unless it
 *  asks for more), and the route's ceiling and timeout per request.
 *
 *  `retryOptions: { attempts: 1 }`: the SDK would otherwise retry 408/429/5xx
 *  on its own, hiding attempts from the gateway's policy and from the ledger.
 *
 *  A recording goes through the Files API (ADR 0135): uploaded, awaited until
 *  ACTIVE and deleted again inside one attempt, so a retry uploads again and the
 *  upload spends the same `timeoutMs` as the call. */

const FILE_POLL_MS = 2_000
const FILE_DELETE_TIMEOUT_MS = 10_000

export class GeminiClient implements AiClient {
  readonly keyed: boolean
  private readonly sdk: GoogleGenAI | null
  private readonly log = new Logger('GeminiClient')

  constructor(private readonly apiKey: string) {
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
    const tools = [
      ...(request.webSearch ? [{ googleSearch: {} }] : []),
      ...(request.readPages ? [{ urlContext: {} }] : []),
    ]
    const deadline = Date.now() + limits.timeoutMs
    const uploaded: string[] = []
    try {
      const params: GenerateContentParameters = {
        model,
        contents: [{ role: 'user', parts: await this.sendable(request, deadline, uploaded) }],
        config: {
          systemInstruction: request.system,
          maxOutputTokens: limits.maxTokensOut,
          responseMimeType: 'application/json',
          responseJsonSchema: schema,
          /* Gemini 3 accepts the JSON schema beside search and URL context (preview). */
          ...(tools.length > 0 ? { tools } : {}),
          /* LOW, not MINIMAL: gemini-3.8-flash refuses MINIMAL with a 400. */
          thinkingConfig: { thinkingLevel: THINKING[request.effort ?? 'low'] },
          httpOptions: { timeout: timeLeft(deadline) },
        },
      }
      const spent = { ...NOTHING_SPENT }
      const answer = uploaded.length > 0 ? this.streamed(params, spent) : this.whole(params)
      return await answer.catch((error: unknown) => vendorError(error, spent))
    } finally {
      await this.discard(uploaded)
    }
  }

  private async whole(params: GenerateContentParameters): Promise<AiAnswer> {
    const response = await this.ready().models.generateContent(params)
    const usage = response.usageMetadata
    const finish = response.candidates?.[0]?.finishReason ?? 'unknown'
    const { tokensIn, tokensOut } = spentOf(usage ?? {})
    return { text: response.text, complete: finish === 'STOP', finish, tokensIn, tokensOut }
  }

  /** Node's fetch gives up after 300 s without response headers, and the SDK's
   *  `timeout` does not lift that on Node 22, so a whole answer that takes longer
   *  could never arrive. A stream sends headers at its first chunk. */
  private async streamed(params: GenerateContentParameters, spent: AiSpent): Promise<AiAnswer> {
    let text = ''
    let finish: string | undefined
    let usage: GenerateContentResponseUsageMetadata = {}
    for await (const chunk of await this.ready().models.generateContentStream(params)) {
      text += chunk.text ?? ''
      /* Field by field: a count missing from a chunk is not a zero. */
      usage = { ...usage, ...chunk.usageMetadata }
      Object.assign(spent, spentOf(usage))
      finish = chunk.candidates?.[0]?.finishReason ?? finish
    }
    /* A dropped connection: it must read as transient, not as a bad answer to retry. */
    if (!finish) throw new Error('stream ended with no finish reason')
    const { tokensIn, tokensOut } = spent
    return { text: text || undefined, complete: finish === 'STOP', finish, tokensIn, tokensOut }
  }

  /** The request's parts as the API takes them. `uploaded` gets each file's name
   *  as soon as it has one, so `generate` deletes a file whose wait failed too. */
  private async sendable(
    request: AiRequest,
    deadline: number,
    uploaded: string[],
  ): Promise<Part[]> {
    const parts: Part[] = []
    for (const part of request.parts) {
      parts.push(
        'recording' in part
          ? await this.upload(part.recording, deadline, uploaded)
          : inlinePart(part),
      )
    }
    return parts
  }

  private async upload(
    { mime, bytes }: { mime: string; bytes: Buffer },
    deadline: number,
    uploaded: string[],
  ): Promise<Part> {
    const file = await this.uploader(deadline)
      .files.upload({ file: new Blob([bytes], { type: mime }), config: { mimeType: mime } })
      .catch(vendorError)
    const { name, uri } = file
    if (!name || !uri) throw fileError('upload answered without a name')
    uploaded.push(name)
    await this.untilActive(name, file, deadline)
    return { fileData: { fileUri: uri, mimeType: mime } }
  }

  /** A client of its own, because `files.upload` takes no limit: it never reads
   *  `abortSignal`, and an `httpOptions` there replaces the resumable-upload
   *  headers (SDK 2.24). The limit rides this client's `fetch` instead. */
  private uploader(deadline: number): GoogleGenAI {
    this.ready()
    const bounded: typeof fetch = (url, init) =>
      fetch(url, { ...init, signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())) })
    return new GoogleGenAI({
      apiKey: this.apiKey,
      httpOptions: { retryOptions: { attempts: 1 }, fetch: bounded },
    })
  }

  private async untilActive(name: string, uploaded: VendorFile, deadline: number): Promise<void> {
    let state = uploaded.state
    while (state !== FileState.ACTIVE) {
      if (state === FileState.FAILED) throw fileError('processing failed')
      await new Promise((resolve) => setTimeout(resolve, FILE_POLL_MS))
      const config = { httpOptions: { timeout: timeLeft(deadline) } }
      state = (await this.ready().files.get({ name, config }).catch(vendorError)).state
    }
  }

  /** A failed delete costs nothing: the vendor expires the file by itself. */
  private async discard(names: readonly string[]): Promise<void> {
    const config = { httpOptions: { timeout: FILE_DELETE_TIMEOUT_MS } }
    for (const name of names) {
      await this.ready()
        .files.delete({ name, config })
        .catch((error: unknown) => {
          const kind = error instanceof Error ? error.name : 'unknown'
          this.log.warn(`uploaded file not deleted, it expires by itself (${kind})`)
        })
    }
  }

  /** The Developer API refuses `systemInstruction` on a count, so the system
   *  text is counted as a leading text part — close enough for a ceiling. */
  async countTokens(model: string, request: AiRequest, timeoutMs: number): Promise<number> {
    const response = await this.ready()
      .models.countTokens({
        model,
        contents: [{ role: 'user', parts: [{ text: request.system }, ...countable(request)] }],
        config: { httpOptions: { timeout: timeoutMs } },
      })
      .catch(vendorError)
    return response.totalTokens ?? 0
  }

  async converse(
    model: string,
    r: AiConverseRequest,
    limits: AiLimits & { signal: AbortSignal },
    onText: (delta: string) => void,
  ): Promise<AiRound> {
    const spent = { ...NOTHING_SPENT }
    return geminiRound(this.ready(), model, r, limits, onText, spent).catch((error: unknown) =>
      vendorError(error, spent),
    )
  }

  private ready(): GoogleGenAI {
    if (!this.sdk) throw new AiVendorError('vendor', 'gemini: GEMINI_API_KEY is not set')
    return this.sdk
  }
}

function inlinePart(part: Exclude<AiPart, { recording: unknown }>): Part {
  return 'text' in part
    ? { text: part.text }
    : { inlineData: { mimeType: part.file.mime, data: part.file.bytes.toString('base64') } }
}

/** A recording is counted only once uploaded, which a free count must not do. */
function countable(request: AiRequest): Part[] {
  return request.parts.map((part) => {
    if ('recording' in part) throw new AiVendorError('refused', 'gemini: cannot count a recording')
    return inlinePart(part)
  })
}

const fileError = (reason: string) =>
  new AiVendorError('transient', vendorMessage('gemini', 'file', reason))

/** What the deadline leaves of the attempt: the upload spends the call's own time. */
function timeLeft(deadline: number): number {
  const left = deadline - Date.now()
  if (left <= 0) throw fileError('no time left after the upload')
  return left
}

/** An `ApiError` carries the vendor's status; anything else is a timeout or a
 *  dropped connection, which another model may well survive. */
function vendorError(error: unknown, spent?: AiSpent): never {
  if (error instanceof AiVendorError) throw error
  if (error instanceof ApiError) {
    throw new AiVendorError(
      statusKind(error.status),
      vendorMessage('gemini', error.status, error.message),
      spent,
    )
  }
  const name = error instanceof Error ? error.name : 'unknown'
  throw new AiVendorError('transient', vendorMessage('gemini', name, plainReason(error)), spent)
}
