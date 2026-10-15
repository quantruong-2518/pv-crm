-- 0107 - a comm's owner can mark it "could not reach the customer":
-- `unreached` on `comms.debrief`.
--
-- A marker in `booked`'s style. It closes the record and is the one exemption
-- from `debrief_closed_has_summary`: no summary, no answers, no next step.
-- `debrief_unreached_is_bare` fences the other direction - unreached implies
-- closed, summary-less, step-less and never a booked meeting. The <= 2000
-- bound still holds for every closed row that does carry a summary.
-- `comms.debrief_answer` has no fence here: a CHECK cannot see another table,
-- so "no answers" stays the write door's rule.
--
-- Every existing row takes the DEFAULT false, under which both CHECKs reduce
-- to the old rule, so validating them cannot fail. ORDER: migrate BEFORE the
-- deploy; the old build never writes the column. No index: no screen asks
-- "unreached rows" on its own yet. Re-runnable: IF [NOT] EXISTS throughout.
--
-- Second half: the bell learns `comm-record-late` (kind) and `comm-record`
-- (subject), so both hand-written lists on `platform.notification` widen, in
-- 0092's way, and so does 0106's copy on `notification_kind_policy`. Additive only: every row the old lists accepted still passes.
-- For a `comm-record` subject `subject_code` holds a debrief uuid; no CHECK
-- and no key shapes that column, so nothing else moves.
--
-- Hand-written for 0047's reason: `generate`'s baseline is still stuck at 0026.
ALTER TABLE "comms"."debrief" ADD COLUMN IF NOT EXISTS "unreached" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "comms"."debrief" DROP CONSTRAINT IF EXISTS "debrief_closed_has_summary";--> statement-breakpoint
ALTER TABLE "comms"."debrief" ADD CONSTRAINT "debrief_closed_has_summary" CHECK ("closed_at" IS NULL
	OR "unreached"
	OR ("summary" IS NOT NULL AND btrim("summary") <> '' AND char_length("summary") <= 2000));--> statement-breakpoint
ALTER TABLE "comms"."debrief" DROP CONSTRAINT IF EXISTS "debrief_unreached_is_bare";--> statement-breakpoint
ALTER TABLE "comms"."debrief" ADD CONSTRAINT "debrief_unreached_is_bare" CHECK (NOT "unreached"
	OR ("closed_at" IS NOT NULL AND "summary" IS NULL
	AND "next_kind_id" IS NULL AND NOT "booked"));--> statement-breakpoint
-- Merged 15/10 with ADR 0093 wave 2: Neon already ran `0110_notification_wave2`'s
-- first version, so every list here keeps wave 2's values too, or ADD CONSTRAINT
-- would refuse the wave-2 rows already written.
ALTER TABLE "platform"."notification" DROP CONSTRAINT IF EXISTS "notification_kind_known";--> statement-breakpoint
ALTER TABLE "platform"."notification" ADD CONSTRAINT "notification_kind_known" CHECK ("kind" IN ('lead-pooled', 'lead-received', 'lead-removed', 'lead-re-entered', 'lead-stopped', 'lead-scan-ready', 'lead-scan-committed', 'lead-scan-failed', 'opportunity-awaiting-accept', 'opportunity-lost', 'opportunity-accepted', 'opportunity-assigned', 'opportunity-unassigned', 'next-step-assigned', 'next-step-done', 'approval-waiting', 'approval-approved', 'approval-rejected', 'mail-run-sent', 'mail-run-cancelled', 'mail-failed', 'customer-replied', 'access-changed', 'password-reset-by-admin', 'google-link-broken', 'comm-record-late', 'opportunity-stage-moved', 'opportunity-primary-changed', 'contract-signed', 'quotation-new-round', 'quotation-superseded', 'contract-installment-paid', 'contract-installment-undone', 'contract-schedule-replaced', 'contract-condition-done', 'campaign-stopped', 'campaign-finished', 'kpi-target-proposed', 'kpi-target-agreed', 'comm-closed-by-other', 'lead-nurtured', 'lead-resumed', 'lead-reopened', 'mail-run-replied'));--> statement-breakpoint
ALTER TABLE "platform"."notification" DROP CONSTRAINT IF EXISTS "notification_subject_kind_known";--> statement-breakpoint
ALTER TABLE "platform"."notification" ADD CONSTRAINT "notification_subject_kind_known" CHECK ("subject_kind" IN ('lead', 'lead-pool', 'opportunity', 'approval', 'lead-scan', 'mail-run', 'user', 'google-link', 'comm-record', 'contract', 'campaign', 'kpi-target', 'comm', 'lead-batch', 'opportunity-batch'));--> statement-breakpoint
ALTER TABLE "platform"."notification_kind_policy" DROP CONSTRAINT IF EXISTS "notification_kind_policy_kind_known";--> statement-breakpoint
ALTER TABLE "platform"."notification_kind_policy" ADD CONSTRAINT "notification_kind_policy_kind_known" CHECK ("kind" IN ('lead-pooled', 'lead-received', 'lead-removed', 'lead-re-entered', 'lead-stopped', 'lead-scan-ready', 'lead-scan-committed', 'lead-scan-failed', 'opportunity-awaiting-accept', 'opportunity-lost', 'opportunity-accepted', 'opportunity-assigned', 'opportunity-unassigned', 'next-step-assigned', 'next-step-done', 'approval-waiting', 'approval-approved', 'approval-rejected', 'mail-run-sent', 'mail-run-cancelled', 'mail-failed', 'customer-replied', 'access-changed', 'password-reset-by-admin', 'google-link-broken', 'comm-record-late', 'opportunity-stage-moved', 'opportunity-primary-changed', 'contract-signed', 'quotation-new-round', 'quotation-superseded', 'contract-installment-paid', 'contract-installment-undone', 'contract-schedule-replaced', 'contract-condition-done', 'campaign-stopped', 'campaign-finished', 'kpi-target-proposed', 'kpi-target-agreed', 'comm-closed-by-other', 'lead-nurtured', 'lead-resumed', 'lead-reopened', 'mail-run-replied'));
