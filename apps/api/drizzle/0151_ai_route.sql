-- 0151 - the AI gateway's route table: `platform.ai_route`, one row per `AiTask`
-- (primary model, optional fallback, token and time ceilings, daily limits), and
-- `platform.ai_call.attempt` (1 = first try, 2+ = retry or fallback; one row per
-- attempt that reached a vendor). Seeds the `lead-scan` route with what
-- SCAN_GEMINI_MODEL and SCAN_DAILY_TOKEN_BUDGET held. Every CHECK list is copied
-- by hand from `ai-route.schema.ts` and `ai-cost.schema.ts` (`AiTask`, `AiModel`).
--
-- Additive: existing `ai_call` rows get attempt = 1. The seed is ON CONFLICT DO
-- NOTHING so a re-run never overwrites a route an admin has edited.
-- ORDER: migrate BEFORE deploy - the new api reads the route on every call; the
-- old api ignores both. Re-runnable: IF NOT EXISTS, DROP ... IF EXISTS before ADD.
-- Hand-written for 0047's reason: `generate`'s baseline is still stuck at 0026.
CREATE TABLE IF NOT EXISTS "platform"."ai_route" (
	"task" text PRIMARY KEY NOT NULL,
	"primary_model" text NOT NULL,
	"fallback_model" text,
	"max_tokens_in" integer,
	"max_tokens_out" integer NOT NULL,
	"timeout_ms" integer NOT NULL,
	"daily_calls_per_user" integer NOT NULL,
	"daily_token_budget" integer NOT NULL,
	"enabled" boolean NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "ai_route_task_known" CHECK ("task" IN ('lead-scan')),
	CONSTRAINT "ai_route_primary_model_known" CHECK ("primary_model" ~ '^(claude|gemini)-[a-z0-9.-]+$'),
	CONSTRAINT "ai_route_fallback_model_known" CHECK ("fallback_model" IS NULL OR "fallback_model" ~ '^(claude|gemini)-[a-z0-9.-]+$'),
	CONSTRAINT "ai_route_fallback_differs" CHECK ("fallback_model" IS NULL OR "fallback_model" <> "primary_model"),
	CONSTRAINT "ai_route_max_tokens_in_positive" CHECK ("max_tokens_in" IS NULL OR "max_tokens_in" > 0),
	CONSTRAINT "ai_route_max_tokens_out_positive" CHECK ("max_tokens_out" > 0),
	CONSTRAINT "ai_route_timeout_range" CHECK ("timeout_ms" BETWEEN 1 AND 90000),
	CONSTRAINT "ai_route_daily_calls_not_negative" CHECK ("daily_calls_per_user" >= 0),
	CONSTRAINT "ai_route_daily_budget_not_negative" CHECK ("daily_token_budget" >= 0)
);--> statement-breakpoint
ALTER TABLE "platform"."ai_route" DROP CONSTRAINT IF EXISTS "ai_route_updated_by_actor_id_fk";--> statement-breakpoint
ALTER TABLE "platform"."ai_route" ADD CONSTRAINT "ai_route_updated_by_actor_id_fk" FOREIGN KEY ("updated_by") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "platform"."ai_call" ADD COLUMN IF NOT EXISTS "attempt" smallint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "platform"."ai_call" DROP CONSTRAINT IF EXISTS "ai_call_attempt_range";--> statement-breakpoint
ALTER TABLE "platform"."ai_call" ADD CONSTRAINT "ai_call_attempt_range" CHECK ("attempt" BETWEEN 1 AND 3);--> statement-breakpoint

INSERT INTO "platform"."ai_route"
  ("task", "primary_model", "fallback_model", "max_tokens_in", "max_tokens_out",
   "timeout_ms", "daily_calls_per_user", "daily_token_budget", "enabled")
VALUES ('lead-scan', 'gemini-3.8-flash', 'claude-haiku-5-5', NULL, 16384, 90000, 0, 3000000, true)
ON CONFLICT ("task") DO NOTHING;
