import { ApiError, GoogleGenAI, ThinkingLevel } from '@google/genai'
import { ScanExtraction } from '@pv/contracts'
import { PDFDocument } from 'pdf-lib'
import { z } from 'zod'
import type { Env } from '../config/env'
import {
  ScanOutputError,
  ScanReaderDisabledError,
  type ScanReadInput,
  type ScanReadResult,
  type ScanReader,
} from './scan-reader'

/** Gemini behind `ScanReader`, tuned for cost: the lowest thinking level the model accepts, a bounded answer, and a PDF cut to the pages that name the
 *  company before a single token is paid for.
 *
 *  The response schema is DERIVED from the zod contract, never written beside
 *  it, and the answer is parsed by the same contract — the model's word that
 *  it followed the schema is not taken. Neither the answer nor the bytes are
 *  ever logged or put in an error: both are somebody's contact details.
 *
 *  Retries live in the SDK (`retryOptions`): one more attempt, with backoff,
 *  on 408/429/5xx. Any other 4xx becomes `ScanOutputError`, so the branch
 *  never reads a vendor's error shape. */

const SYSTEM_PROMPT = `You read ONE file: a photo of business cards (a front, a back, or a sheet holding several cards) or pages of a company profile, usually Vietnamese.
Return JSON that matches the schema.
- kind: what the file is. A photo holding several cards is CARD_SHEET.
- people: one entry per person; on a sheet, one per card. companyName is the company on that person's card.
- companies: every company the file describes. taxCode is the Vietnamese tax code (MST, "Mã số thuế"): 10 digits, or 13 written as 10 digits, a dash, 3 digits. Keep only digits and that dash.
- Copy text exactly as printed, keeping every Vietnamese diacritic. Do not translate, expand abbreviations or correct spelling.
- Never invent a value. Anything not printed is null, or an empty list.
- headcount is the text as printed (e.g. "200+"); province is the province or city in the address.
- unsure: paths of values you could not read with confidence, e.g. "people[0].email".`

/** A ceiling, not a price — only produced tokens are billed. 4096 cut a sheet
 *  of more than ~10 cards mid-JSON, a final failure; this fits a crowded
 *  sheet with thinking and still stops a runaway answer. */
const MAX_OUTPUT_TOKENS = 16_384
/** Per attempt. A six-page profile answers well inside it. */
const REQUEST_TIMEOUT_MS = 90_000
/** A profile names the company up front and its contacts at the back. */
const PDF_HEAD_PAGES = 4
const PDF_TAIL_PAGES = 2

/** `$schema` is dropped: the API documents the keywords it accepts, and the
 *  dialect marker is not among them. */
const RESPONSE_SCHEMA = { ...z.toJSONSchema(ScanExtraction), $schema: undefined }

export class GeminiScanReader implements ScanReader {
  readonly enabled: boolean
  private readonly client: GoogleGenAI | null

  constructor(private readonly env: Env) {
    this.enabled = env.GEMINI_API_KEY.length > 0
    this.client = this.enabled
      ? new GoogleGenAI({
          apiKey: env.GEMINI_API_KEY,
          httpOptions: {
            timeout: REQUEST_TIMEOUT_MS,
            retryOptions: { attempts: 2, initialDelay: 2 },
          },
        })
      : null
  }

  async read({ bytes, mime }: ScanReadInput): Promise<ScanReadResult> {
    if (!this.client) throw new ScanReaderDisabledError()

    const body = mime === 'application/pdf' ? await trimPdf(bytes) : bytes
    const response = await this.client.models
      .generateContent({
        model: this.env.SCAN_GEMINI_MODEL,
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType: mime, data: body.toString('base64') } },
              { text: 'Read this file.' },
            ],
          },
        ],
        config: {
          systemInstruction: SYSTEM_PROMPT,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          responseMimeType: 'application/json',
          responseJsonSchema: RESPONSE_SCHEMA,
          /* LOW, not MINIMAL: gemini-3.8-flash refuses MINIMAL with a 400. */
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      })
      .catch((error: unknown) => {
        throw refused(error)
          ? /* The vendor's reason names the request fault, never file content. */
            new ScanOutputError(
              `scan reader: vendor refused (${error.status}): ${error.message.slice(0, 200)}`,
            )
          : error
      })

    const usage = response.usageMetadata
    return {
      extraction: parse(response.text, response.candidates?.[0]?.finishReason),
      tokensIn: usage?.promptTokenCount ?? 0,
      /* Thinking is billed at the output rate, so it counts as output here. */
      tokensOut: (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0),
    }
  }
}

/** A 4xx the SDK did not retry: the same request gets the same refusal. */
function refused(error: unknown): error is ApiError {
  return (
    error instanceof ApiError &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 408 &&
    error.status !== 429
  )
}

function parse(text: string | undefined, finish: string | undefined): ScanExtraction {
  if (!text) throw new ScanOutputError(`scan reader: no answer (finish ${finish ?? 'unknown'})`)
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new ScanOutputError(`scan reader: answer is not JSON (finish ${finish ?? 'unknown'})`)
  }
  const parsed = ScanExtraction.safeParse(raw)
  if (!parsed.success) {
    throw new ScanOutputError(
      `scan reader: answer off-schema at ${parsed.error.issues[0]?.path.join('.')}`,
    )
  }
  return parsed.data
}

/** Pages 1–4 plus the last 2; a PDF that short goes as it came. */
async function trimPdf(bytes: Buffer): Promise<Buffer> {
  const source = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const count = source.getPageCount()
  if (count <= PDF_HEAD_PAGES + PDF_TAIL_PAGES) return bytes

  const keep = [
    ...Array.from({ length: PDF_HEAD_PAGES }, (_, i) => i),
    ...Array.from({ length: PDF_TAIL_PAGES }, (_, i) => count - PDF_TAIL_PAGES + i),
  ]
  const out = await PDFDocument.create()
  for (const page of await out.copyPages(source, keep)) out.addPage(page)
  return Buffer.from(await out.save())
}
