-- 0118 - overdue reasons: `sales.installment_overdue_reason`, the reason a
-- contract's Sale owner gives for an overdue installment and the head's or
-- director's decision on it (ADR 0100). Overdue money with no approved
-- reason counts in full in the KPI reading.
--
-- The reason is tied to the due date it explains (`due`): the reading code
-- applies it only while `reason.due = installment.due`, so editing the date
-- retires it without a delete. Composite FK to `contract_installment` with ON
-- DELETE CASCADE, like the four child tables: a dropped unpaid line takes its
-- reasons with it. `written_by_id <> decided_by_id` is a CHECK, not just a
-- service rule. Also two bell kinds, `overdue-reason-waiting` and
-- `overdue-reason-decided`: the two kind CHECKs are restated as 0115's fifty-two
-- plus those two (subject kinds unchanged: both open a `contract`).
--
-- New empty table and widened lists, so the old api is untouched between
-- migrate and deploy. ORDER: migrate BEFORE deploy. Re-runnable: IF NOT
-- EXISTS on table and indexes, DROP ... IF EXISTS before every ADD.
--
-- Hand-written for 0047's reason: `generate`'s baseline is still stuck at 0026.
CREATE TABLE IF NOT EXISTS "sales"."installment_overdue_reason" (
	"id" serial PRIMARY KEY NOT NULL,
	"contract_code" text NOT NULL,
	"installment_no" integer NOT NULL,
	"due" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"written_by_id" text NOT NULL,
	"written_at" timestamp with time zone DEFAULT now() NOT NULL,
	"state" text DEFAULT 'waiting' NOT NULL,
	"decided_by_id" text,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	CONSTRAINT "installment_overdue_reason_state_known" CHECK ("state" IN ('waiting', 'approved', 'rejected')),
	CONSTRAINT "installment_overdue_reason_reason_present" CHECK (length(btrim("reason")) > 0),
	CONSTRAINT "installment_overdue_reason_decided_pair" CHECK (("state" = 'waiting') = ("decided_by_id" IS NULL) AND ("state" = 'waiting') = ("decided_at" IS NULL)),
	CONSTRAINT "installment_overdue_reason_decided_by_another" CHECK ("decided_by_id" IS NULL OR "decided_by_id" <> "written_by_id"),
	CONSTRAINT "installment_overdue_reason_rejected_has_note" CHECK ("state" <> 'rejected' OR length(btrim(coalesce("decision_note", ''))) > 0)
);--> statement-breakpoint
ALTER TABLE "sales"."installment_overdue_reason" DROP CONSTRAINT IF EXISTS "installment_overdue_reason_installment_fk";--> statement-breakpoint
ALTER TABLE "sales"."installment_overdue_reason" ADD CONSTRAINT "installment_overdue_reason_installment_fk" FOREIGN KEY ("contract_code","installment_no") REFERENCES "sales"."contract_installment"("contract_code","no") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."installment_overdue_reason" DROP CONSTRAINT IF EXISTS "installment_overdue_reason_written_by_id_actor_id_fk";--> statement-breakpoint
ALTER TABLE "sales"."installment_overdue_reason" ADD CONSTRAINT "installment_overdue_reason_written_by_id_actor_id_fk" FOREIGN KEY ("written_by_id") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."installment_overdue_reason" DROP CONSTRAINT IF EXISTS "installment_overdue_reason_decided_by_id_actor_id_fk";--> statement-breakpoint
ALTER TABLE "sales"."installment_overdue_reason" ADD CONSTRAINT "installment_overdue_reason_decided_by_id_actor_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "installment_overdue_reason_one_waiting_uq" ON "sales"."installment_overdue_reason" USING btree ("contract_code","installment_no") WHERE "state" = 'waiting';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "installment_overdue_reason_installment_idx" ON "sales"."installment_overdue_reason" USING btree ("contract_code","installment_no","written_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "installment_overdue_reason_waiting_idx" ON "sales"."installment_overdue_reason" USING btree ("due") WHERE "state" = 'waiting';--> statement-breakpoint

ALTER TABLE "platform"."notification" DROP CONSTRAINT IF EXISTS "notification_kind_known";--> statement-breakpoint
ALTER TABLE "platform"."notification" ADD CONSTRAINT "notification_kind_known" CHECK ("kind" IN ('lead-pooled', 'lead-received', 'lead-removed', 'lead-re-entered', 'lead-stopped', 'lead-scan-ready', 'lead-scan-committed', 'lead-scan-failed', 'opportunity-awaiting-accept', 'opportunity-lost', 'opportunity-accepted', 'opportunity-assigned', 'opportunity-unassigned', 'next-step-assigned', 'next-step-done', 'approval-waiting', 'approval-approved', 'approval-rejected', 'mail-run-sent', 'mail-run-cancelled', 'mail-failed', 'customer-replied', 'access-changed', 'password-reset-by-admin', 'google-link-broken', 'opportunity-stage-moved', 'opportunity-primary-changed', 'contract-signed', 'quotation-new-round', 'quotation-superseded', 'contract-installment-paid', 'contract-installment-undone', 'contract-schedule-replaced', 'contract-condition-done', 'campaign-stopped', 'campaign-finished', 'kpi-target-proposed', 'kpi-target-agreed', 'comm-closed-by-other', 'lead-nurtured', 'lead-resumed', 'lead-reopened', 'mail-run-replied', 'comm-record-late', 'contract-installment-overdue', 'hold-due-soon', 'hold-due', 'kpi-target-allocated', 'kpi-counter-resolved', 'kpi-allocation-returned', 'kpi-about-to-miss', 'kpi-about-to-hit', 'overdue-reason-waiting', 'overdue-reason-decided'));--> statement-breakpoint
ALTER TABLE "platform"."notification_kind_policy" DROP CONSTRAINT IF EXISTS "notification_kind_policy_kind_known";--> statement-breakpoint
ALTER TABLE "platform"."notification_kind_policy" ADD CONSTRAINT "notification_kind_policy_kind_known" CHECK ("kind" IN ('lead-pooled', 'lead-received', 'lead-removed', 'lead-re-entered', 'lead-stopped', 'lead-scan-ready', 'lead-scan-committed', 'lead-scan-failed', 'opportunity-awaiting-accept', 'opportunity-lost', 'opportunity-accepted', 'opportunity-assigned', 'opportunity-unassigned', 'next-step-assigned', 'next-step-done', 'approval-waiting', 'approval-approved', 'approval-rejected', 'mail-run-sent', 'mail-run-cancelled', 'mail-failed', 'customer-replied', 'access-changed', 'password-reset-by-admin', 'google-link-broken', 'opportunity-stage-moved', 'opportunity-primary-changed', 'contract-signed', 'quotation-new-round', 'quotation-superseded', 'contract-installment-paid', 'contract-installment-undone', 'contract-schedule-replaced', 'contract-condition-done', 'campaign-stopped', 'campaign-finished', 'kpi-target-proposed', 'kpi-target-agreed', 'comm-closed-by-other', 'lead-nurtured', 'lead-resumed', 'lead-reopened', 'mail-run-replied', 'comm-record-late', 'contract-installment-overdue', 'hold-due-soon', 'hold-due', 'kpi-target-allocated', 'kpi-counter-resolved', 'kpi-allocation-returned', 'kpi-about-to-miss', 'kpi-about-to-hit', 'overdue-reason-waiting', 'overdue-reason-decided'));
