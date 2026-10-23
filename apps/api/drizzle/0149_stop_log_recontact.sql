-- 0149 - "Khách đã dừng" + stop log (ADR 0125): three nullable columns and one index.
--
--   touch.parked_from         the lead state at the moment of a park (stop log's "stage at stop").
--   lead.recontact_on         the day the parker wants the customer contacted again.
--   lead.replied_from_pool_at when a customer reply put a parked lead back in the pool as `new`.
--
-- ADDITIVE and nullable: the build running between migrate and deploy writes none of
-- the three, and every CHECK passes on NULL, so old code keeps working. Rows written
-- before this stay NULL (the log prints "Chưa có" for a pre-0149 park). No backfill.
-- Each CHECK is copied out by hand: the six `LeadState` values must change in a
-- migration somebody reads. `lead_open_owner_matches` already makes `new` + replied
-- ownerless, so the reply check names the same pair on purpose.
-- No notification-kind or setting-key CHECK is touched here.
-- ORDER: migrate BEFORE deploy. Re-runnable. Hand-written for 0047's reason.
ALTER TABLE "sales"."touch" ADD COLUMN IF NOT EXISTS "parked_from" text;--> statement-breakpoint
ALTER TABLE "sales"."lead" ADD COLUMN IF NOT EXISTS "recontact_on" date;--> statement-breakpoint
ALTER TABLE "sales"."lead" ADD COLUMN IF NOT EXISTS "replied_from_pool_at" timestamp with time zone;--> statement-breakpoint

ALTER TABLE "sales"."touch" DROP CONSTRAINT IF EXISTS "touch_parked_from_only_nurtured";--> statement-breakpoint
ALTER TABLE "sales"."touch" ADD CONSTRAINT "touch_parked_from_only_nurtured" CHECK ("parked_from" IS NULL OR "kind" = 'nurtured');--> statement-breakpoint
ALTER TABLE "sales"."touch" DROP CONSTRAINT IF EXISTS "touch_parked_from_known";--> statement-breakpoint
ALTER TABLE "sales"."touch" ADD CONSTRAINT "touch_parked_from_known" CHECK ("parked_from" IS NULL OR "parked_from" IN ('new', 'assigned', 'working',
                                                       'nurturing', 'converted'));--> statement-breakpoint
ALTER TABLE "sales"."lead" DROP CONSTRAINT IF EXISTS "lead_recontact_only_nurturing";--> statement-breakpoint
ALTER TABLE "sales"."lead" ADD CONSTRAINT "lead_recontact_only_nurturing" CHECK ("recontact_on" IS NULL OR "state" = 'nurturing');--> statement-breakpoint
ALTER TABLE "sales"."lead" DROP CONSTRAINT IF EXISTS "lead_replied_from_pool_unclaimed";--> statement-breakpoint
ALTER TABLE "sales"."lead" ADD CONSTRAINT "lead_replied_from_pool_unclaimed" CHECK ("replied_from_pool_at" IS NULL OR ("state" = 'new' AND "owner_id" IS NULL));--> statement-breakpoint

-- Answers "which lead parks fell in this period, newest first?" (stop log, lead rows).
CREATE INDEX IF NOT EXISTS "touch_nurtured_at_idx" ON "sales"."touch" USING btree ("at" DESC) WHERE "kind" = 'nurtured';--> statement-breakpoint
