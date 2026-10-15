-- 0112 - the bell learns five KPI kinds (`kpi-target-allocated`,
-- `kpi-counter-resolved`, `kpi-allocation-returned`, `kpi-about-to-miss`,
-- `kpi-about-to-hit`) and three subjects (`kpi-scorecard`, `kpi-target`,
-- `kpi-allocation`), ADR 0098 §4.
--
-- Both hand-written lists on `platform.notification` widen in 0109's way, and
-- so does the copy on `notification_kind_policy`. Additive only: every row the
-- old lists accepted still passes, so validating the new CHECKs cannot fail.
-- For the three subjects `subject_code` holds a `YYYY-MM` month; no CHECK and
-- no key shapes that column, so nothing else moves. ORDER: migrate BEFORE the
-- deploy that writes the kinds; the old build never writes them. Re-runnable:
-- DROP ... IF EXISTS first.
--
-- Hand-written for 0047's reason: `generate`'s baseline is still stuck at 0026.
ALTER TABLE "platform"."notification" DROP CONSTRAINT IF EXISTS "notification_kind_known";--> statement-breakpoint
ALTER TABLE "platform"."notification" ADD CONSTRAINT "notification_kind_known" CHECK ("kind" IN ('lead-pooled', 'lead-received', 'lead-removed', 'lead-re-entered', 'lead-stopped', 'lead-scan-ready', 'lead-scan-committed', 'lead-scan-failed', 'opportunity-awaiting-accept', 'opportunity-lost', 'opportunity-accepted', 'opportunity-assigned', 'opportunity-unassigned', 'next-step-assigned', 'next-step-done', 'approval-waiting', 'approval-approved', 'approval-rejected', 'mail-run-sent', 'mail-run-cancelled', 'mail-failed', 'customer-replied', 'access-changed', 'password-reset-by-admin', 'google-link-broken', 'comm-record-late', 'contract-installment-overdue', 'kpi-target-allocated', 'kpi-counter-resolved', 'kpi-allocation-returned', 'kpi-about-to-miss', 'kpi-about-to-hit'));--> statement-breakpoint
ALTER TABLE "platform"."notification" DROP CONSTRAINT IF EXISTS "notification_subject_kind_known";--> statement-breakpoint
ALTER TABLE "platform"."notification" ADD CONSTRAINT "notification_subject_kind_known" CHECK ("subject_kind" IN ('lead', 'lead-pool', 'opportunity', 'approval', 'lead-scan', 'mail-run', 'user', 'google-link', 'comm-record', 'contract', 'kpi-scorecard', 'kpi-target', 'kpi-allocation'));--> statement-breakpoint
ALTER TABLE "platform"."notification_kind_policy" DROP CONSTRAINT IF EXISTS "notification_kind_policy_kind_known";--> statement-breakpoint
ALTER TABLE "platform"."notification_kind_policy" ADD CONSTRAINT "notification_kind_policy_kind_known" CHECK ("kind" IN ('lead-pooled', 'lead-received', 'lead-removed', 'lead-re-entered', 'lead-stopped', 'lead-scan-ready', 'lead-scan-committed', 'lead-scan-failed', 'opportunity-awaiting-accept', 'opportunity-lost', 'opportunity-accepted', 'opportunity-assigned', 'opportunity-unassigned', 'next-step-assigned', 'next-step-done', 'approval-waiting', 'approval-approved', 'approval-rejected', 'mail-run-sent', 'mail-run-cancelled', 'mail-failed', 'customer-replied', 'access-changed', 'password-reset-by-admin', 'google-link-broken', 'comm-record-late', 'contract-installment-overdue', 'kpi-target-allocated', 'kpi-counter-resolved', 'kpi-allocation-returned', 'kpi-about-to-miss', 'kpi-about-to-hit'));
