-- 0158 - the `comm-report` AiTask (ADR 0132): both hand-copied task CHECKs
-- (`ai_call_task_known`, `ai_route_task_known`) are widened, and its route row is
-- seeded (primary gemini-3.8-flash, fallback claude-sonnet-5-5, 25 s timeout
-- because the request is held open and Fly's proxy drops a silent connection at
-- about 60 s, the value 0153 used for the same reason). No token ceiling: its count
-- call would eat that window, and the door caps what it reads. Seeded OFF: customer content
-- goes abroad, so it is switched on through the route door after the transfer
-- assessment (ADR 0132 §9, open question 139), never by a deploy.
--
-- Additive: each CHECK is dropped only to re-add a superset, so no old row can
-- fail it. The seed is ON CONFLICT DO NOTHING so a re-run never overwrites a
-- route an admin has edited through `PUT /ai/routes/comm-report`.
-- ORDER: migrate BEFORE deploy - the new api logs `comm-report` calls and reads
-- the route; the old api never names the task. Re-runnable: DROP ... IF EXISTS
-- before ADD. Hand-written for 0047's reason: `generate`'s baseline is stuck at 0026.
ALTER TABLE "platform"."ai_call" DROP CONSTRAINT IF EXISTS "ai_call_task_known";--> statement-breakpoint
ALTER TABLE "platform"."ai_call" ADD CONSTRAINT "ai_call_task_known" CHECK ("task" IN ('lead-scan', 'lead-enrich', 'comm-report'));--> statement-breakpoint
ALTER TABLE "platform"."ai_route" DROP CONSTRAINT IF EXISTS "ai_route_task_known";--> statement-breakpoint
ALTER TABLE "platform"."ai_route" ADD CONSTRAINT "ai_route_task_known" CHECK ("task" IN ('lead-scan', 'lead-enrich', 'comm-report'));--> statement-breakpoint

INSERT INTO "platform"."ai_route"
  ("task", "primary_model", "fallback_model", "max_tokens_in", "max_tokens_out",
   "timeout_ms", "daily_calls_per_user", "daily_token_budget", "enabled")
VALUES ('comm-report', 'gemini-3.8-flash', 'claude-sonnet-5-5', NULL, 8192, 25000, 100, 0, false)
ON CONFLICT ("task") DO NOTHING;
