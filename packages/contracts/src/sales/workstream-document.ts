import { z } from 'zod'
import { ContractCode, ObjectCode, textInput } from '../primitives'

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
 *  mime list is the comm one plus GIF, Markdown, legacy Word and both Excel
 *  formats; the caps live here only — scan PDFs on the same table go up to
 *  25 MB. Declare takes an optional `step` and GET returns it on the row. */
export const WORKSTREAM_DOCUMENT_MIME = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/markdown',
  'audio/mpeg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/wav',
  'audio/webm',
  'audio/ogg',
] as const
export const WorkstreamDocumentMime = z.enum(
  WORKSTREAM_DOCUMENT_MIME,
  'Loại tệp này không nhận được.',
)

export const WORKSTREAM_DOCUMENT_MAX_BYTES = 5 * 1024 * 1024
/** A call recording runs long; the comm cap, so one file fits both doors. */
export const WORKSTREAM_RECORDING_MAX_BYTES = 50 * 1024 * 1024
export const workstreamDocumentCapOf = (mime: string) =>
  mime.startsWith('audio/') ? WORKSTREAM_RECORDING_MAX_BYTES : WORKSTREAM_DOCUMENT_MAX_BYTES

export const WorkstreamDocumentParams = z.object({ code: ObjectCode, documentId: z.uuid() })

/** Which step of the run a document belongs to (`sales.document_step`). Absent
 *  = a plain shelf document. The server checks the target is in THIS run. */
export const WorkstreamDocumentStep = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('quotation'), quotationId: z.uuid() }),
  z.object({ kind: z.literal('contract'), contractCode: ContractCode }),
  z.object({
    kind: z.literal('installment'),
    contractCode: ContractCode,
    installmentNo: z.number().int().positive(),
  }),
])

export const WorkstreamDocumentDeclareBody = z
  .object({
    name: textInput(255),
    mime: WorkstreamDocumentMime,
    bytes: z.number().int().positive('Tệp rỗng.'),
    sha256: z.string().regex(/^[0-9a-f]{64}$/, 'Tệp chưa đọc được. Chọn lại tệp.'),
    step: WorkstreamDocumentStep.optional(),
  })
  .refine((f) => f.bytes <= workstreamDocumentCapOf(f.mime), {
    message: 'Tệp quá lớn: ghi âm tối đa 50 MB, tệp khác tối đa 5 MB.',
    path: ['bytes'],
  })

export const WorkstreamDocumentDeclareResponse = z.object({ id: z.uuid(), putUrl: z.url() })

export type WorkstreamDocumentStep = z.infer<typeof WorkstreamDocumentStep>
export type WorkstreamDocumentMime = z.infer<typeof WorkstreamDocumentMime>
export type WorkstreamDocumentParams = z.infer<typeof WorkstreamDocumentParams>
export type WorkstreamDocumentDeclareBody = z.infer<typeof WorkstreamDocumentDeclareBody>
export type WorkstreamDocumentDeclareResponse = z.infer<typeof WorkstreamDocumentDeclareResponse>
