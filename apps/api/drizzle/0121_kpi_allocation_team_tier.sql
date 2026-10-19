-- 0121 - KPI allocation team tier: `sales.kpi_allocation.team_id` and
-- `sales.kpi_allocation_share` (ADR 0101). `team_id` NULL is the room tier, so
-- every row written before this migration keeps its meaning.
--
-- The two uniques that fenced "one live package per (period, role)" become
-- (period, role, team) over `coalesce("team_id"::text, '')`: a plain UNIQUE
-- treats two NULLs as different and would let the room tier fork. 0113 made
-- `kpi_allocation_version_uq` a table CONSTRAINT and `kpi_allocation_one_live_uq`
-- a UNIQUE INDEX, so each is dropped the way it was made. A room package and
-- a team package of one (period, role) can now be live together. A share
-- belongs to a room-tier package only: a CHECK cannot read another table, so
-- that is held at the door. Also one bell kind, `kpi-team-share-assigned`, and
-- one subject kind, `kpi-team`: the kind CHECKs are 0118's fifty-four plus the
-- new one, the subject CHECK is 0115's list plus the new one.
--
-- A new nullable column, a new empty table and widened lists, so the old api
-- is untouched between migrate and deploy - except that a second live package
-- for one (period, role) is only refused per team from here on. ORDER: migrate
-- BEFORE deploy. Re-runnable: IF NOT EXISTS / IF EXISTS everywhere.
--
-- Hand-written for 0047's reason: `generate`'s baseline is still stuck at 0026.
ALTER TABLE "sales"."kpi_allocation" ADD COLUMN IF NOT EXISTS "team_id" uuid;--> statement-breakpoint
ALTER TABLE "sales"."kpi_allocation" DROP CONSTRAINT IF EXISTS "kpi_allocation_team_id_kpi_team_id_fk";--> statement-breakpoint
ALTER TABLE "sales"."kpi_allocation" ADD CONSTRAINT "kpi_allocation_team_id_kpi_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "sales"."kpi_team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."kpi_allocation" DROP CONSTRAINT IF EXISTS "kpi_allocation_version_uq";--> statement-breakpoint
DROP INDEX IF EXISTS "sales"."kpi_allocation_one_live_uq";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "kpi_allocation_version_tier_uq" ON "sales"."kpi_allocation" USING btree ("period","role",coalesce("team_id"::text, ''),"version");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "kpi_allocation_one_live_tier_uq" ON "sales"."kpi_allocation" USING btree ("period","role",coalesce("team_id"::text, '')) WHERE "status" IN ('draft', 'submitted', 'returned', 'agreed');--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "sales"."kpi_allocation_share" (
	"allocation_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"metric_key" text NOT NULL,
	"value" numeric NOT NULL,
	CONSTRAINT "kpi_allocation_share_pk" PRIMARY KEY("allocation_id","team_id","metric_key"),
	CONSTRAINT "kpi_allocation_share_metric_known" CHECK ("metric_key" IN ('leads-sourced', 'lead-to-opportunity-rate', 'sourced-signed-value', 'opportunities-opened', 'first-response-hours', 'opportunity-accept-rate', 'demos-joined', 'signed-value', 'win-rate', 'debriefs-closed', 'overdue-receivables', 'accept-lag-days', 'collected-value', 'approval-turnaround-hours')),
	CONSTRAINT "kpi_allocation_share_value_not_negative" CHECK ("value" >= 0)
);--> statement-breakpoint
ALTER TABLE "sales"."kpi_allocation_share" DROP CONSTRAINT IF EXISTS "kpi_allocation_share_allocation_id_kpi_allocation_id_fk";--> statement-breakpoint
ALTER TABLE "sales"."kpi_allocation_share" ADD CONSTRAINT "kpi_allocation_share_allocation_id_kpi_allocation_id_fk" FOREIGN KEY ("allocation_id") REFERENCES "sales"."kpi_allocation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."kpi_allocation_share" DROP CONSTRAINT IF EXISTS "kpi_allocation_share_team_id_kpi_team_id_fk";--> statement-breakpoint
ALTER TABLE "sales"."kpi_allocation_share" ADD CONSTRAINT "kpi_allocation_share_team_id_kpi_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "sales"."kpi_team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "platform"."notification" DROP CONSTRAINT IF EXISTS "notification_kind_known";--> statement-breakpoint
ALTER TABLE "platform"."notification" ADD CONSTRAINT "notification_kind_known" CHECK ("kind" IN ('lead-pooled', 'lead-received', 'lead-removed', 'lead-re-entered', 'lead-stopped', 'lead-scan-ready', 'lead-scan-committed', 'lead-scan-failed', 'opportunity-awaiting-accept', 'opportunity-lost', 'opportunity-accepted', 'opportunity-assigned', 'opportunity-unassigned', 'next-step-assigned', 'next-step-done', 'approval-waiting', 'approval-approved', 'approval-rejected', 'mail-run-sent', 'mail-run-cancelled', 'mail-failed', 'customer-replied', 'access-changed', 'password-reset-by-admin', 'google-link-broken', 'opportunity-stage-moved', 'opportunity-primary-changed', 'contract-signed', 'quotation-new-round', 'quotation-superseded', 'contract-installment-paid', 'contract-installment-undone', 'contract-schedule-replaced', 'contract-condition-done', 'campaign-stopped', 'campaign-finished', 'kpi-target-proposed', 'kpi-target-agreed', 'comm-closed-by-other', 'lead-nurtured', 'lead-resumed', 'lead-reopened', 'mail-run-replied', 'comm-record-late', 'contract-installment-overdue', 'hold-due-soon', 'hold-due', 'kpi-target-allocated', 'kpi-counter-resolved', 'kpi-allocation-returned', 'kpi-about-to-miss', 'kpi-about-to-hit', 'overdue-reason-waiting', 'overdue-reason-decided', 'kpi-team-share-assigned'));--> statement-breakpoint
ALTER TABLE "platform"."notification" DROP CONSTRAINT IF EXISTS "notification_subject_kind_known";--> statement-breakpoint
ALTER TABLE "platform"."notification" ADD CONSTRAINT "notification_subject_kind_known" CHECK ("subject_kind" IN ('lead', 'lead-pool', 'opportunity', 'approval', 'lead-scan', 'mail-run', 'user', 'google-link', 'contract', 'campaign', 'kpi-target', 'comm', 'lead-batch', 'opportunity-batch', 'comm-record', 'kpi-scorecard', 'kpi-allocation', 'kpi-team'));--> statement-breakpoint
ALTER TABLE "platform"."notification_kind_policy" DROP CONSTRAINT IF EXISTS "notification_kind_policy_kind_known";--> statement-breakpoint
ALTER TABLE "platform"."notification_kind_policy" ADD CONSTRAINT "notification_kind_policy_kind_known" CHECK ("kind" IN ('lead-pooled', 'lead-received', 'lead-removed', 'lead-re-entered', 'lead-stopped', 'lead-scan-ready', 'lead-scan-committed', 'lead-scan-failed', 'opportunity-awaiting-accept', 'opportunity-lost', 'opportunity-accepted', 'opportunity-assigned', 'opportunity-unassigned', 'next-step-assigned', 'next-step-done', 'approval-waiting', 'approval-approved', 'approval-rejected', 'mail-run-sent', 'mail-run-cancelled', 'mail-failed', 'customer-replied', 'access-changed', 'password-reset-by-admin', 'google-link-broken', 'opportunity-stage-moved', 'opportunity-primary-changed', 'contract-signed', 'quotation-new-round', 'quotation-superseded', 'contract-installment-paid', 'contract-installment-undone', 'contract-schedule-replaced', 'contract-condition-done', 'campaign-stopped', 'campaign-finished', 'kpi-target-proposed', 'kpi-target-agreed', 'comm-closed-by-other', 'lead-nurtured', 'lead-resumed', 'lead-reopened', 'mail-run-replied', 'comm-record-late', 'contract-installment-overdue', 'hold-due-soon', 'hold-due', 'kpi-target-allocated', 'kpi-counter-resolved', 'kpi-allocation-returned', 'kpi-about-to-miss', 'kpi-about-to-hit', 'overdue-reason-waiting', 'overdue-reason-decided', 'kpi-team-share-assigned'));
