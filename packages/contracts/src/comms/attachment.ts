import { z } from 'zod'
import { textInput } from '../primitives'
import { LeadAttachment } from '../sales/lead-scan'
import { DebriefId } from './thread'

/** Files on a comm record — recording, transcript, minutes, chat screenshots (ADR 0075 §4).
 *
 *      GET    /comms/debriefs/:id/attachments                    `comm.view` + reach
 *      POST   /comms/debriefs/:id/attachments                    owner, record not done · PUT URL
 *      POST   /comms/debriefs/:id/attachments/:attachmentId/uploaded   owner · after the PUT
 *      DELETE /comms/debriefs/:id/attachments/:attachmentId      owner, record not done · 204
 *
 *  Bytes go to a presigned PUT signed like lead-scan (echo `SCAN_PUT_HEADERS`).
 *  `uploaded` exists because a declared file whose PUT failed must not flip the
 *  record out of `empty`. The mime list and both caps are also CHECKs on
 *  `platform.attachment` (migration 0075). */

export const COMM_ATTACHMENT_MIME = [
  'audio/mpeg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/wav',
  'audio/webm',
  'audio/ogg',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
] as const
export const CommAttachmentMime = z.enum(COMM_ATTACHMENT_MIME, 'Loại tệp không nhận')

export const COMM_MAX_AUDIO_BYTES = 50 * 1024 * 1024
export const COMM_MAX_FILE_BYTES = 15 * 1024 * 1024

export const CommAttachmentParams = z.object({ id: DebriefId, attachmentId: z.uuid() })

export const CommAttachmentDeclareBody = z
  .object({
    name: textInput(255),
    mime: CommAttachmentMime,
    bytes: z.number().int().positive('Tệp rỗng'),
    sha256: z.string().regex(/^[0-9a-f]{64}$/, 'sha256 sai dạng'),
  })
  .refine(
    (f) => f.bytes <= (f.mime.startsWith('audio/') ? COMM_MAX_AUDIO_BYTES : COMM_MAX_FILE_BYTES),
    { message: 'Tệp vượt dung lượng cho phép', path: ['bytes'] },
  )

export const CommAttachmentDeclareResponse = z.object({ id: z.uuid(), putUrl: z.url() })

/** Lead files' read shape minus what only a scan writes (thumb, dimensions, batch).
 *  A recording is content, so `url` is null for a reader without
 *  `comm.view-content` — the cut `MessageContent` makes on a body. */
export const CommAttachment = LeadAttachment.pick({
  id: true,
  name: true,
  bytes: true,
  createdAt: true,
  createdBy: true,
}).extend({ mime: CommAttachmentMime, url: z.url().nullable() })

export const CommAttachmentsResponse = z.object({ rows: z.array(CommAttachment) })

export type CommAttachmentMime = z.infer<typeof CommAttachmentMime>
export type CommAttachmentParams = z.infer<typeof CommAttachmentParams>
export type CommAttachmentDeclareBody = z.infer<typeof CommAttachmentDeclareBody>
export type CommAttachmentDeclareResponse = z.infer<typeof CommAttachmentDeclareResponse>
export type CommAttachment = z.infer<typeof CommAttachment>
export type CommAttachmentsResponse = z.infer<typeof CommAttachmentsResponse>
