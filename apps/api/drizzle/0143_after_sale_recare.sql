-- 0143 - "Khách đã mua" re-care (ADR 0121): `sales.customer_temperature`, one
-- hot/warm/cold reading per comm close-out on a paid-up journey, append-only (the
-- current temperature is the journey's latest row). Every FK is real: a close-out
-- only reaches the write for a journey, lead and debrief it has just read, and only
-- the signed-in owner closes. `debrief_id` CASCADEs like `debrief_answer`'s: only an
-- open debrief is ever deleted, and an open one has no reading yet. The table joins
-- the `pv_change` map (0126) under 'workstream': the after-sale book moves with it.
--
-- Widened, never narrowed (DROP + ADD; every row the old lists took still passes):
-- the journey frame takes object kind 'customer' with states hot|warm|cold; the bell
-- kind `customer-recare-due` joins both kind lists (0138's sixty-one plus it:
-- sixty-two; subject 'contract' is already listed); `setting_key_known` takes the
-- three `sales.after-sale.*-days` keys. No setting row is seeded: a missing row IS
-- the contract default (14/45/90), as for every key since 0041. No policy row (0106).
-- ORDER: migrate BEFORE deploy. Re-runnable. Hand-written for 0047's reason.
CREATE TABLE IF NOT EXISTS "sales"."customer_temperature" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workstream_code" text NOT NULL,
	"lead_code" text NOT NULL,
	"temperature" text NOT NULL,
	"debrief_id" uuid NOT NULL,
	"recorded_by" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_temperature_debrief_uq" UNIQUE("debrief_id"),
	CONSTRAINT "customer_temperature_known" CHECK ("temperature" IN ('hot', 'warm', 'cold'))
);--> statement-breakpoint
ALTER TABLE "sales"."customer_temperature" DROP CONSTRAINT IF EXISTS "customer_temperature_workstream_code_workstream_code_fk";--> statement-breakpoint
ALTER TABLE "sales"."customer_temperature" ADD CONSTRAINT "customer_temperature_workstream_code_workstream_code_fk" FOREIGN KEY ("workstream_code") REFERENCES "sales"."workstream"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."customer_temperature" DROP CONSTRAINT IF EXISTS "customer_temperature_lead_code_lead_code_fk";--> statement-breakpoint
ALTER TABLE "sales"."customer_temperature" ADD CONSTRAINT "customer_temperature_lead_code_lead_code_fk" FOREIGN KEY ("lead_code") REFERENCES "sales"."lead"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."customer_temperature" DROP CONSTRAINT IF EXISTS "customer_temperature_debrief_id_debrief_id_fk";--> statement-breakpoint
ALTER TABLE "sales"."customer_temperature" ADD CONSTRAINT "customer_temperature_debrief_id_debrief_id_fk" FOREIGN KEY ("debrief_id") REFERENCES "comms"."debrief"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."customer_temperature" DROP CONSTRAINT IF EXISTS "customer_temperature_recorded_by_actor_id_fk";--> statement-breakpoint
ALTER TABLE "sales"."customer_temperature" ADD CONSTRAINT "customer_temperature_recorded_by_actor_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Answers "the current temperature of journey X" (book and sweeper): latest row first.
CREATE INDEX IF NOT EXISTS "customer_temperature_workstream_idx" ON "sales"."customer_temperature" USING btree ("workstream_code","recorded_at" DESC);--> statement-breakpoint
DROP TRIGGER IF EXISTS "pv_change_write" ON "sales"."customer_temperature";--> statement-breakpoint
CREATE TRIGGER "pv_change_write" AFTER INSERT OR DELETE ON "sales"."customer_temperature" FOR EACH ROW EXECUTE FUNCTION "platform"."notify_entity_change"('workstream');--> statement-breakpoint
DROP TRIGGER IF EXISTS "pv_change_update" ON "sales"."customer_temperature";--> statement-breakpoint
CREATE TRIGGER "pv_change_update" AFTER UPDATE ON "sales"."customer_temperature" FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION "platform"."notify_entity_change"('workstream');--> statement-breakpoint

-- Two implications per kind rather than one OR, 0091's shape: an unknown kind fails
-- only `*_object_kind_known`, and each refusal names exactly one constraint.
ALTER TABLE "sales"."step_template" DROP CONSTRAINT IF EXISTS "step_template_object_kind_known";--> statement-breakpoint
ALTER TABLE "sales"."step_template" ADD CONSTRAINT "step_template_object_kind_known" CHECK ("object_kind" IN ('lead', 'opportunity', 'customer'));--> statement-breakpoint
ALTER TABLE "sales"."step_template" DROP CONSTRAINT IF EXISTS "step_template_state_known";--> statement-breakpoint
ALTER TABLE "sales"."step_template" ADD CONSTRAINT "step_template_state_known" CHECK (("object_kind" <> 'lead' OR "state_key" IN ('new', 'assigned', 'verifying', 'working', 'nurturing'))
      AND ("object_kind" <> 'opportunity' OR "state_key" IN ('new', 'assigned', 'engaged', 'quotation'))
      AND ("object_kind" <> 'customer' OR "state_key" IN ('hot', 'warm', 'cold')));--> statement-breakpoint
