-- 0159 - the CRM assistant's tables and ledger columns (ADR 0133 D8). `platform.ai_call`
-- gains `turn_id`, `round` and two cache counts; both hand-copied task CHECKs
-- (`ai_call_task_known`, `ai_route_task_known`) are widened with the four assistant tasks.
-- `assistant_session`, `assistant_message` (the assistant row IS the turn: `turn_id` = its
-- id) and `assistant_tool_call` (no output column, on purpose: a stored result is a stale
-- copy of customer data). Every value list is copied by hand from @pv/contracts
-- `assistant.ts` and `ai-cost.ts`.
-- The four routes are seeded OFF, for 0158's reason: customer content goes abroad, so they
-- are switched on through the route door, never by a deploy.
-- Additive: existing `ai_call` rows get 0 + 0 cache tokens, which passes the new CHECK
-- because `tokens_in` >= 0; each task CHECK is dropped only to re-add a superset. The seed
-- is ON CONFLICT DO NOTHING so a re-run never overwrites a route an admin has edited.
-- ORDER: migrate BEFORE deploy - the new api writes the columns and reads the routes; the
-- old api names neither. Re-runnable: IF NOT EXISTS, DROP ... IF EXISTS before ADD.
-- Hand-written for 0047's reason: `generate`'s baseline is stuck at 0026.
-- The CHECKs and FKs take locks on `ai_call`, `ai_route` and `actor` that every writer queues
-- behind: give up after 10 s instead. Lasts to the migrator's commit (one transaction).
SET LOCAL lock_timeout = '10s';--> statement-breakpoint

ALTER TABLE "platform"."ai_call" ADD COLUMN IF NOT EXISTS "turn_id" uuid;--> statement-breakpoint
ALTER TABLE "platform"."ai_call" ADD COLUMN IF NOT EXISTS "round" smallint;--> statement-breakpoint
ALTER TABLE "platform"."ai_call" ADD COLUMN IF NOT EXISTS "tokens_cached" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "platform"."ai_call" ADD COLUMN IF NOT EXISTS "tokens_cache_write" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "platform"."ai_call" DROP CONSTRAINT IF EXISTS "ai_call_round_range";--> statement-breakpoint
ALTER TABLE "platform"."ai_call" ADD CONSTRAINT "ai_call_round_range" CHECK ("round" IS NULL OR "round" BETWEEN 1 AND 8);--> statement-breakpoint
ALTER TABLE "platform"."ai_call" DROP CONSTRAINT IF EXISTS "ai_call_cache_within_input";--> statement-breakpoint
ALTER TABLE "platform"."ai_call" ADD CONSTRAINT "ai_call_cache_within_input" CHECK ("tokens_cached" + "tokens_cache_write" <= "tokens_in");--> statement-breakpoint
ALTER TABLE "platform"."ai_call" DROP CONSTRAINT IF EXISTS "ai_call_task_known";--> statement-breakpoint
ALTER TABLE "platform"."ai_call" ADD CONSTRAINT "ai_call_task_known" CHECK ("task" IN ('lead-scan', 'lead-enrich', 'comm-report', 'assistant', 'assistant-deep', 'assistant-summary', 'assistant-brief'));--> statement-breakpoint
ALTER TABLE "platform"."ai_route" DROP CONSTRAINT IF EXISTS "ai_route_task_known";--> statement-breakpoint
ALTER TABLE "platform"."ai_route" ADD CONSTRAINT "ai_route_task_known" CHECK ("task" IN ('lead-scan', 'lead-enrich', 'comm-report', 'assistant', 'assistant-deep', 'assistant-summary', 'assistant-brief'));--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "platform"."assistant_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"title" text,
	"subject_kind" text,
	"subject_code" text,
	"summary" text,
	"summary_through" integer,
	"pinned_at" timestamp with time zone,
	"last_opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform"."assistant_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"seq" integer NOT NULL,
	"role" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"state" text NOT NULL,
	"ended_by" text,
	"model" text,
	"rounds" smallint DEFAULT 0 NOT NULL,
	"tool_tokens" integer DEFAULT 0 NOT NULL,
	"first_text_ms" integer,
	"prompt_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform"."assistant_tool_call" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"round" smallint NOT NULL,
	"position" smallint NOT NULL,
	"name" text NOT NULL,
	"input" jsonb NOT NULL,
	"codes" text[] DEFAULT '{}' NOT NULL,
	"row_count" integer,
	"hidden" integer,
	"truncated" boolean DEFAULT false NOT NULL,
	"tool_tokens" integer DEFAULT 0 NOT NULL,
	"outcome" text NOT NULL,
	"latency_ms" integer
);--> statement-breakpoint

