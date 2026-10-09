-- 0096 - a group letter may leave through the sender's own Gmail.
--
-- `mail_run.transport` freezes the pipe at the send click. Every stored run
-- takes the default 'resend', so `mail_run_gmail_group_plain` (gmail => group
-- and no Reply-To) binds none of them - a stored group run with a Reply-To is
-- a resend row and passes. `email_delivery.provider` has had a default and no
-- writer since 0005, so every stored row is 'resend' and both delivery CHECKs
-- hold; `provider_thread_id` starts NULL everywhere. The suppression CHECK is
-- only widened. Additive: old code keeps writing valid rows between migrate
-- and deploy.
--
-- Locks: each ADD CONSTRAINT scans its table once under ACCESS EXCLUSIVE and
-- the CREATE INDEX blocks writes to `email_delivery` while it scans (the
-- migrator runs in a transaction, so no CONCURRENTLY). Run off a send window.
--
-- Hand-written for 0047's reason: `generate`'s baseline is still stuck at 0026.
ALTER TABLE "platform"."mail_run" ADD COLUMN "transport" text DEFAULT 'resend' NOT NULL;--> statement-breakpoint
ALTER TABLE "platform"."mail_run" ADD CONSTRAINT "mail_run_transport_known" CHECK ("transport" IN ('resend', 'gmail'));--> statement-breakpoint
ALTER TABLE "platform"."mail_run" ADD CONSTRAINT "mail_run_gmail_group_plain" CHECK ("transport" <> 'gmail' OR ("kind" = 'group' AND "reply_to" IS NULL));--> statement-breakpoint
ALTER TABLE "platform"."email_delivery" ADD COLUMN "provider_thread_id" text;--> statement-breakpoint
ALTER TABLE "platform"."email_delivery" ADD CONSTRAINT "email_delivery_provider_known" CHECK ("provider" IN ('resend', 'gmail'));--> statement-breakpoint
ALTER TABLE "platform"."email_delivery" ADD CONSTRAINT "email_delivery_thread_needs_gmail" CHECK ("provider_thread_id" IS NULL OR "provider" = 'gmail');--> statement-breakpoint
CREATE INDEX "email_delivery_gmail_sweep_idx" ON "platform"."email_delivery" USING btree ("accepted_at") WHERE "provider" = 'gmail';--> statement-breakpoint
ALTER TABLE "platform"."email_suppression" DROP CONSTRAINT "email_suppression_source_valid";--> statement-breakpoint
ALTER TABLE "platform"."email_suppression" ADD CONSTRAINT "email_suppression_source_valid" CHECK ("source" IN ('resend', 'operator', 'gmail'));
