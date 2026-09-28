-- 0063 - the lead scan door: card photos and company PDFs become leads.
--
-- `platform.attachment` is the generic file record (bytes live in object
-- storage). One owner kind today, 'lead'; `owner_code` has no FK because one
-- column cannot point into two tables (`touch.subject_code`'s reasoning).
-- `sales.scan_batch` / `sales.scan_file` are the working set of one upload.
-- Every enum CHECK is copied by hand from `lead-scan.ts` in `@pv/contracts`:
-- the day one grows, that has to be a migration a person reads.
--
-- Hand-written for 0047-0062's reason: `generate`'s baseline is stuck at 0026.
CREATE TABLE "platform"."attachment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storage_key" text NOT NULL,
	"thumb_key" text,
	"name" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"width" integer,
	"height" integer,
	"pages" integer,
	"owner_kind" text NOT NULL,
	"owner_code" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attachment_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "attachment_mime_known" CHECK ("mime" IN ('image/webp', 'image/jpeg', 'application/pdf')),
	CONSTRAINT "attachment_owner_kind_known" CHECK ("owner_kind" IN ('lead')),
	CONSTRAINT "attachment_sha256_hex" CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "attachment_bytes_positive" CHECK ("bytes" > 0),
	CONSTRAINT "attachment_dimensions_positive" CHECK (("width" IS NULL OR "width" > 0) AND ("height" IS NULL OR "height" > 0)
          AND ("pages" IS NULL OR "pages" > 0)),
	CONSTRAINT "attachment_no_blank" CHECK (btrim("storage_key") <> '' AND btrim("thumb_key") <> '' AND btrim("name") <> ''
          AND "owner_code" <> '')
);
--> statement-breakpoint
ALTER TABLE "platform"."attachment" ADD CONSTRAINT "attachment_created_by_actor_id_fk" FOREIGN KEY ("created_by") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachment_owner_idx" ON "platform"."attachment" USING btree ("owner_kind","owner_code");--> statement-breakpoint

CREATE SEQUENCE "sales"."scan_batch_code_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "sales"."scan_batch" (
	"code" text PRIMARY KEY NOT NULL,
	"state" text DEFAULT 'UPLOADING' NOT NULL,
	"campaign_code" text,
	"motion" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"committed_at" timestamp with time zone,
	"result" jsonb,
	"error" text,
	CONSTRAINT "scan_batch_code_shape" CHECK ("code" ~ '^SCN-[0-9]{4}-[0-9]{2,}$'),
	CONSTRAINT "scan_batch_state_known" CHECK ("state" IN ('UPLOADING', 'READING', 'READY', 'COMMITTING', 'DONE', 'FAILED')),
	CONSTRAINT "scan_batch_motion_known" CHECK ("motion" IN ('EVENT', 'OUTBOUND')),
	CONSTRAINT "scan_batch_motion_matches_campaign" CHECK (("motion" = 'EVENT') = ("campaign_code" IS NOT NULL)),
	CONSTRAINT "scan_batch_done_has_result" CHECK ("state" <> 'DONE' OR "result" IS NOT NULL),
	CONSTRAINT "scan_batch_failed_has_error" CHECK ("state" <> 'FAILED' OR "error" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "sales"."scan_batch" ADD CONSTRAINT "scan_batch_campaign_code_campaign_code_fk" FOREIGN KEY ("campaign_code") REFERENCES "sales"."campaign"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."scan_batch" ADD CONSTRAINT "scan_batch_created_by_actor_id_fk" FOREIGN KEY ("created_by") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scan_batch_creator_idx" ON "sales"."scan_batch" USING btree ("created_by","created_at" DESC NULLS LAST);--> statement-breakpoint

CREATE TABLE "sales"."scan_file" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_code" text NOT NULL,
	"attachment_id" uuid NOT NULL,
	"sha256" text NOT NULL,
	"state" text DEFAULT 'QUEUED' NOT NULL,
	"kind" text,
	"extraction" jsonb,
	"note" text,
	"error" text,
	"tokens_in" integer,
	"tokens_out" integer,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scan_file_batch_sha256_unique" UNIQUE("batch_code","sha256"),
	CONSTRAINT "scan_file_attachment_unique" UNIQUE("attachment_id"),
	CONSTRAINT "scan_file_sha256_hex" CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "scan_file_state_known" CHECK ("state" IN ('QUEUED', 'READING', 'READ', 'EMPTY', 'FAILED')),
	CONSTRAINT "scan_file_kind_known" CHECK ("kind" IN ('BUSINESS_CARD', 'CARD_BACK', 'CARD_SHEET', 'COMPANY_PROFILE', 'OTHER')),
	CONSTRAINT "scan_file_read_has_extraction" CHECK ("state" <> 'READ' OR "extraction" IS NOT NULL),
	CONSTRAINT "scan_file_failed_has_error" CHECK ("state" <> 'FAILED' OR "error" IS NOT NULL),
	CONSTRAINT "scan_file_tokens_nonneg" CHECK (("tokens_in" IS NULL OR "tokens_in" >= 0) AND ("tokens_out" IS NULL OR "tokens_out" >= 0))
);
--> statement-breakpoint
ALTER TABLE "sales"."scan_file" ADD CONSTRAINT "scan_file_batch_code_scan_batch_code_fk" FOREIGN KEY ("batch_code") REFERENCES "sales"."scan_batch"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."scan_file" ADD CONSTRAINT "scan_file_attachment_id_attachment_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "platform"."attachment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scan_file_sha256_idx" ON "sales"."scan_file" USING btree ("sha256");
