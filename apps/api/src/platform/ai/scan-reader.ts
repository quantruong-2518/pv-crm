import type { ScanExtraction, ScanUploadMime } from '@pv/contracts'

/** WHAT THE SCAN DOOR ASKS OF A MODEL — one file in, one `ScanExtraction` out.
 *
 *  A token and an interface so the Sales branch never learns which vendor
 *  reads its cards; `gemini.scan-reader.ts` is today's answer. Grouping by
 *  company and matching the book stay server rules — never the model's. */
export const SCAN_READER = Symbol('pv.ai.scan-reader')

export type ScanReadInput = { bytes: Buffer; mime: ScanUploadMime }
export type ScanReadResult = { extraction: ScanExtraction; tokensIn: number; tokensOut: number }

export interface ScanReader {
  /** False without `GEMINI_API_KEY`: the screen can say "not configured"
   *  before anyone uploads fifty files into a queue that cannot drain. */
  enabled: boolean
  read(input: ScanReadInput): Promise<ScanReadResult>
}

/** Not worth a retry — no key. */
export class ScanReaderDisabledError extends Error {
  constructor() {
    super('scan reader disabled: GEMINI_API_KEY is not set')
    this.name = 'ScanReaderDisabledError'
  }
}

/** No usable extraction, and retrying will not change that: the vendor
 *  refused the request (a 4xx other than 408/429 — too large, unsupported,
 *  bad key) or answered blocked, truncated or off-schema. Always final. */
export class ScanOutputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ScanOutputError'
  }
}
