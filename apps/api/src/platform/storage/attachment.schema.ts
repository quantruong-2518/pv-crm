import { check, index, integer, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { ScanUploadMime } from '@pv/contracts'
import { actor, platform } from '@api/platform/db/platform.schema'

/** One stored file — the metadata only; the bytes live in object storage.
 *
 *  A PLATFORM table although only a lead owns files today: the next owner
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
    mime: text('mime').$type<ScanUploadMime>().notNull(),
    /** `integer`: `SCAN_MAX_PDF_BYTES` is 25 MB, far under `int4`. */
    bytes: integer('bytes').notNull(),
    /** Lower-case hex of the ORIGINAL picked file, as the browser computed it. */
    sha256: text('sha256').notNull(),
    width: integer('width'),
    height: integer('height'),
    pages: integer('pages'),

    ownerKind: text('owner_kind').$type<'lead'>().notNull(),
    ownerCode: text('owner_code'),

    /** A real key: only a signed-in actor can open an upload, so the row exists. */
    createdBy: text('created_by')
      .notNull()
      .references(() => actor.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /** "Which files hang on lead X" — `GET /sales/leads/:code/attachments`. */
    index('attachment_owner_idx').on(t.ownerKind, t.ownerCode),

    /** `SCAN_UPLOAD_MIME`, copied by hand: images are re-encoded to WebP, or
     *  JPEG where WebKit cannot, so a presigned PUT is signed for these three. */
    check('attachment_mime_known', sql`"mime" IN ('image/webp', 'image/jpeg', 'application/pdf')`),
    /** One owner kind today; the next is a migration somebody reads. */
    check('attachment_owner_kind_known', sql`"owner_kind" IN ('lead')`),
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
