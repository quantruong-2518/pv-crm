-- 0083 - a meeting hangs on a lead OR an opportunity, and says whether it was held.
--
-- `lead_code` becomes `subject_code`, keyed to `platform.object` like
-- `comms.debrief.subject_code`: since 0042 every LD and OP has its mirror row,
-- so the key refuses no legitimate write. Every existing row is an LD- code
-- whose lead already keys to `platform.object`, so the new key and the prefix
-- CHECK (copied from `next_step_subject_known`) both hold on history; the index
-- keeps its columns and only takes the new name.
--
-- `held_at` NULL = booked, not held - a mark, not a status column, the
-- `closed_at` convention. `attended` NULL = attendance not recorded yet, which is
-- every existing attendee row; no backfill, nobody measured it. Hand-written for
-- 0047's reason: `generate`'s baseline is still stuck at 0026.
ALTER TABLE "sales"."meeting" DROP CONSTRAINT "meeting_lead_code_lead_code_fk";--> statement-breakpoint
ALTER TABLE "sales"."meeting" DROP CONSTRAINT "meeting_no_blank";--> statement-breakpoint
ALTER TABLE "sales"."meeting" RENAME COLUMN "lead_code" TO "subject_code";--> statement-breakpoint
ALTER INDEX "sales"."meeting_lead_idx" RENAME TO "meeting_subject_idx";--> statement-breakpoint
ALTER TABLE "sales"."meeting" ADD CONSTRAINT "meeting_subject_code_object_code_fk" FOREIGN KEY ("subject_code") REFERENCES "platform"."object"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."meeting" ADD CONSTRAINT "meeting_no_blank" CHECK ("title" <> '' AND "by" <> '' AND "subject_code" <> '');--> statement-breakpoint
ALTER TABLE "sales"."meeting" ADD CONSTRAINT "meeting_subject_known" CHECK ("subject_code" ~ '^(LD|OP)-[0-9]{4,}$');--> statement-breakpoint
ALTER TABLE "sales"."meeting" ADD COLUMN "held_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sales"."meeting_attendee" ADD COLUMN "attended" boolean;
