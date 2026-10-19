-- 0124 - an opportunity stopped, a lead disqualified or a lead disabled
-- SOFT-CANCELS that subject's future meetings and closes its booked comm
-- records as cancelled: `cancelled_at` + `cancel_cause` on `sales.meeting`,
-- `cancelled` on `comms.debrief`, and the bell kind `meeting-cancelled`.
--
-- A mark, not a delete: the row stays so the calendar and the timeline can say
-- what was cancelled and why. `cancelled_at` and `cancel_cause` are one fact
-- (`meeting_cancel_pair`), and a held meeting is never cancelled afterwards
-- (`meeting_held_or_cancelled`). `debrief_cancelled_is_booked_closed` ties the
-- comm side to a booked, closed, reached record; because such a row is closed
-- with no summary, `debrief_closed_has_summary` gains `cancelled` as a second
-- exemption beside `unreached` (0107). No index: small table, 0086's reason.
--
-- Every existing row takes NULL / false, under which each CHECK reduces to the
-- old rule, so validating them cannot fail. The kind lists are 0122's fifty-five
-- plus the new one (fifty-six); no policy row is seeded (0106: no row = contract defaults).
-- ORDER: migrate BEFORE deploy; the old build never writes the columns.
-- Re-runnable: IF [NOT] EXISTS throughout.
--
-- Hand-written for 0047's reason: `generate`'s baseline is still stuck at 0026.
ALTER TABLE "sales"."meeting" ADD COLUMN IF NOT EXISTS "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sales"."meeting" ADD COLUMN IF NOT EXISTS "cancel_cause" text;--> statement-breakpoint
ALTER TABLE "sales"."meeting" DROP CONSTRAINT IF EXISTS "meeting_cancel_cause_known";--> statement-breakpoint
ALTER TABLE "sales"."meeting" ADD CONSTRAINT "meeting_cancel_cause_known" CHECK ("cancel_cause" IS NULL OR "cancel_cause" IN ('opportunity-lost', 'lead-disqualified', 'lead-disabled'));--> statement-breakpoint
ALTER TABLE "sales"."meeting" DROP CONSTRAINT IF EXISTS "meeting_cancel_pair";--> statement-breakpoint
ALTER TABLE "sales"."meeting" ADD CONSTRAINT "meeting_cancel_pair" CHECK (("cancelled_at" IS NULL) = ("cancel_cause" IS NULL));--> statement-breakpoint
ALTER TABLE "sales"."meeting" DROP CONSTRAINT IF EXISTS "meeting_held_or_cancelled";--> statement-breakpoint
ALTER TABLE "sales"."meeting" ADD CONSTRAINT "meeting_held_or_cancelled" CHECK ("held_at" IS NULL OR "cancelled_at" IS NULL);--> statement-breakpoint

ALTER TABLE "comms"."debrief" ADD COLUMN IF NOT EXISTS "cancelled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "comms"."debrief" DROP CONSTRAINT IF EXISTS "debrief_closed_has_summary";--> statement-breakpoint
ALTER TABLE "comms"."debrief" ADD CONSTRAINT "debrief_closed_has_summary" CHECK ("closed_at" IS NULL
	OR "unreached"
	OR "cancelled"
	OR ("summary" IS NOT NULL AND btrim("summary") <> '' AND char_length("summary") <= 2000));--> statement-breakpoint
ALTER TABLE "comms"."debrief" DROP CONSTRAINT IF EXISTS "debrief_cancelled_is_booked_closed";--> statement-breakpoint
ALTER TABLE "comms"."debrief" ADD CONSTRAINT "debrief_cancelled_is_booked_closed" CHECK (NOT "cancelled"
	OR ("booked" AND "closed_at" IS NOT NULL AND NOT "unreached"));--> statement-breakpoint

ALTER TABLE "platform"."notification" DROP CONSTRAINT IF EXISTS "notification_kind_known";--> statement-breakpoint
ALTER TABLE "platform"."notification" ADD CONSTRAINT "notification_kind_known" CHECK ("kind" IN ('lead-pooled', 'lead-received', 'lead-removed', 'lead-re-entered', 'lead-stopped', 'lead-scan-ready', 'lead-scan-committed', 'lead-scan-failed', 'opportunity-awaiting-accept', 'opportunity-lost', 'opportunity-accepted', 'opportunity-assigned', 'opportunity-unassigned', 'next-step-assigned', 'next-step-done', 'approval-waiting', 'approval-approved', 'approval-rejected', 'mail-run-sent', 'mail-run-cancelled', 'mail-failed', 'customer-replied', 'access-changed', 'password-reset-by-admin', 'google-link-broken', 'opportunity-stage-moved', 'opportunity-primary-changed', 'contract-signed', 'quotation-new-round', 'quotation-superseded', 'contract-installment-paid', 'contract-installment-undone', 'contract-schedule-replaced', 'contract-condition-done', 'campaign-stopped', 'campaign-finished', 'kpi-target-proposed', 'kpi-target-agreed', 'comm-closed-by-other', 'lead-nurtured', 'lead-resumed', 'lead-reopened', 'mail-run-replied', 'comm-record-late', 'contract-installment-overdue', 'hold-due-soon', 'hold-due', 'kpi-target-allocated', 'kpi-counter-resolved', 'kpi-allocation-returned', 'kpi-about-to-miss', 'kpi-about-to-hit', 'overdue-reason-waiting', 'overdue-reason-decided', 'kpi-team-share-assigned', 'meeting-cancelled'));--> statement-breakpoint
ALTER TABLE "platform"."notification_kind_policy" DROP CONSTRAINT IF EXISTS "notification_kind_policy_kind_known";--> statement-breakpoint
ALTER TABLE "platform"."notification_kind_policy" ADD CONSTRAINT "notification_kind_policy_kind_known" CHECK ("kind" IN ('lead-pooled', 'lead-received', 'lead-removed', 'lead-re-entered', 'lead-stopped', 'lead-scan-ready', 'lead-scan-committed', 'lead-scan-failed', 'opportunity-awaiting-accept', 'opportunity-lost', 'opportunity-accepted', 'opportunity-assigned', 'opportunity-unassigned', 'next-step-assigned', 'next-step-done', 'approval-waiting', 'approval-approved', 'approval-rejected', 'mail-run-sent', 'mail-run-cancelled', 'mail-failed', 'customer-replied', 'access-changed', 'password-reset-by-admin', 'google-link-broken', 'opportunity-stage-moved', 'opportunity-primary-changed', 'contract-signed', 'quotation-new-round', 'quotation-superseded', 'contract-installment-paid', 'contract-installment-undone', 'contract-schedule-replaced', 'contract-condition-done', 'campaign-stopped', 'campaign-finished', 'kpi-target-proposed', 'kpi-target-agreed', 'comm-closed-by-other', 'lead-nurtured', 'lead-resumed', 'lead-reopened', 'mail-run-replied', 'comm-record-late', 'contract-installment-overdue', 'hold-due-soon', 'hold-due', 'kpi-target-allocated', 'kpi-counter-resolved', 'kpi-allocation-returned', 'kpi-about-to-miss', 'kpi-about-to-hit', 'overdue-reason-waiting', 'overdue-reason-decided', 'kpi-team-share-assigned', 'meeting-cancelled'));
