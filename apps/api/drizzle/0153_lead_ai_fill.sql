-- 0153 - `website` on `sales.lead` and `sales.account`, and `sales.lead.ai_fill`:
-- which fields the AI filled, as `{ [field]: { source, unsure, at } }` (the
-- contract owns the shape). Also the `lead-enrich` AiTask: both hand-copied
-- task CHECKs (`ai_call_task_known`, `ai_route_task_known`) are widened, and its
-- route row is seeded (primary gemini-3.8-flash, fallback claude-sonnet-5-5).
--
-- Additive: website is NULL on every old row, ai_fill is '{}'; a blank website is
-- refused (NULL is empty). The task widening drops a CHECK only to re-add a
-- superset, and the website CHECKs drop only for a re-run. The
-- seed is ON CONFLICT DO NOTHING so a re-run never overwrites an edited route.
-- ORDER: migrate BEFORE deploy - the new api reads these columns and the route;
-- the old api ignores them. Re-runnable: IF NOT EXISTS, DROP ... IF EXISTS
-- before ADD. Hand-written for 0047's reason: `generate`'s baseline is stuck at 0026.
ALTER TABLE "sales"."lead" ADD COLUMN IF NOT EXISTS "website" text;--> statement-breakpoint
ALTER TABLE "sales"."account" ADD COLUMN IF NOT EXISTS "website" text;--> statement-breakpoint
ALTER TABLE "sales"."lead" ADD COLUMN IF NOT EXISTS "ai_fill" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "sales"."lead" DROP CONSTRAINT IF EXISTS "lead_website_not_blank";--> statement-breakpoint
ALTER TABLE "sales"."lead" ADD CONSTRAINT "lead_website_not_blank" CHECK ("website" <> '');--> statement-breakpoint
ALTER TABLE "sales"."account" DROP CONSTRAINT IF EXISTS "account_website_not_blank";--> statement-breakpoint
ALTER TABLE "sales"."account" ADD CONSTRAINT "account_website_not_blank" CHECK ("website" <> '');--> statement-breakpoint

ALTER TABLE "platform"."ai_call" DROP CONSTRAINT IF EXISTS "ai_call_task_known";--> statement-breakpoint
ALTER TABLE "platform"."ai_call" ADD CONSTRAINT "ai_call_task_known" CHECK ("task" IN ('lead-scan', 'lead-enrich'));--> statement-breakpoint
ALTER TABLE "platform"."ai_route" DROP CONSTRAINT IF EXISTS "ai_route_task_known";--> statement-breakpoint
ALTER TABLE "platform"."ai_route" ADD CONSTRAINT "ai_route_task_known" CHECK ("task" IN ('lead-scan', 'lead-enrich'));--> statement-breakpoint

INSERT INTO "platform"."ai_route"
  ("task", "primary_model", "fallback_model", "max_tokens_in", "max_tokens_out",
   "timeout_ms", "daily_calls_per_user", "daily_token_budget", "enabled")
VALUES ('lead-enrich', 'gemini-3.8-flash', 'claude-sonnet-5-5', NULL, 4096, 25000, 100, 0, true)
ON CONFLICT ("task") DO NOTHING;
