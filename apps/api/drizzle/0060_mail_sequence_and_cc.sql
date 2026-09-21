-- 0060 - reusable mail sequences outside campaigns, explicit wave phases,
-- and snapshotted internal CC recipients.
--
-- Hand-written while drizzle-kit's baseline snapshot remains behind the live
-- migration chain (same reason as 0047-0059).
CREATE TABLE "sales"."mail_sequence" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"destination_type" text NOT NULL,
	"audience_fingerprint" text NOT NULL,
	"audience_count" integer NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mail_sequence_destination_type_known" CHECK ("destination_type" IN ('lead', 'opportunity')),
	CONSTRAINT "mail_sequence_audience_count_nonneg" CHECK ("audience_count" >= 0),
	CONSTRAINT "mail_sequence_no_blank" CHECK (btrim("name") <> '' AND btrim("audience_fingerprint") <> '')
);--> statement-breakpoint
ALTER TABLE "platform"."mail_run" ADD COLUMN "cc_addresses" text[] DEFAULT ARRAY[]::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "platform"."mail_run" ADD CONSTRAINT "mail_run_cc_addresses_known" CHECK ("cc_addresses" <@ ARRAY['contact@pebblevina.com', 'sales@pebblevina.co']::text[]);--> statement-breakpoint
ALTER TABLE "sales"."mail_sequence_run" ADD COLUMN "phase" text;--> statement-breakpoint
UPDATE "sales"."mail_sequence_run" AS sequence_run
SET "phase" = COALESCE(NULLIF(btrim(run."label"), ''), 'Đợt ' || sequence_run."wave_no")
FROM "platform"."mail_run" AS run
WHERE run."id" = sequence_run."mail_run_id";--> statement-breakpoint
ALTER TABLE "sales"."mail_sequence_run" ALTER COLUMN "phase" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sales"."mail_sequence_run" DROP CONSTRAINT "mail_sequence_run_subject_type_known";--> statement-breakpoint
ALTER TABLE "sales"."mail_sequence_run" ADD CONSTRAINT "mail_sequence_run_subject_type_known" CHECK ("subject_type" IN ('lead', 'opportunity', 'campaign', 'sequence'));--> statement-breakpoint
ALTER TABLE "sales"."mail_sequence_run" ADD CONSTRAINT "mail_sequence_run_phase_no_blank" CHECK (btrim("phase") <> '');
