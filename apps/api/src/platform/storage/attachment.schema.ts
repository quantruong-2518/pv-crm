import { check, index, integer, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { CommAttachmentMime, ScanUploadMime } from '@pv/contracts'
import { actor, platform } from '@api/platform/db/platform.schema'

/** One stored file — the metadata only; the bytes live in object storage.
 *
 *  A PLATFORM table so a lead and a comm (0075) share it: the next owner
 *  (an opportunity's quotation, a contract scan) must not need a second
 *  table with the same eleven columns. `owner_kind` + `owner_code` is the
 *  polymorphic pair `touch.subject_code` argues for, and it has NO foreign key
 *  for the same reason — one column cannot point into two tables. The owner
 *  is written inside the transaction that writes the owner itself.
 *
 *  `owner_code` is NULL between upload and the commit that creates the lead;
 *  a file whose batch never commits stays NULL, which is what a sweeper reads. */
export const attachment = platform.table(
  'attachment',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** The object-store key. UNIQUE: two rows naming one object means deleting
     *  either one's bytes silently breaks the other. */
    storageKey: text('storage_key').notNull().unique('attachment_storage_key_unique'),
    /** Browser-made preview; NULL for a PDF the browser could not render. */
    thumbKey: text('thumb_key'),

    /** The name as picked on the user's disk — a label, not a key. */
    name: text('name').notNull(),
    /** Per owner kind, as `attachment_mime_known` below; readers narrow by kind. */
    mime: text('mime').$type<ScanUploadMime | CommAttachmentMime>().notNull(),
    /** `integer`: `SCAN_MAX_PDF_BYTES` is 25 MB, far under `int4`. */
    bytes: integer('bytes').notNull(),
    /** Lower-case hex of the ORIGINAL picked file, as the browser computed it. */
    sha256: text('sha256').notNull(),
    width: integer('width'),
    height: integer('height'),
    pages: integer('pages'),

    ownerKind: text('owner_kind').$type<'lead' | 'comm' | 'workstream'>().notNull(),
    /** Lead code for 'lead', debrief id for 'comm', WS- code for 'workstream'. */
    ownerCode: text('owner_code'),

    /** A real key: only a signed-in actor can open an upload, so the row exists. */
    createdBy: text('created_by')
      .notNull()
      .references(() => actor.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /** "Which files hang on lead X / comm Y" — each owner's attachment list. */
    index('attachment_owner_idx').on(t.ownerKind, t.ownerCode),

    /** Per owner kind, copied by hand. A lead keeps `SCAN_UPLOAD_MIME` (images
     *  re-encoded to WebP/JPEG, or a PDF); a comm also takes audio and transcripts. */
    check(
      'attachment_mime_known',
      sql`("owner_kind" = 'lead' AND "mime" IN ('image/webp', 'image/jpeg', 'application/pdf'))
          OR ("owner_kind" = 'workstream' AND "mime" IN ('image/webp', 'image/jpeg', 'image/png', 'application/pdf',
           'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'))
          OR ("owner_kind" = 'comm' AND "mime" IN ('audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/webm', 'audio/ogg',
           'image/png', 'image/jpeg', 'image/webp', 'application/pdf',
           'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'))`,
    ),
    /** Comm caps (audio 50 MB, rest 15 MB) held here too, so no writer skips
     *  them; a lead's bound lives in the contract only, as it did before 0075. */
    check(
      'attachment_comm_bytes_capped',
      sql`"owner_kind" <> 'comm'
          OR "bytes" <= CASE WHEN "mime" LIKE 'audio/%' THEN 52428800 ELSE 15728640 END`,
    ),
    /** 'comm' since 0075, 'workstream' since 0090; the next kind is a migration somebody reads. */
    check('attachment_owner_kind_known', sql`"owner_kind" IN ('lead', 'comm', 'workstream')`),
    check('attachment_sha256_hex', sql`"sha256" ~ '^[0-9a-f]{64}$'`),
    check('attachment_bytes_positive', sql`"bytes" > 0`),
    check(
      'attachment_dimensions_positive',
      sql`("width" IS NULL OR "width" > 0) AND ("height" IS NULL OR "height" > 0)
          AND ("pages" IS NULL OR "pages" > 0)`,
    ),
    /** Empty is NULL, never '' — the `lead_no_blank` convention. */
    check(
      'attachment_no_blank',
      sql`btrim("storage_key") <> '' AND btrim("thumb_key") <> '' AND btrim("name") <> ''
          AND "owner_code" <> ''`,
    ),
  ],
)

export type AttachmentRowDb = typeof attachment.$inferSelect
