import { z } from 'zod'
import { Moment, ObjectCode, textInput } from '../primitives'

/** Scan door — card photos and company-profile PDFs become leads.
 *
 *      POST /sales/leads/scan                 declare files, get upload URLs
 *      POST /sales/leads/scan/:code/start     read the files that uploaded
 *      GET  /sales/leads/scan/:code           progress, then the preview
 *      POST /sales/leads/scan/:code/commit    202; ONE button creates the leads
 *      GET  /sales/leads/:code/attachments    the source files, now on the lead
 *
 *  Bytes never ride the JSON: the browser PUTs them to presigned URLs, and
 *  the API carries metadata only (same stance as `OpportunityFile`). The AI
 *  reads ONE file into `ScanExtraction`; grouping per company, matching the
 *  book and the outcome of each group are server rules, never the model's.
 *  Motion is not sent: `EVENT` with a campaign, `OUTBOUND` without. */

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

export const SCAN_MAX_FILES = 50
/** Raw size as picked, BEFORE browser compression — a PDF is uploaded as-is. */
export const SCAN_MAX_RAW_BYTES = 25 * 1024 * 1024
export const SCAN_IMAGE_EDGE_PX = 2048
export const SCAN_THUMB_EDGE_PX = 320

/** What the picker accepts from the user's disk. */
export const SCAN_ACCEPT_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
] as const

/** What actually gets uploaded: images are re-encoded to WebP, or JPEG where
 *  the browser (WebKit) cannot encode WebP; thumbnails are always JPEG. */
export const SCAN_UPLOAD_MIME = ['image/webp', 'image/jpeg', 'application/pdf'] as const
export const ScanUploadMime = z.enum(SCAN_UPLOAD_MIME, 'Loại tệp không nhận')

// ---------------------------------------------------------------------------
// What the AI returns for ONE file — also the Gemini response schema, so
// objects, strings, string arrays, enums and nullable only.
// ---------------------------------------------------------------------------

/** `CARD_SHEET` is one photo holding several cards. */
export const ScanFileKind = z.enum([
  'BUSINESS_CARD',
  'CARD_BACK',
  'CARD_SHEET',
  'COMPANY_PROFILE',
  'OTHER',
])

export const ScanPerson = z.object({
  name: z.string().nullable(),
  title: z.string().nullable(),
  email: z.string().nullable(),
  phones: z.array(z.string()),
  companyName: z.string().nullable(),
})

export const ScanCompany = z.object({
  name: z.string().nullable(),
  legalName: z.string().nullable(),
  taxCode: z.string().nullable(),
  address: z.string().nullable(),
  province: z.string().nullable(),
  website: z.string().nullable(),
  /** Text, as printed (e.g. "200+" or a count with a unit word); the server parses it. */
  headcount: z.string().nullable(),
  phones: z.array(z.string()),
  emails: z.array(z.string()),
})

export const ScanExtraction = z.object({
  kind: ScanFileKind,
  people: z.array(ScanPerson),
  companies: z.array(ScanCompany),
  /** Paths the model is not confident about, e.g. `people[0].email`. */
  unsure: z.array(z.string()),
})

// ---------------------------------------------------------------------------
// Batch and file state
// ---------------------------------------------------------------------------

/** Mirrors the shape of other object codes (`PartnerCode`), with a month. */
export const ScanBatchCode = z.string().regex(/^SCN-\d{4}-\d{2,}$/, 'Mã lô quét sai dạng')

export const ScanFileId = z.string().min(1)

export const ScanBatchState = z.enum([
  'UPLOADING',
  'READING',
  'READY',
  'COMMITTING',
  'DONE',
  'FAILED',
])

/** `EMPTY` = read fine, but no lead in it — not an error. */
export const ScanFileState = z.enum(['QUEUED', 'READING', 'READ', 'EMPTY', 'FAILED'])

