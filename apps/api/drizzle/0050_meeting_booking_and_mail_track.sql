-- 0050 - the columns behind two checkboxes the contracts just grew: the
-- "Đặt lịch họp" drawer (duration, mode, goal) and the MAS compose panel's
-- engagement-tracking flag. One file because they ship in one turn and the
-- code that reads them ships with them; splitting would only create an order
-- in which the tree is half migrated.
--
-- The three meeting columns are NULLABLE FOR EVER. `MeetingCreate` requires
-- all three, but every row already in `sales.meeting` has none of them, and
-- no backfill value would be honest - a 60 and an 'office' nobody chose would
-- sit in the same column as ones somebody did. `MeetingRow` reads them back
-- optional for that reason.
--
-- Both CHECKs are implications whose left side is NULL on every existing row,
-- so validating them against the table cannot fail. `duration_minutes` is
-- pinned to the five picker slots of `MEETING_DURATION_MINUTES` rather than a
-- `> 0 AND <= 120` range: a looser bound would be a SECOND threshold, and the
-- day the two disagree the database accepts a 37 the zod gate refuses.
--
-- `track_engagement` decides whether the webhook door WRITES a run's OPEN and
-- CLICK rows into `platform.mail_event`; it does not reach Resend, which
-- tracks at account level. NOT NULL DEFAULT true, so every existing run
-- backfills to true - that is what actually happened to them, there being no
-- switch until now. A false default would claim the opposite and would mute
-- recording for every send door that does not set the flag.
--
-- Hand-written for the reason `0047` and `0049` give: `drizzle-kit generate`'s
-- baseline snapshot is still stuck at `0026`.
ALTER TABLE "sales"."meeting" ADD COLUMN "duration_minutes" integer;--> statement-breakpoint
ALTER TABLE "sales"."meeting" ADD COLUMN "mode" text;--> statement-breakpoint
ALTER TABLE "sales"."meeting" ADD COLUMN "goal" text;--> statement-breakpoint
ALTER TABLE "sales"."meeting" ADD CONSTRAINT "meeting_mode_known" CHECK ("mode" IS NULL OR "mode" IN ('online', 'onsite', 'office'));--> statement-breakpoint
ALTER TABLE "sales"."meeting" ADD CONSTRAINT "meeting_duration_known" CHECK ("duration_minutes" IS NULL OR "duration_minutes" IN (30, 45, 60, 90, 120));--> statement-breakpoint
ALTER TABLE "platform"."mail_run" ADD COLUMN "track_engagement" boolean DEFAULT true NOT NULL;
