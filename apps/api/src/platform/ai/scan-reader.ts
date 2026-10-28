import type { ScanExtraction, ScanUploadMime } from '@pv/contracts'
import type { AiCaller } from './ai-gateway'

/** WHAT THE SCAN DOOR ASKS OF A MODEL — one file in, one `ScanExtraction` out.
 *
 *  A token and an interface so the Sales branch never learns which vendor
 *  reads its cards; `gateway.scan-reader.ts` is today's answer, over
 *  `AiGateway`. Failures are the gateway's three error classes. Grouping by
 *  company and matching the book stay server rules — never the model's. */
export const SCAN_READER = Symbol('pv.ai.scan-reader')

export type ScanReadInput = { bytes: Buffer; mime: ScanUploadMime; who: AiCaller }
/** `model` is the one that answered; tokens are summed over every attempt. */
export type ScanReadResult = {
  extraction: ScanExtraction
  model: string
  tokensIn: number
  tokensOut: number
}

export interface ScanReader {
  read(input: ScanReadInput): Promise<ScanReadResult>
}
