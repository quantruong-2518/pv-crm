-- 0109 - the bell learns `contract-installment-overdue` (kind) and `contract`
-- (subject): an installment past its due date and still unpaid rings someone.
--
-- Both hand-written lists on `platform.notification` widen in 0092's way, and
-- so does 0106's copy on `notification_kind_policy`, as 0107 did. Additive
-- only: every row the old lists accepted still passes, so validating the new
-- CHECKs cannot fail. For a `contract` subject `subject_code` holds
-- `sales.contract.code`; no CHECK and no key shapes that column, so nothing
-- else moves. ORDER: migrate BEFORE the deploy that writes the kind; the old
-- build never writes it. Re-runnable: DROP ... IF EXISTS first.
--
-- Hand-written for 0047's reason: `generate`'s baseline is still stuck at 0026.
ALTER TABLE "platform"."notification" DROP CONSTRAINT IF EXISTS "notification_kind_known";--> statement-breakpoint
ALTER TABLE "platform"."notification" ADD CONSTRAINT "notification_kind_known" CHECK ("kind" IN ('lead-pooled', 'lead-received', 'lead-removed', 'lead-re-entered', 'lead-stopped', 'lead-scan-ready', 'lead-scan-committed', 'lead-scan-failed', 'opportunity-awaiting-accept', 'opportunity-lost', 'opportunity-accepted', 'opportunity-assigned', 'opportunity-unassigned', 'next-step-assigned', 'next-step-done', 'approval-waiting', 'approval-approved', 'approval-rejected', 'mail-run-sent', 'mail-run-cancelled', 'mail-failed', 'customer-replied', 'access-changed', 'password-reset-by-admin', 'google-link-broken', 'comm-record-late', 'contract-installment-overdue'));--> statement-breakpoint
ALTER TABLE "platform"."notification" DROP CONSTRAINT IF EXISTS "notification_subject_kind_known";--> statement-breakpoint
ALTER TABLE "platform"."notification" ADD CONSTRAINT "notification_subject_kind_known" CHECK ("subject_kind" IN ('lead', 'lead-pool', 'opportunity', 'approval', 'lead-scan', 'mail-run', 'user', 'google-link', 'comm-record', 'contract'));--> statement-breakpoint
ALTER TABLE "platform"."notification_kind_policy" DROP CONSTRAINT IF EXISTS "notification_kind_policy_kind_known";--> statement-breakpoint
ALTER TABLE "platform"."notification_kind_policy" ADD CONSTRAINT "notification_kind_policy_kind_known" CHECK ("kind" IN ('lead-pooled', 'lead-received', 'lead-removed', 'lead-re-entered', 'lead-stopped', 'lead-scan-ready', 'lead-scan-committed', 'lead-scan-failed', 'opportunity-awaiting-accept', 'opportunity-lost', 'opportunity-accepted', 'opportunity-assigned', 'opportunity-unassigned', 'next-step-assigned', 'next-step-done', 'approval-waiting', 'approval-approved', 'approval-rejected', 'mail-run-sent', 'mail-run-cancelled', 'mail-failed', 'customer-replied', 'access-changed', 'password-reset-by-admin', 'google-link-broken', 'comm-record-late', 'contract-installment-overdue'));
