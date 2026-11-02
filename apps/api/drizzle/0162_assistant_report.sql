-- 0162 - `platform.assistant_report`: one press of "report a wrong answer" on one assistant
-- answer. One row per person per answer (UNIQUE), so a second press updates the row instead of
-- stacking duplicates. Both FKs cascade: a purged session takes its reports with it, and the
-- actor FK mirrors `assistant_message.actor_id`, where NO ACTION would refuse the delete before
-- the session's cascade reached the row. `AssistantReportReason` in @pv/contracts must carry
-- exactly these three reason values; widen both together.
-- No permission grant here: the seeder plants new permissions at boot.
-- Additive: a new table, no existing row is read or rewritten.
-- ORDER: migrate BEFORE deploy - the new api writes the table; the old api never names it.
-- Re-runnable: IF NOT EXISTS, DROP ... IF EXISTS before ADD. Hand-written for 0047's reason:
-- `generate`'s baseline is stuck at 0026.
-- The FKs take locks on `assistant_message` and `actor` that every writer queues behind: give
-- up after 10 s instead. Lasts to the migrator's commit (one transaction).
SET LOCAL lock_timeout = '10s';--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "platform"."assistant_report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"reason" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "platform"."assistant_report" DROP CONSTRAINT IF EXISTS "assistant_report_message_id_assistant_message_id_fk";--> statement-breakpoint
ALTER TABLE "platform"."assistant_report" ADD CONSTRAINT "assistant_report_message_id_assistant_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "platform"."assistant_message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."assistant_report" DROP CONSTRAINT IF EXISTS "assistant_report_actor_id_actor_id_fk";--> statement-breakpoint
ALTER TABLE "platform"."assistant_report" ADD CONSTRAINT "assistant_report_actor_id_actor_id_fk" FOREIGN KEY ("actor_id") REFERENCES "platform"."actor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "platform"."assistant_report" DROP CONSTRAINT IF EXISTS "assistant_report_message_actor_uq";--> statement-breakpoint
ALTER TABLE "platform"."assistant_report" ADD CONSTRAINT "assistant_report_message_actor_uq" UNIQUE ("message_id", "actor_id");--> statement-breakpoint
ALTER TABLE "platform"."assistant_report" DROP CONSTRAINT IF EXISTS "assistant_report_reason_known";--> statement-breakpoint
ALTER TABLE "platform"."assistant_report" ADD CONSTRAINT "assistant_report_reason_known" CHECK ("reason" IN ('wrong-figure', 'missing', 'off-target'));--> statement-breakpoint
ALTER TABLE "platform"."assistant_report" DROP CONSTRAINT IF EXISTS "assistant_report_note_length";--> statement-breakpoint
ALTER TABLE "platform"."assistant_report" ADD CONSTRAINT "assistant_report_note_length" CHECK ("note" IS NULL OR char_length("note") <= 500);--> statement-breakpoint

-- "Which answers were reported, newest first": the admin list.
CREATE INDEX IF NOT EXISTS "assistant_report_created_idx" ON "platform"."assistant_report" USING btree ("created_at" DESC);
