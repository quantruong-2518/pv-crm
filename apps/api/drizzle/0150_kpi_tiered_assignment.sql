-- 0150 - KPI tiered assignment (ADR 0120 §2, §5, §6, §10): `sales.kpi_assignment`
-- (one set per unit, role and month P, versioned; `draft | sent | superseded`; a
-- draft v2 sits beside the sent v1, which turns `superseded` only when v2 is sent;
-- `by_default` when the late sweep wrote it) and `sales.kpi_assignment_line` (per
-- metric: the company `total`, a child `unit`, or a `person`, who confirms). Both
-- join the `pv_change` map (0126) under 'kpi'. Unit ids carry no FK: they key
-- `platform.org_node` with a version, and a draft must not block a unit edit. Bell
-- kinds `kpi-assignment-received`, `kpi-assignment-late` and `kpi-away-declared` join
-- both kind lists (0147's sixty-three plus three: sixty-six; 0148-0149 touch no
-- kind list), and the subject `kpi-assignment` (0122's eighteen plus one). Lists
-- copied by hand. `kpi-away-declared`: a person declared away by someone else is
-- told (ADR 0120 §7, owner 26/10).
--
-- Additive: two new empty tables; the three lists are widened by DROP + ADD, so
-- every row 0147 and 0122 accepted still passes. ORDER: migrate BEFORE deploy; the
-- old build never reads the tables nor emits the values. Re-runnable: IF NOT EXISTS,
-- DROP ... IF EXISTS before every ADD.
-- Hand-written for 0047's reason: `generate`'s baseline is still stuck at 0026.
CREATE TABLE IF NOT EXISTS "sales"."kpi_assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period" text NOT NULL,
	"role" text NOT NULL,
	"unit_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" text NOT NULL,
	"by_default" boolean DEFAULT false NOT NULL,
	"sent_by" text,
	"sent_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kpi_assignment_period_shape" CHECK ("period" ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "kpi_assignment_role_known" CHECK ("role" IN ('director', 'head-of-sales', 'marketing', 'bd', 'presales', 'sale', 'account-executive')),
	CONSTRAINT "kpi_assignment_version_positive" CHECK ("version" >= 1),
	CONSTRAINT "kpi_assignment_status_known" CHECK ("status" IN ('draft', 'sent', 'superseded')),
	CONSTRAINT "kpi_assignment_sent_stamp" CHECK (("status" = 'draft') = ("sent_at" IS NULL)),
	CONSTRAINT "kpi_assignment_default_is_sent" CHECK (NOT "by_default" OR "status" <> 'draft'),
	CONSTRAINT "kpi_assignment_sender_matches" CHECK (("status" = 'draft' OR "by_default") = ("sent_by" IS NULL)),
	CONSTRAINT "kpi_assignment_author_unless_default" CHECK ("by_default" OR "created_by" IS NOT NULL)
);--> statement-breakpoint
ALTER TABLE "sales"."kpi_assignment" DROP CONSTRAINT IF EXISTS "kpi_assignment_sent_by_actor_id_fk";--> statement-breakpoint
ALTER TABLE "sales"."kpi_assignment" ADD CONSTRAINT "kpi_assignment_sent_by_actor_id_fk" FOREIGN KEY ("sent_by") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."kpi_assignment" DROP CONSTRAINT IF EXISTS "kpi_assignment_created_by_actor_id_fk";--> statement-breakpoint
ALTER TABLE "sales"."kpi_assignment" ADD CONSTRAINT "kpi_assignment_created_by_actor_id_fk" FOREIGN KEY ("created_by") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "kpi_assignment_version_uq" ON "sales"."kpi_assignment" USING btree ("period","role","unit_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "kpi_assignment_one_sent_uq" ON "sales"."kpi_assignment" USING btree ("period","role","unit_id") WHERE "status" = 'sent';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "kpi_assignment_one_draft_uq" ON "sales"."kpi_assignment" USING btree ("period","role","unit_id") WHERE "status" = 'draft';--> statement-breakpoint
DROP TRIGGER IF EXISTS "pv_change_write" ON "sales"."kpi_assignment";--> statement-breakpoint
CREATE TRIGGER "pv_change_write" AFTER INSERT OR DELETE ON "sales"."kpi_assignment" FOR EACH ROW EXECUTE FUNCTION "platform"."notify_entity_change"('kpi');--> statement-breakpoint
DROP TRIGGER IF EXISTS "pv_change_update" ON "sales"."kpi_assignment";--> statement-breakpoint
CREATE TRIGGER "pv_change_update" AFTER UPDATE ON "sales"."kpi_assignment" FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION "platform"."notify_entity_change"('kpi');--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "sales"."kpi_assignment_line" (
	"assignment_id" uuid NOT NULL,
	"metric_key" text NOT NULL,
	"kind" text NOT NULL,
	"child_unit_id" uuid,
	"person_id" text,
	"value" numeric NOT NULL,
	"confirmed_at" timestamp with time zone,
	CONSTRAINT "kpi_assignment_line_metric_known" CHECK ("metric_key" IN ('leads-sourced', 'lead-to-opportunity-rate', 'sourced-signed-value', 'opportunities-opened', 'first-response-hours', 'opportunity-accept-rate', 'demos-joined', 'signed-value', 'win-rate', 'debriefs-closed', 'overdue-receivables', 'accept-lag-days', 'collected-value', 'approval-turnaround-hours')),
	CONSTRAINT "kpi_assignment_line_kind_known" CHECK ("kind" IN ('total', 'unit', 'person')),
	CONSTRAINT "kpi_assignment_line_receiver_matches_kind" CHECK (("kind" = 'total' AND "child_unit_id" IS NULL AND "person_id" IS NULL) OR ("kind" = 'unit' AND "child_unit_id" IS NOT NULL AND "person_id" IS NULL) OR ("kind" = 'person' AND "person_id" IS NOT NULL AND "child_unit_id" IS NULL)),
	CONSTRAINT "kpi_assignment_line_value_not_negative" CHECK ("value" >= 0),
	CONSTRAINT "kpi_assignment_line_confirmed_by_person" CHECK ("confirmed_at" IS NULL OR "kind" = 'person')
);--> statement-breakpoint
ALTER TABLE "sales"."kpi_assignment_line" DROP CONSTRAINT IF EXISTS "kpi_assignment_line_assignment_id_kpi_assignment_id_fk";--> statement-breakpoint
ALTER TABLE "sales"."kpi_assignment_line" ADD CONSTRAINT "kpi_assignment_line_assignment_id_kpi_assignment_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "sales"."kpi_assignment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."kpi_assignment_line" DROP CONSTRAINT IF EXISTS "kpi_assignment_line_person_id_actor_id_fk";--> statement-breakpoint
ALTER TABLE "sales"."kpi_assignment_line" ADD CONSTRAINT "kpi_assignment_line_person_id_actor_id_fk" FOREIGN KEY ("person_id") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "kpi_assignment_line_uq" ON "sales"."kpi_assignment_line" USING btree ("assignment_id","metric_key","kind",coalesce("child_unit_id"::text, "person_id", ''));--> statement-breakpoint
DROP TRIGGER IF EXISTS "pv_change_write" ON "sales"."kpi_assignment_line";--> statement-breakpoint
CREATE TRIGGER "pv_change_write" AFTER INSERT OR DELETE ON "sales"."kpi_assignment_line" FOR EACH ROW EXECUTE FUNCTION "platform"."notify_entity_change"('kpi');--> statement-breakpoint
DROP TRIGGER IF EXISTS "pv_change_update" ON "sales"."kpi_assignment_line";--> statement-breakpoint
CREATE TRIGGER "pv_change_update" AFTER UPDATE ON "sales"."kpi_assignment_line" FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION "platform"."notify_entity_change"('kpi');--> statement-breakpoint

ALTER TABLE "platform"."notification" DROP CONSTRAINT IF EXISTS "notification_kind_known";--> statement-breakpoint
ALTER TABLE "platform"."notification" ADD CONSTRAINT "notification_kind_known" CHECK ("kind" IN ('lead-pooled', 'lead-received', 'lead-removed', 'lead-re-entered', 'lead-scan-ready', 'lead-scan-committed', 'lead-scan-failed', 'opportunity-awaiting-accept', 'opportunity-lost', 'opportunity-accepted', 'opportunity-assigned', 'opportunity-unassigned', 'next-step-assigned', 'next-step-done', 'approval-waiting', 'approval-approved', 'approval-rejected', 'mail-run-sent', 'mail-run-cancelled', 'mail-failed', 'customer-replied', 'access-changed', 'password-reset-by-admin', 'google-link-broken', 'opportunity-stage-moved', 'opportunity-primary-changed', 'contract-signed', 'quotation-new-round', 'quotation-superseded', 'contract-installment-paid', 'contract-installment-undone', 'contract-schedule-replaced', 'contract-condition-done', 'campaign-stopped', 'campaign-finished', 'kpi-target-proposed', 'kpi-target-agreed', 'comm-closed-by-other', 'lead-nurtured', 'lead-resumed', 'mail-run-replied', 'comm-record-late', 'contract-installment-overdue', 'hold-due-soon', 'hold-due', 'kpi-target-allocated', 'kpi-counter-resolved', 'kpi-allocation-returned', 'kpi-about-to-miss', 'kpi-about-to-hit', 'overdue-reason-waiting', 'overdue-reason-decided', 'kpi-team-share-assigned', 'meeting-cancelled', 'meeting-calendar-failed', 'contract-terminated', 'contract-collector-changed', 'kpi-allocation-waiting', 'kpi-counter-proposed', 'kpi-month-unclosed', 'kpi-stand-in', 'customer-recare-due', 'contract-penalty-changed', 'kpi-assignment-received', 'kpi-assignment-late', 'kpi-away-declared'));--> statement-breakpoint
ALTER TABLE "platform"."notification_kind_policy" DROP CONSTRAINT IF EXISTS "notification_kind_policy_kind_known";--> statement-breakpoint
ALTER TABLE "platform"."notification_kind_policy" ADD CONSTRAINT "notification_kind_policy_kind_known" CHECK ("kind" IN ('lead-pooled', 'lead-received', 'lead-removed', 'lead-re-entered', 'lead-scan-ready', 'lead-scan-committed', 'lead-scan-failed', 'opportunity-awaiting-accept', 'opportunity-lost', 'opportunity-accepted', 'opportunity-assigned', 'opportunity-unassigned', 'next-step-assigned', 'next-step-done', 'approval-waiting', 'approval-approved', 'approval-rejected', 'mail-run-sent', 'mail-run-cancelled', 'mail-failed', 'customer-replied', 'access-changed', 'password-reset-by-admin', 'google-link-broken', 'opportunity-stage-moved', 'opportunity-primary-changed', 'contract-signed', 'quotation-new-round', 'quotation-superseded', 'contract-installment-paid', 'contract-installment-undone', 'contract-schedule-replaced', 'contract-condition-done', 'campaign-stopped', 'campaign-finished', 'kpi-target-proposed', 'kpi-target-agreed', 'comm-closed-by-other', 'lead-nurtured', 'lead-resumed', 'mail-run-replied', 'comm-record-late', 'contract-installment-overdue', 'hold-due-soon', 'hold-due', 'kpi-target-allocated', 'kpi-counter-resolved', 'kpi-allocation-returned', 'kpi-about-to-miss', 'kpi-about-to-hit', 'overdue-reason-waiting', 'overdue-reason-decided', 'kpi-team-share-assigned', 'meeting-cancelled', 'meeting-calendar-failed', 'contract-terminated', 'contract-collector-changed', 'kpi-allocation-waiting', 'kpi-counter-proposed', 'kpi-month-unclosed', 'kpi-stand-in', 'customer-recare-due', 'contract-penalty-changed', 'kpi-assignment-received', 'kpi-assignment-late', 'kpi-away-declared'));--> statement-breakpoint
ALTER TABLE "platform"."notification" DROP CONSTRAINT IF EXISTS "notification_subject_kind_known";--> statement-breakpoint
ALTER TABLE "platform"."notification" ADD CONSTRAINT "notification_subject_kind_known" CHECK ("subject_kind" IN ('lead', 'lead-pool', 'opportunity', 'approval', 'lead-scan', 'mail-run', 'user', 'google-link', 'contract', 'campaign', 'kpi-target', 'comm', 'lead-batch', 'opportunity-batch', 'comm-record', 'kpi-scorecard', 'kpi-allocation', 'kpi-team', 'kpi-assignment'));
