-- 0099 - the in-app bell's ledger: `platform.notification`, one row per
-- (recipient, event key).
--
-- Private to the recipient: every read filters by `recipient_id`. CASCADEs
-- with the recipient - a bell line belongs to its reader. `actor_id` (who
-- caused it, NULL = system) is SET NULL, so the news outlives its author.
-- `subject_code` is polymorphic over several kinds and has NO foreign key, for
-- `sales.touch.subject_code`'s reason. Both CHECK lists are copied by hand
-- from `NotificationKind` and `NotificationSubject`.
--
-- The UNIQUE is a constraint, not a partial index, so writers can say
-- `ON CONFLICT (recipient_id, event_key) DO NOTHING`. Its index and the two
-- below answer: "is this already told", "my bell, newest first", "my unread
-- count". The two FKs take a brief lock on `platform.actor`.
--
-- One existing table changes, at the foot: `sales.touch` learns the kind
-- `customer-replied`. Like 0073, that is a brief exclusive lock plus one scan
-- to re-validate. The list only widens, so migrate-then-deploy and
-- deploy-then-migrate are both safe for old code; NEW code must not write the
-- kind before this has run.
--
-- Numbered 0099 on purpose: 0097 and 0098 are taken in another tree.
-- Hand-written for 0047's reason: `generate`'s baseline is still stuck at 0026.
CREATE TABLE "platform"."notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_id" text NOT NULL,
	"kind" text NOT NULL,
	"event_key" text NOT NULL,
	"subject_kind" text NOT NULL,
	"subject_code" text NOT NULL,
	"subject_label" text,
	"actor_id" text,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	CONSTRAINT "notification_recipient_event_uq" UNIQUE("recipient_id","event_key"),
	CONSTRAINT "notification_kind_known" CHECK ("kind" IN ('lead-pooled', 'lead-received', 'lead-removed', 'lead-re-entered', 'lead-stopped', 'lead-scan-ready', 'lead-scan-committed', 'lead-scan-failed', 'opportunity-awaiting-accept', 'opportunity-lost', 'opportunity-accepted', 'opportunity-assigned', 'opportunity-unassigned', 'next-step-assigned', 'next-step-done', 'approval-waiting', 'approval-approved', 'approval-rejected', 'mail-run-sent', 'mail-run-cancelled', 'mail-failed', 'customer-replied', 'access-changed', 'password-reset-by-admin', 'google-link-broken')),
	CONSTRAINT "notification_subject_kind_known" CHECK ("subject_kind" IN ('lead', 'lead-pool', 'opportunity', 'approval', 'lead-scan', 'mail-run', 'user', 'google-link'))
);--> statement-breakpoint
ALTER TABLE "platform"."notification" ADD CONSTRAINT "notification_recipient_id_actor_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "platform"."actor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."notification" ADD CONSTRAINT "notification_actor_id_actor_id_fk" FOREIGN KEY ("actor_id") REFERENCES "platform"."actor"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_recipient_recent_idx" ON "platform"."notification" USING btree ("recipient_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notification_recipient_unread_idx" ON "platform"."notification" USING btree ("recipient_id") WHERE "read_at" IS NULL;--> statement-breakpoint

-- Twenty-eight `TouchKind` values: `customer-replied` joins - the system's own
-- row for a customer's answer, on a lead or a deal. Nothing leaves.
ALTER TABLE "sales"."touch" DROP CONSTRAINT "touch_kind_known";--> statement-breakpoint
ALTER TABLE "sales"."touch" ADD CONSTRAINT "touch_kind_known" CHECK ("kind" IN ('created', 'contacted', 'field-filled', 'handed-over', 'tier-raised',
                     'care-planned', 'exchange-logged', 'first-action', 'verified',
                     'nurtured', 'resumed', 'archived', 'first-meeting',
                     'entered-pipeline', 'stage-changed', 'signed', 'exited',
                     'reopened', 'sample-sent', 'poc-run', 'demo-held', 'site-visited',
                     'quotation-sent', 'care-left', 'next-step-done',
                     'mail-failed', 'mail-sync-failed', 're-entered', 'customer-replied'));
