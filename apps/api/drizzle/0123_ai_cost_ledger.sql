-- 0123 - the AI cost ledger (ADR 0102): `platform.ai_call`, one row per model
-- call with token counts only, and `platform.ai_price`, USD per 1M tokens per
-- model with an `effective_from` date. Cost is computed on read; no price is
-- seeded. Every CHECK list is copied by hand from `ai-cost.schema.ts` and the
-- contract (`AiTask`, `AiCallOutcome`).
--
-- Backfill: every surviving `sales.scan_file` row that spent tokens becomes one
-- `ai_call` (task `lead-scan`, model `gemini-3.8-flash`, the unchanged default
-- of `SCAN_GEMINI_MODEL` - ADR 0102 §4). Cached re-reads (0 tokens) are not
-- model calls and are skipped. `source_key` makes it idempotent.
--
-- ORDER: migrate BEFORE deploy - the new api writes `ai_call` on every scan
-- read. The old api never touches these tables. Re-runnable: IF NOT EXISTS on
-- tables and indexes, DROP ... IF EXISTS before every ADD CONSTRAINT, and the
-- backfill is ON CONFLICT DO NOTHING.
--
-- Hand-written for 0047's reason: `generate`'s baseline is still stuck at 0026.
CREATE TABLE IF NOT EXISTS "platform"."ai_call" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"task" text NOT NULL,
	"model" text NOT NULL,
	"tokens_in" integer NOT NULL,
	"tokens_out" integer NOT NULL,
	"outcome" text NOT NULL,
	"actor_id" text,
	"subject_code" text,
	"source_key" text,
	CONSTRAINT "ai_call_source_key_uq" UNIQUE("source_key"),
	CONSTRAINT "ai_call_task_known" CHECK ("task" IN ('lead-scan')),
	CONSTRAINT "ai_call_outcome_known" CHECK ("outcome" IN ('ok', 'error')),
	CONSTRAINT "ai_call_tokens_in_not_negative" CHECK ("tokens_in" >= 0),
	CONSTRAINT "ai_call_tokens_out_not_negative" CHECK ("tokens_out" >= 0)
);--> statement-breakpoint
ALTER TABLE "platform"."ai_call" DROP CONSTRAINT IF EXISTS "ai_call_actor_id_actor_id_fk";--> statement-breakpoint
ALTER TABLE "platform"."ai_call" ADD CONSTRAINT "ai_call_actor_id_actor_id_fk" FOREIGN KEY ("actor_id") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_call_at_idx" ON "platform"."ai_call" USING btree ("at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_call_actor_at_idx" ON "platform"."ai_call" USING btree ("actor_id","at");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "platform"."ai_price" (
	"model" text NOT NULL,
	"input_usd_per_mtok" numeric(14, 6) NOT NULL,
	"output_usd_per_mtok" numeric(14, 6) NOT NULL,
	"effective_from" date NOT NULL,
	"set_by_id" text NOT NULL,
	"set_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_price_pk" PRIMARY KEY("model","effective_from"),
	CONSTRAINT "ai_price_input_not_negative" CHECK ("input_usd_per_mtok" >= 0),
	CONSTRAINT "ai_price_output_not_negative" CHECK ("output_usd_per_mtok" >= 0)
);--> statement-breakpoint
ALTER TABLE "platform"."ai_price" DROP CONSTRAINT IF EXISTS "ai_price_set_by_id_actor_id_fk";--> statement-breakpoint
ALTER TABLE "platform"."ai_price" ADD CONSTRAINT "ai_price_set_by_id_actor_id_fk" FOREIGN KEY ("set_by_id") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

INSERT INTO "platform"."ai_call" ("at", "task", "model", "tokens_in", "tokens_out", "outcome", "actor_id", "subject_code", "source_key")
SELECT coalesce(sf."read_at", sf."created_at"), 'lead-scan', 'gemini-3.8-flash',
       coalesce(sf."tokens_in", 0), coalesce(sf."tokens_out", 0),
       CASE WHEN sf."state" = 'FAILED' THEN 'error' ELSE 'ok' END,
       sb."created_by", sb."code", 'scan_file:' || sf."id"::text
FROM "sales"."scan_file" sf
JOIN "sales"."scan_batch" sb ON sb."code" = sf."batch_code"
WHERE coalesce(sf."tokens_in", 0) + coalesce(sf."tokens_out", 0) > 0
ON CONFLICT ("source_key") DO NOTHING;