ALTER TABLE "platform"."assistant_session" DROP CONSTRAINT IF EXISTS "assistant_session_owner_id_actor_id_fk";--> statement-breakpoint
ALTER TABLE "platform"."assistant_session" ADD CONSTRAINT "assistant_session_owner_id_actor_id_fk" FOREIGN KEY ("owner_id") REFERENCES "platform"."actor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."assistant_message" DROP CONSTRAINT IF EXISTS "assistant_message_session_id_assistant_session_id_fk";--> statement-breakpoint
ALTER TABLE "platform"."assistant_message" ADD CONSTRAINT "assistant_message_session_id_assistant_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "platform"."assistant_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."assistant_message" DROP CONSTRAINT IF EXISTS "assistant_message_actor_id_actor_id_fk";--> statement-breakpoint
ALTER TABLE "platform"."assistant_message" ADD CONSTRAINT "assistant_message_actor_id_actor_id_fk" FOREIGN KEY ("actor_id") REFERENCES "platform"."actor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."assistant_tool_call" DROP CONSTRAINT IF EXISTS "assistant_tool_call_message_id_assistant_message_id_fk";--> statement-breakpoint
ALTER TABLE "platform"."assistant_tool_call" ADD CONSTRAINT "assistant_tool_call_message_id_assistant_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "platform"."assistant_message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "platform"."assistant_session" DROP CONSTRAINT IF EXISTS "assistant_session_subject_pair";--> statement-breakpoint
ALTER TABLE "platform"."assistant_session" ADD CONSTRAINT "assistant_session_subject_pair" CHECK (("subject_kind" IS NULL) = ("subject_code" IS NULL));--> statement-breakpoint
ALTER TABLE "platform"."assistant_session" DROP CONSTRAINT IF EXISTS "assistant_session_subject_kind_known";--> statement-breakpoint
ALTER TABLE "platform"."assistant_session" ADD CONSTRAINT "assistant_session_subject_kind_known" CHECK ("subject_kind" IS NULL OR "subject_kind" IN ('lead', 'opportunity', 'contract'));--> statement-breakpoint
ALTER TABLE "platform"."assistant_session" DROP CONSTRAINT IF EXISTS "assistant_session_summary_pair";--> statement-breakpoint
ALTER TABLE "platform"."assistant_session" ADD CONSTRAINT "assistant_session_summary_pair" CHECK (("summary" IS NULL) = ("summary_through" IS NULL));--> statement-breakpoint

ALTER TABLE "platform"."assistant_message" DROP CONSTRAINT IF EXISTS "assistant_message_session_seq_uq";--> statement-breakpoint
ALTER TABLE "platform"."assistant_message" ADD CONSTRAINT "assistant_message_session_seq_uq" UNIQUE ("session_id", "seq");--> statement-breakpoint
ALTER TABLE "platform"."assistant_message" DROP CONSTRAINT IF EXISTS "assistant_message_role_known";--> statement-breakpoint
ALTER TABLE "platform"."assistant_message" ADD CONSTRAINT "assistant_message_role_known" CHECK ("role" IN ('user', 'assistant'));--> statement-breakpoint
ALTER TABLE "platform"."assistant_message" DROP CONSTRAINT IF EXISTS "assistant_message_state_known";--> statement-breakpoint
ALTER TABLE "platform"."assistant_message" ADD CONSTRAINT "assistant_message_state_known" CHECK ("state" IN ('running', 'done', 'failed', 'stopped'));--> statement-breakpoint
ALTER TABLE "platform"."assistant_message" DROP CONSTRAINT IF EXISTS "assistant_message_user_is_done";--> statement-breakpoint
ALTER TABLE "platform"."assistant_message" ADD CONSTRAINT "assistant_message_user_is_done" CHECK ("role" <> 'user' OR "state" = 'done');--> statement-breakpoint
ALTER TABLE "platform"."assistant_message" DROP CONSTRAINT IF EXISTS "assistant_message_running_unfinished";--> statement-breakpoint
ALTER TABLE "platform"."assistant_message" ADD CONSTRAINT "assistant_message_running_unfinished" CHECK (("state" = 'running') = ("finished_at" IS NULL));--> statement-breakpoint
ALTER TABLE "platform"."assistant_message" DROP CONSTRAINT IF EXISTS "assistant_message_rounds_range";--> statement-breakpoint
ALTER TABLE "platform"."assistant_message" ADD CONSTRAINT "assistant_message_rounds_range" CHECK ("rounds" BETWEEN 0 AND 8);--> statement-breakpoint
ALTER TABLE "platform"."assistant_message" DROP CONSTRAINT IF EXISTS "assistant_message_ended_by_known";--> statement-breakpoint
ALTER TABLE "platform"."assistant_message" ADD CONSTRAINT "assistant_message_ended_by_known" CHECK ("ended_by" IS NULL OR "ended_by" IN ('answer', 'cap-rounds', 'cap-time', 'cap-tokens', 'vendor', 'disabled', 'stopped', 'crash'));--> statement-breakpoint

