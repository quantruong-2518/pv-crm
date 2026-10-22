-- 0138 - KPI stand-in while away (ADR 0117): `sales.kpi_absence` (who is away,
-- Vietnam days inclusive, who stands in, who declared it, cancelled at) and the bell
-- kind `kpi-stand-in` in both kind lists (0133's sixty plus one: sixty-one; 0134-0137
-- touch no kind list). No new subject kind, so `notification_subject_kind_known` is
-- untouched. Rows are never deleted: cancelling stamps `cancelled_at`.
--
-- Overlap of two live absences of one person is the service's check: an exclusion
-- constraint needs `btree_gist`, which no migration loads and PGlite lacks unless the
-- client registers it. Every actor column is a real FK (only signed-in people write).
-- The table joins the `pv_change` map (0126) under 'kpi': waiting lists move with it.
--
-- Additive: one new empty table; the kind CHECKs are widened by DROP + ADD, so every
-- row 0133 accepted still passes. No policy row is seeded (0106). ORDER: migrate
-- BEFORE deploy. Re-runnable: IF NOT EXISTS, DROP ... IF EXISTS before every ADD.
-- Hand-written for 0047's reason: `generate`'s baseline is still stuck at 0026.
CREATE TABLE IF NOT EXISTS "sales"."kpi_absence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text NOT NULL,
	"from_day" date NOT NULL,
	"to_day" date NOT NULL,
	"stand_in_id" text NOT NULL,
	"declared_by_id" text NOT NULL,
	"declared_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "kpi_absence_days_ordered" CHECK ("from_day" <= "to_day"),
	CONSTRAINT "kpi_absence_stand_in_not_self" CHECK ("stand_in_id" <> "actor_id")
);--> statement-breakpoint
ALTER TABLE "sales"."kpi_absence" DROP CONSTRAINT IF EXISTS "kpi_absence_actor_id_actor_id_fk";--> statement-breakpoint
ALTER TABLE "sales"."kpi_absence" ADD CONSTRAINT "kpi_absence_actor_id_actor_id_fk" FOREIGN KEY ("actor_id") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."kpi_absence" DROP CONSTRAINT IF EXISTS "kpi_absence_stand_in_id_actor_id_fk";--> statement-breakpoint
ALTER TABLE "sales"."kpi_absence" ADD CONSTRAINT "kpi_absence_stand_in_id_actor_id_fk" FOREIGN KEY ("stand_in_id") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."kpi_absence" DROP CONSTRAINT IF EXISTS "kpi_absence_declared_by_id_actor_id_fk";--> statement-breakpoint
ALTER TABLE "sales"."kpi_absence" ADD CONSTRAINT "kpi_absence_declared_by_id_actor_id_fk" FOREIGN KEY ("declared_by_id") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kpi_absence_actor_idx" ON "sales"."kpi_absence" USING btree ("actor_id","from_day");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kpi_absence_stand_in_idx" ON "sales"."kpi_absence" USING btree ("stand_in_id");--> statement-breakpoint
DROP TRIGGER IF EXISTS "pv_change_write" ON "sales"."kpi_absence";--> statement-breakpoint
CREATE TRIGGER "pv_change_write" AFTER INSERT OR DELETE ON "sales"."kpi_absence" FOR EACH ROW EXECUTE FUNCTION "platform"."notify_entity_change"('kpi');--> statement-breakpoint
DROP TRIGGER IF EXISTS "pv_change_update" ON "sales"."kpi_absence";--> statement-breakpoint
CREATE TRIGGER "pv_change_update" AFTER UPDATE ON "sales"."kpi_absence" FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION "platform"."notify_entity_change"('kpi');--> statement-breakpoint

ALTER TABLE "platform"."notification" DROP CONSTRAINT IF EXISTS "notification_kind_known";--> statement-breakpoint
ALTER TABLE "platform"."notification" ADD CONSTRAINT "notification_kind_known" CHECK ("kind" IN ('lead-pooled', 'lead-received', 'lead-removed', 'lead-re-entered', 'lead-scan-ready', 'lead-scan-committed', 'lead-scan-failed', 'opportunity-awaiting-accept', 'opportunity-lost', 'opportunity-accepted', 'opportunity-assigned', 'opportunity-unassigned', 'next-step-assigned', 'next-step-done', 'approval-waiting', 'approval-approved', 'approval-rejected', 'mail-run-sent', 'mail-run-cancelled', 'mail-failed', 'customer-replied', 'access-changed', 'password-reset-by-admin', 'google-link-broken', 'opportunity-stage-moved', 'opportunity-primary-changed', 'contract-signed', 'quotation-new-round', 'quotation-superseded', 'contract-installment-paid', 'contract-installment-undone', 'contract-schedule-replaced', 'contract-condition-done', 'campaign-stopped', 'campaign-finished', 'kpi-target-proposed', 'kpi-target-agreed', 'comm-closed-by-other', 'lead-nurtured', 'lead-resumed', 'mail-run-replied', 'comm-record-late', 'contract-installment-overdue', 'hold-due-soon', 'hold-due', 'kpi-target-allocated', 'kpi-counter-resolved', 'kpi-allocation-returned', 'kpi-about-to-miss', 'kpi-about-to-hit', 'overdue-reason-waiting', 'overdue-reason-decided', 'kpi-team-share-assigned', 'meeting-cancelled', 'meeting-calendar-failed', 'contract-terminated', 'contract-collector-changed', 'kpi-allocation-waiting', 'kpi-counter-proposed', 'kpi-month-unclosed', 'kpi-stand-in'));--> statement-breakpoint
ALTER TABLE "platform"."notification_kind_policy" DROP CONSTRAINT IF EXISTS "notification_kind_policy_kind_known";--> statement-breakpoint
ALTER TABLE "platform"."notification_kind_policy" ADD CONSTRAINT "notification_kind_policy_kind_known" CHECK ("kind" IN ('lead-pooled', 'lead-received', 'lead-removed', 'lead-re-entered', 'lead-scan-ready', 'lead-scan-committed', 'lead-scan-failed', 'opportunity-awaiting-accept', 'opportunity-lost', 'opportunity-accepted', 'opportunity-assigned', 'opportunity-unassigned', 'next-step-assigned', 'next-step-done', 'approval-waiting', 'approval-approved', 'approval-rejected', 'mail-run-sent', 'mail-run-cancelled', 'mail-failed', 'customer-replied', 'access-changed', 'password-reset-by-admin', 'google-link-broken', 'opportunity-stage-moved', 'opportunity-primary-changed', 'contract-signed', 'quotation-new-round', 'quotation-superseded', 'contract-installment-paid', 'contract-installment-undone', 'contract-schedule-replaced', 'contract-condition-done', 'campaign-stopped', 'campaign-finished', 'kpi-target-proposed', 'kpi-target-agreed', 'comm-closed-by-other', 'lead-nurtured', 'lead-resumed', 'mail-run-replied', 'comm-record-late', 'contract-installment-overdue', 'hold-due-soon', 'hold-due', 'kpi-target-allocated', 'kpi-counter-resolved', 'kpi-allocation-returned', 'kpi-about-to-miss', 'kpi-about-to-hit', 'overdue-reason-waiting', 'overdue-reason-decided', 'kpi-team-share-assigned', 'meeting-cancelled', 'meeting-calendar-failed', 'contract-terminated', 'contract-collector-changed', 'kpi-allocation-waiting', 'kpi-counter-proposed', 'kpi-month-unclosed', 'kpi-stand-in'));