export const ScanFile = z.object({
  id: ScanFileId,
  name: z.string(),
  mime: ScanUploadMime,
  bytes: z.number().int().nonnegative(),
  kind: ScanFileKind.nullable(),
  state: ScanFileState,
  /** Short result line for the row (e.g. a people count); null until read. */
  note: z.string().nullable(),
  error: z.string().nullable(),
  /** Short-lived link to the uploaded file, from the preview on — so a field can open its source. */
  url: z.string().optional(),
})

// ---------------------------------------------------------------------------
// POST /sales/leads/scan
// ---------------------------------------------------------------------------

const dimension = z.number().int().positive()

export const ScanFileDeclared = z.object({
  name: textInput(255),
  mime: ScanUploadMime,
  bytes: z
    .number()
    .int()
    .positive('Tệp rỗng')
    .max(SCAN_MAX_RAW_BYTES, `Tệp lớn hơn ${SCAN_MAX_RAW_BYTES / 1024 / 1024} MB`),
  /** Lower-case hex of the ORIGINAL picked bytes — stable across browsers, so it keys both in-batch dedupe and the read cache. */
  sha256: z.string().regex(/^[0-9a-f]{64}$/, 'sha256 sai dạng'),
  width: dimension.optional(),
  height: dimension.optional(),
  pages: dimension.optional(),
  hasThumb: z.boolean(),
  /** Size of the thumbnail body — a presigned PUT binds its exact length. */
  thumbBytes: z.number().int().positive().max(SCAN_MAX_RAW_BYTES).optional(),
})

export const LeadScanCreateBody = z.object({
  campaignCode: ObjectCode.optional(),
  files: z
    .array(ScanFileDeclared)
    .min(1, 'Chưa chọn tệp nào')
    .max(SCAN_MAX_FILES, `Một lô tối đa ${SCAN_MAX_FILES} tệp`),
})

/** One entry per declared file, in body order. A repeat sha256 gets no URL:
 *  the server drops it and names the file it repeats. */
export const ScanUploadSlot = z.union([
  z.object({ id: ScanFileId, putUrl: z.url(), thumbPutUrl: z.url().nullable() }),
  z.object({ duplicateOf: ScanFileId }),
])

export const LeadScanCreateResponse = z.object({
  code: ScanBatchCode,
  files: z.array(ScanUploadSlot),
})

// ---------------------------------------------------------------------------
// POST :code/start · POST :code/commit — both answer 202 with the code
// ---------------------------------------------------------------------------

export const LeadScanParams = z.object({ code: ScanBatchCode })

/** Only files whose PUT succeeded; the rest stay out of the batch. */
export const LeadScanStartBody = z.object({
  files: z.array(ScanFileId).min(1, 'Chưa tệp nào tải lên xong').max(SCAN_MAX_FILES),
})

const accepted = z.object({ code: ScanBatchCode })
export const LeadScanStartResponse = accepted
export const LeadScanCommitResponse = accepted

// ---------------------------------------------------------------------------
// GET /sales/leads/scan/:code
// ---------------------------------------------------------------------------

export const ScanConfidence = z.enum(['SURE', 'INFERRED', 'CONFLICT'])

export const ScanOutcome = z.enum([
  'NEW_LEAD',
  'MERGE_INTO_LEAD',
  'HELD_MISSING_CONTACT',
  'HELD_OTHER_OWNER',
])

export const ScanGroupField = z.object({
  field: z.string(),
  value: z.string(),
  /** The second, conflicting reading — set when `confidence` is `CONFLICT`. */
  alt: z.string().nullable(),
  /** File name, or a place inside one (e.g. a profile page number). */
  fromFile: z.string(),
  confidence: ScanConfidence,
})

const groupBase = {
  key: z.string(),
  company: z.string(),
  /** Province, or a profile-only label when no card backs the company. */
  meta: z.string(),
  people: z.array(
    z.object({ name: z.string(), title: z.string().nullable(), email: z.string().nullable() }),
  ),
  fields: z.array(ScanGroupField),
}

/** Split on `outcome` so only a merge can carry `leadCode`: a match outside
 *  the uploader's scope must not leak a code, and parsing strips one. */