ALTER TABLE "platform"."assistant_tool_call" DROP CONSTRAINT IF EXISTS "assistant_tool_call_slot_uq";--> statement-breakpoint
ALTER TABLE "platform"."assistant_tool_call" ADD CONSTRAINT "assistant_tool_call_slot_uq" UNIQUE ("message_id", "round", "position");--> statement-breakpoint
ALTER TABLE "platform"."assistant_tool_call" DROP CONSTRAINT IF EXISTS "assistant_tool_call_input_is_object";--> statement-breakpoint
ALTER TABLE "platform"."assistant_tool_call" ADD CONSTRAINT "assistant_tool_call_input_is_object" CHECK (jsonb_typeof("input") = 'object');--> statement-breakpoint
ALTER TABLE "platform"."assistant_tool_call" DROP CONSTRAINT IF EXISTS "assistant_tool_call_name_shape";--> statement-breakpoint
ALTER TABLE "platform"."assistant_tool_call" ADD CONSTRAINT "assistant_tool_call_name_shape" CHECK ("name" ~ '^[a-z_]+$');--> statement-breakpoint
ALTER TABLE "platform"."assistant_tool_call" DROP CONSTRAINT IF EXISTS "assistant_tool_call_outcome_known";--> statement-breakpoint
ALTER TABLE "platform"."assistant_tool_call" ADD CONSTRAINT "assistant_tool_call_outcome_known" CHECK ("outcome" IN ('ok', 'error', 'refused', 'over-cap', 'bad-input', 'unknown-tool'));--> statement-breakpoint

-- "My sessions, last opened first": the session list.
CREATE INDEX IF NOT EXISTS "assistant_session_owner_idx" ON "platform"."assistant_session" USING btree ("owner_id", "last_opened_at" DESC);--> statement-breakpoint
-- "Which unpinned sessions were last opened over 90 days ago": the retention purge.
CREATE INDEX IF NOT EXISTS "assistant_session_unpinned_idx" ON "platform"."assistant_session" USING btree ("last_opened_at") WHERE "pinned_at" IS NULL;--> statement-breakpoint
-- "Is a turn already running in this session": the 409, and one running row per session.
CREATE UNIQUE INDEX IF NOT EXISTS "assistant_message_one_running_uq" ON "platform"."assistant_message" USING btree ("session_id") WHERE "state" = 'running';--> statement-breakpoint
-- "How many turns did this person start in the last hour": the 60-per-hour cap.
CREATE INDEX IF NOT EXISTS "assistant_message_user_turns_idx" ON "platform"."assistant_message" USING btree ("actor_id", "created_at" DESC) WHERE "role" = 'user';--> statement-breakpoint

INSERT INTO "platform"."ai_route"
  ("task", "primary_model", "fallback_model", "max_tokens_in", "max_tokens_out",
   "timeout_ms", "daily_calls_per_user", "daily_token_budget", "enabled")
VALUES
  ('assistant', 'gemini-3.8-flash', 'claude-sonnet-5-5', NULL, 8192, 25000, 0, 0, false),
  ('assistant-deep', 'claude-opus-5-5', 'claude-sonnet-5-5', NULL, 8192, 25000, 0, 0, false),
  ('assistant-summary', 'gemini-3.8-flash', 'claude-haiku-5-5', NULL, 8192, 25000, 0, 0, false),
  ('assistant-brief', 'gemini-3.8-flash', 'claude-haiku-5-5', NULL, 8192, 25000, 0, 0, false)
ON CONFLICT ("task") DO NOTHING;
