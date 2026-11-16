-- 0170 - KPI wave 4 (ADR 0158): weekly forecast commits, unit commits, the monthly 1:1 with its
-- actions, one bell kind, `kpi-one-on-one`, three `kpi.score.*` setting keys (setting_key_known rebuilt
-- from 0143's list) and `kpi_month_close.score_basis`. Every `period` is a calendar month `YYYY-MM`
-- from 2026-12 on; a commit's `period` must equal its Monday's month. Money is whole dong.
-- `unit_id` has no FK, like `kpi_assignment.unit_id`. The two bell CHECK lists are the 0166 lists
-- plus `kpi-one-on-one`, and also `assistant-brief`: sibling branch's 0169 adds it, so listing it
-- here keeps the CHECK whole whichever of the two migrates first.
-- Additive. ORDER: migrate BEFORE deploy - the old api never reads these. Re-runnable: IF NOT
-- EXISTS, DROP ... IF EXISTS before ADD. Hand-written for 0047's reason.
-- The CHECK rebuild locks `platform.notification` (full scan to validate): give up after 10 s.
SET LOCAL lock_timeout = '10s';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sales"."kpi_forecast_commit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period" text NOT NULL,
	"week_start" date NOT NULL,
	"actor_id" text NOT NULL,
	"amount" bigint NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kpi_forecast_commit_actor_week_uq" UNIQUE("actor_id","week_start")
);--> statement-breakpoint
ALTER TABLE "sales"."kpi_forecast_commit" DROP CONSTRAINT IF EXISTS "kpi_forecast_commit_actor_id_actor_id_fk";--> statement-breakpoint
ALTER TABLE "sales"."kpi_forecast_commit" ADD CONSTRAINT "kpi_forecast_commit_actor_id_actor_id_fk" FOREIGN KEY ("actor_id") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."kpi_forecast_commit" DROP CONSTRAINT IF EXISTS "kpi_forecast_commit_period_shape";--> statement-breakpoint
ALTER TABLE "sales"."kpi_forecast_commit" ADD CONSTRAINT "kpi_forecast_commit_period_shape" CHECK ("period" ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$');--> statement-breakpoint
ALTER TABLE "sales"."kpi_forecast_commit" DROP CONSTRAINT IF EXISTS "kpi_forecast_commit_week_monday";--> statement-breakpoint
ALTER TABLE "sales"."kpi_forecast_commit" ADD CONSTRAINT "kpi_forecast_commit_week_monday" CHECK (extract(isodow from "week_start") = 1);--> statement-breakpoint
ALTER TABLE "sales"."kpi_forecast_commit" DROP CONSTRAINT IF EXISTS "kpi_forecast_commit_period_matches_week";--> statement-breakpoint
ALTER TABLE "sales"."kpi_forecast_commit" ADD CONSTRAINT "kpi_forecast_commit_period_matches_week" CHECK ("period" = to_char("week_start", 'YYYY-MM'));--> statement-breakpoint
ALTER TABLE "sales"."kpi_forecast_commit" DROP CONSTRAINT IF EXISTS "kpi_forecast_commit_period_from";--> statement-breakpoint
ALTER TABLE "sales"."kpi_forecast_commit" ADD CONSTRAINT "kpi_forecast_commit_period_from" CHECK ("period" >= '2026-12');--> statement-breakpoint
ALTER TABLE "sales"."kpi_forecast_commit" DROP CONSTRAINT IF EXISTS "kpi_forecast_commit_amount_nonneg";--> statement-breakpoint
ALTER TABLE "sales"."kpi_forecast_commit" ADD CONSTRAINT "kpi_forecast_commit_amount_nonneg" CHECK ("amount" >= 0);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sales"."kpi_forecast_commit_line" (
	"commit_id" uuid NOT NULL,
	"opportunity_code" text NOT NULL,
	"value" bigint NOT NULL,
	CONSTRAINT "kpi_forecast_commit_line_commit_id_opportunity_code_pk" PRIMARY KEY("commit_id","opportunity_code")
);--> statement-breakpoint
ALTER TABLE "sales"."kpi_forecast_commit_line" DROP CONSTRAINT IF EXISTS "kpi_forecast_commit_line_commit_id_kpi_forecast_commit_id_fk";--> statement-breakpoint
ALTER TABLE "sales"."kpi_forecast_commit_line" ADD CONSTRAINT "kpi_forecast_commit_line_commit_id_kpi_forecast_commit_id_fk" FOREIGN KEY ("commit_id") REFERENCES "sales"."kpi_forecast_commit"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."kpi_forecast_commit_line" DROP CONSTRAINT IF EXISTS "kpi_forecast_commit_line_opportunity_code_opportunity_code_fk";--> statement-breakpoint
ALTER TABLE "sales"."kpi_forecast_commit_line" ADD CONSTRAINT "kpi_forecast_commit_line_opportunity_code_opportunity_code_fk" FOREIGN KEY ("opportunity_code") REFERENCES "sales"."opportunity"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."kpi_forecast_commit_line" DROP CONSTRAINT IF EXISTS "kpi_forecast_commit_line_value_nonneg";--> statement-breakpoint
ALTER TABLE "sales"."kpi_forecast_commit_line" ADD CONSTRAINT "kpi_forecast_commit_line_value_nonneg" CHECK ("value" >= 0);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sales"."kpi_unit_commit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period" text NOT NULL,
	"week_start" date NOT NULL,
	"unit_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"committed_by" text NOT NULL,
	"committed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kpi_unit_commit_unit_week_uq" UNIQUE("unit_id","week_start")
);--> statement-breakpoint
ALTER TABLE "sales"."kpi_unit_commit" DROP CONSTRAINT IF EXISTS "kpi_unit_commit_committed_by_actor_id_fk";--> statement-breakpoint
ALTER TABLE "sales"."kpi_unit_commit" ADD CONSTRAINT "kpi_unit_commit_committed_by_actor_id_fk" FOREIGN KEY ("committed_by") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."kpi_unit_commit" DROP CONSTRAINT IF EXISTS "kpi_unit_commit_period_shape";--> statement-breakpoint
ALTER TABLE "sales"."kpi_unit_commit" ADD CONSTRAINT "kpi_unit_commit_period_shape" CHECK ("period" ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$');--> statement-breakpoint
ALTER TABLE "sales"."kpi_unit_commit" DROP CONSTRAINT IF EXISTS "kpi_unit_commit_week_monday";--> statement-breakpoint
ALTER TABLE "sales"."kpi_unit_commit" ADD CONSTRAINT "kpi_unit_commit_week_monday" CHECK (extract(isodow from "week_start") = 1);--> statement-breakpoint
ALTER TABLE "sales"."kpi_unit_commit" DROP CONSTRAINT IF EXISTS "kpi_unit_commit_period_matches_week";--> statement-breakpoint
ALTER TABLE "sales"."kpi_unit_commit" ADD CONSTRAINT "kpi_unit_commit_period_matches_week" CHECK ("period" = to_char("week_start", 'YYYY-MM'));--> statement-breakpoint
ALTER TABLE "sales"."kpi_unit_commit" DROP CONSTRAINT IF EXISTS "kpi_unit_commit_period_from";--> statement-breakpoint
ALTER TABLE "sales"."kpi_unit_commit" ADD CONSTRAINT "kpi_unit_commit_period_from" CHECK ("period" >= '2026-12');--> statement-breakpoint
ALTER TABLE "sales"."kpi_unit_commit" DROP CONSTRAINT IF EXISTS "kpi_unit_commit_amount_nonneg";--> statement-breakpoint
ALTER TABLE "sales"."kpi_unit_commit" ADD CONSTRAINT "kpi_unit_commit_amount_nonneg" CHECK ("amount" >= 0);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sales"."kpi_one_on_one" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period" text NOT NULL,
	"actor_id" text NOT NULL,
	"writer_id" text NOT NULL,
	"note" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acknowledged_at" timestamp with time zone,
	CONSTRAINT "kpi_one_on_one_period_actor_uq" UNIQUE("period","actor_id")
);--> statement-breakpoint
ALTER TABLE "sales"."kpi_one_on_one" DROP CONSTRAINT IF EXISTS "kpi_one_on_one_actor_id_actor_id_fk";--> statement-breakpoint
ALTER TABLE "sales"."kpi_one_on_one" ADD CONSTRAINT "kpi_one_on_one_actor_id_actor_id_fk" FOREIGN KEY ("actor_id") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."kpi_one_on_one" DROP CONSTRAINT IF EXISTS "kpi_one_on_one_writer_id_actor_id_fk";--> statement-breakpoint
ALTER TABLE "sales"."kpi_one_on_one" ADD CONSTRAINT "kpi_one_on_one_writer_id_actor_id_fk" FOREIGN KEY ("writer_id") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."kpi_one_on_one" DROP CONSTRAINT IF EXISTS "kpi_one_on_one_period_shape";--> statement-breakpoint
ALTER TABLE "sales"."kpi_one_on_one" ADD CONSTRAINT "kpi_one_on_one_period_shape" CHECK ("period" ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$');--> statement-breakpoint
ALTER TABLE "sales"."kpi_one_on_one" DROP CONSTRAINT IF EXISTS "kpi_one_on_one_period_from";--> statement-breakpoint
ALTER TABLE "sales"."kpi_one_on_one" ADD CONSTRAINT "kpi_one_on_one_period_from" CHECK ("period" >= '2026-12');--> statement-breakpoint
ALTER TABLE "sales"."kpi_one_on_one" DROP CONSTRAINT IF EXISTS "kpi_one_on_one_note_length";--> statement-breakpoint
ALTER TABLE "sales"."kpi_one_on_one" ADD CONSTRAINT "kpi_one_on_one_note_length" CHECK (char_length("note") BETWEEN 1 AND 2000);--> statement-breakpoint
ALTER TABLE "sales"."kpi_one_on_one" DROP CONSTRAINT IF EXISTS "kpi_one_on_one_not_self";--> statement-breakpoint
ALTER TABLE "sales"."kpi_one_on_one" ADD CONSTRAINT "kpi_one_on_one_not_self" CHECK ("writer_id" <> "actor_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sales"."kpi_one_on_one_action" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"one_on_one_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"text" text NOT NULL,
	"due" date NOT NULL,
	"done_at" timestamp with time zone,
	"done_by" text,
	CONSTRAINT "kpi_one_on_one_action_position_uq" UNIQUE("one_on_one_id","position")
);--> statement-breakpoint
ALTER TABLE "sales"."kpi_one_on_one_action" DROP CONSTRAINT IF EXISTS "kpi_one_on_one_action_one_on_one_id_kpi_one_on_one_id_fk";--> statement-breakpoint
ALTER TABLE "sales"."kpi_one_on_one_action" ADD CONSTRAINT "kpi_one_on_one_action_one_on_one_id_kpi_one_on_one_id_fk" FOREIGN KEY ("one_on_one_id") REFERENCES "sales"."kpi_one_on_one"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."kpi_one_on_one_action" DROP CONSTRAINT IF EXISTS "kpi_one_on_one_action_done_by_actor_id_fk";--> statement-breakpoint
ALTER TABLE "sales"."kpi_one_on_one_action" ADD CONSTRAINT "kpi_one_on_one_action_done_by_actor_id_fk" FOREIGN KEY ("done_by") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."kpi_one_on_one_action" DROP CONSTRAINT IF EXISTS "kpi_one_on_one_action_position_range";--> statement-breakpoint
ALTER TABLE "sales"."kpi_one_on_one_action" ADD CONSTRAINT "kpi_one_on_one_action_position_range" CHECK ("position" BETWEEN 1 AND 3);--> statement-breakpoint
ALTER TABLE "sales"."kpi_one_on_one_action" DROP CONSTRAINT IF EXISTS "kpi_one_on_one_action_text_length";--> statement-breakpoint
ALTER TABLE "sales"."kpi_one_on_one_action" ADD CONSTRAINT "kpi_one_on_one_action_text_length" CHECK (char_length("text") BETWEEN 1 AND 200);--> statement-breakpoint
ALTER TABLE "sales"."kpi_one_on_one_action" DROP CONSTRAINT IF EXISTS "kpi_one_on_one_action_done_pair";--> statement-breakpoint
ALTER TABLE "sales"."kpi_one_on_one_action" ADD CONSTRAINT "kpi_one_on_one_action_done_pair" CHECK (("done_at" IS NULL) = ("done_by" IS NULL));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kpi_one_on_one_action_open_idx" ON "sales"."kpi_one_on_one_action" USING btree ("one_on_one_id") WHERE "done_at" IS NULL;--> statement-breakpoint
ALTER TABLE "sales"."kpi_month_close" ADD COLUMN IF NOT EXISTS "score_basis" jsonb;--> statement-breakpoint
ALTER TABLE "platform"."notification" DROP CONSTRAINT IF EXISTS "notification_kind_known";--> statement-breakpoint
ALTER TABLE "platform"."notification" ADD CONSTRAINT "notification_kind_known" CHECK ("kind" IN ('lead-pooled', 'lead-received', 'lead-removed', 'lead-re-entered', 'lead-scan-ready', 'lead-scan-committed', 'lead-scan-failed', 'opportunity-awaiting-accept', 'opportunity-lost', 'opportunity-accepted', 'opportunity-assigned', 'opportunity-unassigned', 'next-step-assigned', 'next-step-done', 'approval-waiting', 'approval-approved', 'approval-rejected', 'mail-run-sent', 'mail-run-cancelled', 'mail-failed', 'customer-replied', 'access-changed', 'password-reset-by-admin', 'google-link-broken', 'opportunity-stage-moved', 'opportunity-primary-changed', 'contract-signed', 'quotation-new-round', 'quotation-superseded', 'contract-installment-paid', 'contract-installment-undone', 'contract-schedule-replaced', 'contract-condition-done', 'campaign-stopped', 'campaign-finished', 'kpi-target-proposed', 'kpi-target-agreed', 'comm-closed-by-other', 'lead-nurtured', 'lead-resumed', 'mail-run-replied', 'comm-record-late', 'contract-installment-overdue', 'hold-due-soon', 'hold-due', 'kpi-target-allocated', 'kpi-counter-resolved', 'kpi-allocation-returned', 'kpi-about-to-miss', 'kpi-about-to-hit', 'overdue-reason-waiting', 'overdue-reason-decided', 'kpi-team-share-assigned', 'meeting-cancelled', 'meeting-calendar-failed', 'contract-terminated', 'contract-collector-changed', 'kpi-allocation-waiting', 'kpi-counter-proposed', 'kpi-month-unclosed', 'kpi-stand-in', 'customer-recare-due', 'contract-penalty-changed', 'kpi-assignment-received', 'kpi-assignment-late', 'kpi-away-declared', 'kpi-digest', 'fx-rate-missing', 'assistant-brief', 'kpi-one-on-one'));--> statement-breakpoint
ALTER TABLE "platform"."notification_kind_policy" DROP CONSTRAINT IF EXISTS "notification_kind_policy_kind_known";--> statement-breakpoint
ALTER TABLE "platform"."notification_kind_policy" ADD CONSTRAINT "notification_kind_policy_kind_known" CHECK ("kind" IN ('lead-pooled', 'lead-received', 'lead-removed', 'lead-re-entered', 'lead-scan-ready', 'lead-scan-committed', 'lead-scan-failed', 'opportunity-awaiting-accept', 'opportunity-lost', 'opportunity-accepted', 'opportunity-assigned', 'opportunity-unassigned', 'next-step-assigned', 'next-step-done', 'approval-waiting', 'approval-approved', 'approval-rejected', 'mail-run-sent', 'mail-run-cancelled', 'mail-failed', 'customer-replied', 'access-changed', 'password-reset-by-admin', 'google-link-broken', 'opportunity-stage-moved', 'opportunity-primary-changed', 'contract-signed', 'quotation-new-round', 'quotation-superseded', 'contract-installment-paid', 'contract-installment-undone', 'contract-schedule-replaced', 'contract-condition-done', 'campaign-stopped', 'campaign-finished', 'kpi-target-proposed', 'kpi-target-agreed', 'comm-closed-by-other', 'lead-nurtured', 'lead-resumed', 'mail-run-replied', 'comm-record-late', 'contract-installment-overdue', 'hold-due-soon', 'hold-due', 'kpi-target-allocated', 'kpi-counter-resolved', 'kpi-allocation-returned', 'kpi-about-to-miss', 'kpi-about-to-hit', 'overdue-reason-waiting', 'overdue-reason-decided', 'kpi-team-share-assigned', 'meeting-cancelled', 'meeting-calendar-failed', 'contract-terminated', 'contract-collector-changed', 'kpi-allocation-waiting', 'kpi-counter-proposed', 'kpi-month-unclosed', 'kpi-stand-in', 'customer-recare-due', 'contract-penalty-changed', 'kpi-assignment-received', 'kpi-assignment-late', 'kpi-away-declared', 'kpi-digest', 'fx-rate-missing', 'assistant-brief', 'kpi-one-on-one'));--> statement-breakpoint
ALTER TABLE "platform"."setting" DROP CONSTRAINT IF EXISTS "setting_key_known";--> statement-breakpoint
ALTER TABLE "platform"."setting" ADD CONSTRAINT "setting_key_known" CHECK ("key" IN ('comms.reply.silence-days', 'comms.unmatched.retention-days', 'comms.blob.retention-days', 'sequence.step.default-wait-days', 'sequence.max-steps', 'content.share.expires-days', 'sales.activity.warn-days', 'sales.activity.alert-days', 'auth.session.remembered-days', 'kpi.alert.slip-percent', 'kpi.alert.hit-percent', 'kpi.pace.tolerance-percent', 'sales.after-sale.hot-days', 'sales.after-sale.warm-days', 'sales.after-sale.cold-days', 'kpi.score.grade-a', 'kpi.score.grade-b', 'kpi.score.grade-c'));