export const ScanGroup = z.discriminatedUnion('outcome', [
  z.object({ ...groupBase, outcome: z.literal('MERGE_INTO_LEAD'), leadCode: ObjectCode }),
  z.object({ ...groupBase, outcome: ScanOutcome.exclude(['MERGE_INTO_LEAD']) }),
])

const count = z.number().int().nonnegative()

export const ScanPreview = z.object({
  totals: z.object({ accounts: count, contacts: count, leadsToCreate: count }),
  groups: z.array(ScanGroup),
  skipped: z.object({ noLead: count, unreadable: count }),
})

/** Codes, not counts, so the done screen can link to what it wrote. Held
 *  groups have no lead yet, so they are only counted. */
export const ScanResult = z.object({
  created: z.array(ObjectCode),
  mergedInto: z.array(ObjectCode),
  held: count,
})

export const LeadScanResponse = z.object({
  code: ScanBatchCode,
  state: ScanBatchState,
  campaignCode: ObjectCode.nullable(),
  files: z.array(ScanFile),
  /** `read` counts `READ` and `EMPTY` alike — both are finished. */
  counts: z.object({ read: count, reading: count, queued: count, failed: count }),
  /** Present from `READY` on. */
  preview: ScanPreview.optional(),
  /** Present at `DONE`. */
  result: ScanResult.optional(),
})

// ---------------------------------------------------------------------------
// GET /sales/leads/:code/attachments — generic, owned by a lead for now
// ---------------------------------------------------------------------------

export const LeadAttachmentsParams = z.object({ code: ObjectCode })

export const LeadAttachment = z.object({
  id: z.string().min(1),
  name: z.string(),
  mime: z.string().min(1),
  bytes: z.number().int().nonnegative(),
  width: dimension.optional(),
  height: dimension.optional(),
  pages: dimension.optional(),
  /** Short-lived presigned GET — re-read the list rather than store it. */
  url: z.url(),
  thumbUrl: z.url().nullable(),
  createdAt: Moment,
  /** id compares, name prints — the `ownerId`/`ownerName` rule. */
  createdBy: z.object({ id: z.string().min(1), name: z.string().min(1) }),
  batchCode: ScanBatchCode.nullable(),
})

export const LeadAttachmentsResponse = z.object({ rows: z.array(LeadAttachment) })

export type ScanUploadMime = z.infer<typeof ScanUploadMime>
export type ScanFileKind = z.infer<typeof ScanFileKind>
export type ScanPerson = z.infer<typeof ScanPerson>
export type ScanCompany = z.infer<typeof ScanCompany>
export type ScanExtraction = z.infer<typeof ScanExtraction>
export type ScanBatchState = z.infer<typeof ScanBatchState>
export type ScanFileState = z.infer<typeof ScanFileState>
export type ScanFile = z.infer<typeof ScanFile>
export type ScanFileDeclared = z.infer<typeof ScanFileDeclared>
export type LeadScanCreateBody = z.infer<typeof LeadScanCreateBody>
export type ScanUploadSlot = z.infer<typeof ScanUploadSlot>
export type LeadScanCreateResponse = z.infer<typeof LeadScanCreateResponse>
export type LeadScanParams = z.infer<typeof LeadScanParams>
export type LeadScanStartBody = z.infer<typeof LeadScanStartBody>
export type LeadScanStartResponse = z.infer<typeof LeadScanStartResponse>
export type LeadScanCommitResponse = z.infer<typeof LeadScanCommitResponse>
export type ScanConfidence = z.infer<typeof ScanConfidence>
export type ScanOutcome = z.infer<typeof ScanOutcome>
export type ScanGroupField = z.infer<typeof ScanGroupField>
export type ScanGroup = z.infer<typeof ScanGroup>
export type ScanPreview = z.infer<typeof ScanPreview>
export type ScanResult = z.infer<typeof ScanResult>
export type LeadScanResponse = z.infer<typeof LeadScanResponse>
export type LeadAttachmentsParams = z.infer<typeof LeadAttachmentsParams>
export type LeadAttachment = z.infer<typeof LeadAttachment>
export type LeadAttachmentsResponse = z.infer<typeof LeadAttachmentsResponse>