ALTER TABLE "sales"."state_rule" DROP CONSTRAINT IF EXISTS "state_rule_object_kind_known";--> statement-breakpoint
ALTER TABLE "sales"."state_rule" ADD CONSTRAINT "state_rule_object_kind_known" CHECK ("object_kind" IN ('lead', 'opportunity', 'customer'));--> statement-breakpoint
ALTER TABLE "sales"."state_rule" DROP CONSTRAINT IF EXISTS "state_rule_state_known";--> statement-breakpoint
ALTER TABLE "sales"."state_rule" ADD CONSTRAINT "state_rule_state_known" CHECK (("object_kind" <> 'lead' OR "state_key" IN ('new', 'assigned', 'verifying', 'working', 'nurturing'))
      AND ("object_kind" <> 'opportunity' OR "state_key" IN ('new', 'assigned', 'engaged', 'quotation'))
      AND ("object_kind" <> 'customer' OR "state_key" IN ('hot', 'warm', 'cold')));--> statement-breakpoint

ALTER TABLE "platform"."notification" DROP CONSTRAINT IF EXISTS "notification_kind_known";--> statement-breakpoint
ALTER TABLE "platform"."notification" ADD CONSTRAINT "notification_kind_known" CHECK ("kind" IN ('lead-pooled', 'lead-received', 'lead-removed', 'lead-re-entered', 'lead-scan-ready', 'lead-scan-committed', 'lead-scan-failed', 'opportunity-awaiting-accept', 'opportunity-lost', 'opportunity-accepted', 'opportunity-assigned', 'opportunity-unassigned', 'next-step-assigned', 'next-step-done', 'approval-waiting', 'approval-approved', 'approval-rejected', 'mail-run-sent', 'mail-run-cancelled', 'mail-failed', 'customer-replied', 'access-changed', 'password-reset-by-admin', 'google-link-broken', 'opportunity-stage-moved', 'opportunity-primary-changed', 'contract-signed', 'quotation-new-round', 'quotation-superseded', 'contract-installment-paid', 'contract-installment-undone', 'contract-schedule-replaced', 'contract-condition-done', 'campaign-stopped', 'campaign-finished', 'kpi-target-proposed', 'kpi-target-agreed', 'comm-closed-by-other', 'lead-nurtured', 'lead-resumed', 'mail-run-replied', 'comm-record-late', 'contract-installment-overdue', 'hold-due-soon', 'hold-due', 'kpi-target-allocated', 'kpi-counter-resolved', 'kpi-allocation-returned', 'kpi-about-to-miss', 'kpi-about-to-hit', 'overdue-reason-waiting', 'overdue-reason-decided', 'kpi-team-share-assigned', 'meeting-cancelled', 'meeting-calendar-failed', 'contract-terminated', 'contract-collector-changed', 'kpi-allocation-waiting', 'kpi-counter-proposed', 'kpi-month-unclosed', 'kpi-stand-in', 'customer-recare-due'));--> statement-breakpoint
ALTER TABLE "platform"."notification_kind_policy" DROP CONSTRAINT IF EXISTS "notification_kind_policy_kind_known";--> statement-breakpoint
ALTER TABLE "platform"."notification_kind_policy" ADD CONSTRAINT "notification_kind_policy_kind_known" CHECK ("kind" IN ('lead-pooled', 'lead-received', 'lead-removed', 'lead-re-entered', 'lead-scan-ready', 'lead-scan-committed', 'lead-scan-failed', 'opportunity-awaiting-accept', 'opportunity-lost', 'opportunity-accepted', 'opportunity-assigned', 'opportunity-unassigned', 'next-step-assigned', 'next-step-done', 'approval-waiting', 'approval-approved', 'approval-rejected', 'mail-run-sent', 'mail-run-cancelled', 'mail-failed', 'customer-replied', 'access-changed', 'password-reset-by-admin', 'google-link-broken', 'opportunity-stage-moved', 'opportunity-primary-changed', 'contract-signed', 'quotation-new-round', 'quotation-superseded', 'contract-installment-paid', 'contract-installment-undone', 'contract-schedule-replaced', 'contract-condition-done', 'campaign-stopped', 'campaign-finished', 'kpi-target-proposed', 'kpi-target-agreed', 'comm-closed-by-other', 'lead-nurtured', 'lead-resumed', 'mail-run-replied', 'comm-record-late', 'contract-installment-overdue', 'hold-due-soon', 'hold-due', 'kpi-target-allocated', 'kpi-counter-resolved', 'kpi-allocation-returned', 'kpi-about-to-miss', 'kpi-about-to-hit', 'overdue-reason-waiting', 'overdue-reason-decided', 'kpi-team-share-assigned', 'meeting-cancelled', 'meeting-calendar-failed', 'contract-terminated', 'contract-collector-changed', 'kpi-allocation-waiting', 'kpi-counter-proposed', 'kpi-month-unclosed', 'kpi-stand-in', 'customer-recare-due'));--> statement-breakpoint

ALTER TABLE "platform"."setting" DROP CONSTRAINT IF EXISTS "setting_key_known";--> statement-breakpoint
ALTER TABLE "platform"."setting" ADD CONSTRAINT "setting_key_known" CHECK ("key" IN ('comms.reply.silence-days', 'comms.unmatched.retention-days', 'comms.blob.retention-days', 'sequence.step.default-wait-days', 'sequence.max-steps', 'content.share.expires-days', 'sales.activity.warn-days', 'sales.activity.alert-days', 'auth.session.remembered-days', 'kpi.alert.slip-percent', 'kpi.alert.hit-percent', 'kpi.pace.tolerance-percent', 'sales.after-sale.hot-days', 'sales.after-sale.warm-days', 'sales.after-sale.cold-days'));
