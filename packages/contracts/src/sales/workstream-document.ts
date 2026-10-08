import { z } from 'zod'
import { ObjectCode, textInput } from '../primitives'

/** Documents of a workstream — one shelf every flow of the run reads (the
 *  lead, its deals, its contracts), so a file dropped on the lead is there
 *  when the deal opens.
 *
 *      GET    /sales/workstreams/:code/documents                   `workstream.view` · scoped
 *      POST   /sales/workstreams/:code/documents                   same · PUT URL
 *      POST   /sales/workstreams/:code/documents/:id/uploaded      same · after the PUT
 *      DELETE /sales/workstreams/:code/documents/:id               same · uploader only · 204
 *
 *  GET answers `LeadAttachmentsResponse` and also lists the scan sources of the
 *  run's leads (they carry a `batchCode`; only an upload can be deleted). The
 *  mime list is the comm one minus audio; the 5 MB cap lives here only —
 *  scan PDFs on the same table go up to 25 MB. */
export const WORKSTREAM_DOCUMENT_MIME = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
] as const
export const WorkstreamDocumentMime = z.enum(WORKSTREAM_DOCUMENT_MIME, 'Loại tệp không nhận')

export const WORKSTREAM_DOCUMENT_MAX_BYTES = 5 * 1024 * 1024

export const WorkstreamDocumentParams = z.object({ code: ObjectCode, documentId: z.uuid() })

export const WorkstreamDocumentDeclareBody = z.object({
  name: textInput(255),
  mime: WorkstreamDocumentMime,
  bytes: z.number().int().positive('Tệp rỗng').max(WORKSTREAM_DOCUMENT_MAX_BYTES, 'Tệp vượt 5 MB'),
  sha256: z.string().regex(/^[0-9a-f]{64}$/, 'sha256 sai dạng'),
})

export const WorkstreamDocumentDeclareResponse = z.object({ id: z.uuid(), putUrl: z.url() })

export type WorkstreamDocumentMime = z.infer<typeof WorkstreamDocumentMime>
export type WorkstreamDocumentParams = z.infer<typeof WorkstreamDocumentParams>
export type WorkstreamDocumentDeclareBody = z.infer<typeof WorkstreamDocumentDeclareBody>
export type WorkstreamDocumentDeclareResponse = z.infer<typeof WorkstreamDocumentDeclareResponse>
