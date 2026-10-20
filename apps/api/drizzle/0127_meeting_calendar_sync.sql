-- 0127 - Google Calendar sync of a meeting becomes durable: a mark on
-- `sales.meeting` says "the event is behind", and a tombstone table lets a
-- deleted meeting's event still be removed.
--
-- `calendar_dirty_at` is set in the same transaction as the write that changes
-- the event (book, amend) and cleared by the push with `WHERE calendar_dirty_at =
-- <value it read>`. `calendar_attempts` counts failed background pushes since the
-- last success; `calendar_alerted_at` makes the booker hear about a failure once.
-- `meeting_calendar_dirty_idx` answers the worker's pick: dirty, not cancelled,
-- oldest first.
--
-- `meeting_calendar_drop` has NO foreign key to `sales.meeting` (the row is
-- deleted in the same transaction) and CASCADEs with the actor that owns the
-- event (no token left to retry with). One tombstone per meeting. It is not in
-- the `pv_change` map (0126): no screen lists it.
--
-- The bell kind `meeting-calendar-failed` joins both kind lists (0124's fifty-six
-- plus it: fifty-seven); no policy row is seeded (0106).
-- Every existing meeting takes NULL / 0, so the new CHECK cannot fail on them.
-- ORDER: migrate BEFORE deploy; the old build never writes the columns.
-- Re-runnable: IF [NOT] EXISTS throughout.
--
-- Hand-written for 0047's reason: `generate`'s baseline is still stuck at 0026.
ALTER TABLE "sales"."meeting" ADD COLUMN IF NOT EXISTS "calendar_dirty_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sales"."meeting" ADD COLUMN IF NOT EXISTS "calendar_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sales"."meeting" ADD COLUMN IF NOT EXISTS "calendar_alerted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sales"."meeting" DROP CONSTRAINT IF EXISTS "meeting_calendar_attempts_nonneg";--> statement-breakpoint
ALTER TABLE "sales"."meeting" ADD CONSTRAINT "meeting_calendar_attempts_nonneg" CHECK ("calendar_attempts" >= 0);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meeting_calendar_dirty_idx" ON "sales"."meeting" USING btree ("calendar_dirty_at") WHERE "calendar_dirty_at" IS NOT NULL AND "cancelled_at" IS NULL;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "sales"."meeting_calendar_drop" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"event_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meeting_calendar_drop_meeting_uq" UNIQUE("meeting_id"),
	CONSTRAINT "meeting_calendar_drop_attempts_nonneg" CHECK ("attempts" >= 0)
);--> statement-breakpoint
ALTER TABLE "sales"."meeting_calendar_drop" DROP CONSTRAINT IF EXISTS "meeting_calendar_drop_owner_id_actor_id_fk";--> statement-breakpoint
ALTER TABLE "sales"."meeting_calendar_drop" ADD CONSTRAINT "meeting_calendar_drop_owner_id_actor_id_fk" FOREIGN KEY ("owner_id") REFERENCES "platform"."actor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "platform"."notification" DROP CONSTRAINT IF EXISTS "notification_kind_known";--> statement-breakpoint
ALTER TABLE "platform"."notification" ADD CONSTRAINT "notification_kind_known" CHECK ("kind" IN ('lead-pooled', 'lead-received', 'lead-removed', 'lead-re-entered', 'lead-stopped', 'lead-scan-ready', 'lead-scan-committed', 'lead-scan-failed', 'opportunity-awaiting-accept', 'opportunity-lost', 'opportunity-accepted', 'opportunity-assigned', 'opportunity-unassigned', 'next-step-assigned', 'next-step-done', 'approval-waiting', 'approval-approved', 'approval-rejected', 'mail-run-sent', 'mail-run-cancelled', 'mail-failed', 'customer-replied', 'access-changed', 'password-reset-by-admin', 'google-link-broken', 'opportunity-stage-moved', 'opportunity-primary-changed', 'contract-signed', 'quotation-new-round', 'quotation-superseded', 'contract-installment-paid', 'contract-installment-undone', 'contract-schedule-replaced', 'contract-condition-done', 'campaign-stopped', 'campaign-finished', 'kpi-target-proposed', 'kpi-target-agreed', 'comm-closed-by-other', 'lead-nurtured', 'lead-resumed', 'lead-reopened', 'mail-run-replied', 'comm-record-late', 'contract-installment-overdue', 'hold-due-soon', 'hold-due', 'kpi-target-allocated', 'kpi-counter-resolved', 'kpi-allocation-returned', 'kpi-about-to-miss', 'kpi-about-to-hit', 'overdue-reason-waiting', 'overdue-reason-decided', 'kpi-team-share-assigned', 'meeting-cancelled', 'meeting-calendar-failed'));--> statement-breakpoint
ALTER TABLE "platform"."notification_kind_policy" DROP CONSTRAINT IF EXISTS "notification_kind_policy_kind_known";--> statement-breakpoint
ALTER TABLE "platform"."notification_kind_policy" ADD CONSTRAINT "notification_kind_policy_kind_known" CHECK ("kind" IN ('lead-pooled', 'lead-received', 'lead-removed', 'lead-re-entered', 'lead-stopped', 'lead-scan-ready', 'lead-scan-committed', 'lead-scan-failed', 'opportunity-awaiting-accept', 'opportunity-lost', 'opportunity-accepted', 'opportunity-assigned', 'opportunity-unassigned', 'next-step-assigned', 'next-step-done', 'approval-waiting', 'approval-approved', 'approval-rejected', 'mail-run-sent', 'mail-run-cancelled', 'mail-failed', 'customer-replied', 'access-changed', 'password-reset-by-admin', 'google-link-broken', 'opportunity-stage-moved', 'opportunity-primary-changed', 'contract-signed', 'quotation-new-round', 'quotation-superseded', 'contract-installment-paid', 'contract-installment-undone', 'contract-schedule-replaced', 'contract-condition-done', 'campaign-stopped', 'campaign-finished', 'kpi-target-proposed', 'kpi-target-agreed', 'comm-closed-by-other', 'lead-nurtured', 'lead-resumed', 'lead-reopened', 'mail-run-replied', 'comm-record-late', 'contract-installment-overdue', 'hold-due-soon', 'hold-due', 'kpi-target-allocated', 'kpi-counter-resolved', 'kpi-allocation-returned', 'kpi-about-to-miss', 'kpi-about-to-hit', 'overdue-reason-waiting', 'overdue-reason-decided', 'kpi-team-share-assigned', 'meeting-cancelled', 'meeting-calendar-failed'));
