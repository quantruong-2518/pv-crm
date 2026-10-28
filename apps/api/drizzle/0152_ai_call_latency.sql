-- 0152 - `platform.ai_call.latency_ms`: wall time of one attempt's vendor request,
-- from send to answer or failure. Without it no tuning of timeouts, models or
-- concurrency rests on a number (ADR 0127).
--
-- Additive: NULL on every row written before this migration; the gateway fills
-- it on every live write. ORDER: migrate BEFORE deploy - the new api writes the
-- column, the old api ignores it. Re-runnable: IF NOT EXISTS, DROP ... IF EXISTS
-- before ADD. Hand-written for 0047's reason: `generate`'s baseline is stuck at 0026.
ALTER TABLE "platform"."ai_call" ADD COLUMN IF NOT EXISTS "latency_ms" integer;--> statement-breakpoint
ALTER TABLE "platform"."ai_call" DROP CONSTRAINT IF EXISTS "ai_call_latency_not_negative";--> statement-breakpoint
ALTER TABLE "platform"."ai_call" ADD CONSTRAINT "ai_call_latency_not_negative" CHECK ("latency_ms" IS NULL OR "latency_ms" >= 0);
