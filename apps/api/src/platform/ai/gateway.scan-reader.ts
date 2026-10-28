import { ScanExtraction } from '@pv/contracts'
import { PDFDocument } from 'pdf-lib'
import type { AiGateway } from './ai-gateway'
import { spentOf } from './ai-errors'
import type { ScanReadInput, ScanReadResult, ScanReader } from './scan-reader'

/** `ScanReader` over `AiGateway`: the prompt, and a PDF cut to the pages that
 *  name the company before a single token is paid for. Model, ceilings,
 *  fallback, retries and the ledger are the `lead-scan` route's business. */

const SYSTEM_PROMPT = `You read ONE file: a photo of business cards (a front, a back, or a sheet holding several cards) or pages of a company profile, usually Vietnamese.
Return JSON that matches the schema.
- kind: what the file is. A photo holding several cards is CARD_SHEET.
- people: one entry per person; on a sheet, one per card. companyName is the company on that person's card.
- companies: every company the file describes. taxCode is the Vietnamese tax code (MST, "Mã số thuế"): 10 digits, or 13 written as 10 digits, a dash, 3 digits. Keep only digits and that dash.
- Copy text exactly as printed, keeping every Vietnamese diacritic. Do not translate, expand abbreviations or correct spelling.
- Never invent a value. Anything not printed is null, or an empty list.
- headcount is the text as printed (e.g. "200+"); province is the province or city in the address.
- unsure: paths of values you could not read with confidence, e.g. "people[0].email".`

/** A profile names the company up front and its contacts at the back. */
const PDF_HEAD_PAGES = 4
const PDF_TAIL_PAGES = 2

export class GatewayScanReader implements ScanReader {
  constructor(private readonly gateway: AiGateway) {}

  async read({ bytes, mime, who }: ScanReadInput): Promise<ScanReadResult> {
    const body = mime === 'application/pdf' ? await trimPdf(bytes) : bytes
    const { value, model, attempts } = await this.gateway.run(
      'lead-scan',
      {
        system: SYSTEM_PROMPT,
        parts: [{ file: { mime, bytes: body } }, { text: 'Read this file.' }],
      },
      ScanExtraction,
      /* The batch passed `check` at upload; its queued reads always finish. */
      { ...who, admitted: true },
    )
    return { extraction: value, model, ...spentOf(attempts) }
  }
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
