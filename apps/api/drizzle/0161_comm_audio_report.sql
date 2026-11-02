-- 0161 - the `comm-audio-report` AiTask and `comms.ai_job`, one press of a comm's AI button on
-- a record with a recording, run by the `comm.ai-report` worker and read by the tray (ADR 0135).
-- State, part, step (0..3) and error-kind lists are copied by hand from @pv/contracts
-- `comms/ai-report.ts`. One active job per debrief is a partial UNIQUE, so two racing presses
-- cannot both enqueue. Both hand-copied task CHECKs (`ai_call_task_known`,
-- `ai_route_task_known`) are widened. `ai_route_timeout_range` stays 90 s for every task and
-- reaches 540 s for this one alone: `AI_RECORDING_TIMEOUT_MAX_MS`, copied by hand.
-- The table joins `pv_change` under 'ai-job', the kind 0157 added, so the tray hears progress.
-- The route is seeded OFF, for 0158's reason: customer content goes abroad, so it is switched
-- on through the route door, never by a deploy. No fallback: only Gemini has an audio path in
-- the gateway.
-- Additive: each CHECK is dropped only to re-add a superset, so no old row can fail it. The
-- seed is ON CONFLICT DO NOTHING so a re-run never overwrites a route an admin has edited.
-- ORDER: migrate BEFORE deploy - the new api writes the table, logs the task and reads the
-- route; the old api names none of them. Re-runnable: IF NOT EXISTS, DROP ... IF EXISTS before
-- ADD. Hand-written for 0047's reason: `generate`'s baseline is stuck at 0026.
-- The CHECKs and FKs take locks on `ai_call`, `ai_route`, `debrief` and `actor` that every
-- writer queues behind: give up after 10 s instead. Lasts to the migrator's commit (one transaction).
SET LOCAL lock_timeout = '10s';--> statement-breakpoint

ALTER TABLE "platform"."ai_call" DROP CONSTRAINT IF EXISTS "ai_call_task_known";--> statement-breakpoint
ALTER TABLE "platform"."ai_call" ADD CONSTRAINT "ai_call_task_known" CHECK ("task" IN ('lead-scan', 'lead-enrich', 'comm-report', 'comm-audio-report', 'assistant', 'assistant-deep', 'assistant-summary', 'assistant-brief'));--> statement-breakpoint
ALTER TABLE "platform"."ai_route" DROP CONSTRAINT IF EXISTS "ai_route_task_known";--> statement-breakpoint
ALTER TABLE "platform"."ai_route" ADD CONSTRAINT "ai_route_task_known" CHECK ("task" IN ('lead-scan', 'lead-enrich', 'comm-report', 'comm-audio-report', 'assistant', 'assistant-deep', 'assistant-summary', 'assistant-brief'));--> statement-breakpoint
ALTER TABLE "platform"."ai_route" DROP CONSTRAINT IF EXISTS "ai_route_timeout_range";--> statement-breakpoint
ALTER TABLE "platform"."ai_route" ADD CONSTRAINT "ai_route_timeout_range" CHECK ("timeout_ms" BETWEEN 1 AND 90000 OR ("task" = 'comm-audio-report' AND "timeout_ms" BETWEEN 1 AND 540000));--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "comms"."ai_job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"debrief_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"part" text NOT NULL,
	"state" text DEFAULT 'QUEUED' NOT NULL,
	"step" smallint DEFAULT 0 NOT NULL,
	"step_ms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"result" jsonb,
	"error_kind" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone
);--> statement-breakpoint
ALTER TABLE "comms"."ai_job" DROP CONSTRAINT IF EXISTS "ai_job_debrief_id_debrief_id_fk";--> statement-breakpoint
ALTER TABLE "comms"."ai_job" ADD CONSTRAINT "ai_job_debrief_id_debrief_id_fk" FOREIGN KEY ("debrief_id") REFERENCES "comms"."debrief"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comms"."ai_job" DROP CONSTRAINT IF EXISTS "ai_job_actor_id_actor_id_fk";--> statement-breakpoint
ALTER TABLE "comms"."ai_job" ADD CONSTRAINT "ai_job_actor_id_actor_id_fk" FOREIGN KEY ("actor_id") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comms"."ai_job" DROP CONSTRAINT IF EXISTS "ai_job_state_known";--> statement-breakpoint
ALTER TABLE "comms"."ai_job" ADD CONSTRAINT "ai_job_state_known" CHECK ("state" IN ('QUEUED', 'RUNNING', 'DONE', 'FAILED'));--> statement-breakpoint
ALTER TABLE "comms"."ai_job" DROP CONSTRAINT IF EXISTS "ai_job_part_known";--> statement-breakpoint
ALTER TABLE "comms"."ai_job" ADD CONSTRAINT "ai_job_part_known" CHECK ("part" IN ('summary', 'minutes'));--> statement-breakpoint
ALTER TABLE "comms"."ai_job" DROP CONSTRAINT IF EXISTS "ai_job_error_kind_known";--> statement-breakpoint
ALTER TABLE "comms"."ai_job" ADD CONSTRAINT "ai_job_error_kind_known" CHECK ("error_kind" IS NULL OR "error_kind" IN ('unavailable', 'busy', 'failed'));--> statement-breakpoint
-- Three steps: read-sources, listen, write.
ALTER TABLE "comms"."ai_job" DROP CONSTRAINT IF EXISTS "ai_job_step_range";--> statement-breakpoint
ALTER TABLE "comms"."ai_job" ADD CONSTRAINT "ai_job_step_range" CHECK ("step" BETWEEN 0 AND 3);--> statement-breakpoint
ALTER TABLE "comms"."ai_job" DROP CONSTRAINT IF EXISTS "ai_job_step_ms_per_step";--> statement-breakpoint
ALTER TABLE "comms"."ai_job" ADD CONSTRAINT "ai_job_step_ms_per_step" CHECK (jsonb_typeof("step_ms") = 'array' AND jsonb_array_length("step_ms") = "step");--> statement-breakpoint
ALTER TABLE "comms"."ai_job" DROP CONSTRAINT IF EXISTS "ai_job_done_has_result";--> statement-breakpoint
ALTER TABLE "comms"."ai_job" ADD CONSTRAINT "ai_job_done_has_result" CHECK ("state" <> 'DONE' OR ("result" IS NOT NULL AND "finished_at" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "comms"."ai_job" DROP CONSTRAINT IF EXISTS "ai_job_failed_has_error";--> statement-breakpoint
ALTER TABLE "comms"."ai_job" ADD CONSTRAINT "ai_job_failed_has_error" CHECK ("state" <> 'FAILED' OR ("error_kind" IS NOT NULL AND "error" IS NOT NULL AND "error" <> '' AND "finished_at" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "comms"."ai_job" DROP CONSTRAINT IF EXISTS "ai_job_active_unfinished";--> statement-breakpoint
ALTER TABLE "comms"."ai_job" ADD CONSTRAINT "ai_job_active_unfinished" CHECK ("state" NOT IN ('QUEUED', 'RUNNING') OR "finished_at" IS NULL);--> statement-breakpoint
ALTER TABLE "comms"."ai_job" DROP CONSTRAINT IF EXISTS "ai_job_dismiss_only_finished";--> statement-breakpoint
ALTER TABLE "comms"."ai_job" ADD CONSTRAINT "ai_job_dismiss_only_finished" CHECK ("dismissed_at" IS NULL OR "finished_at" IS NOT NULL);--> statement-breakpoint
-- "Is a job already running for this record": the 409 on a second press.
CREATE UNIQUE INDEX IF NOT EXISTS "ai_job_one_active_uq" ON "comms"."ai_job" USING btree ("debrief_id") WHERE "state" IN ('QUEUED', 'RUNNING');--> statement-breakpoint
-- "My jobs, newest first": the tray's read.
CREATE INDEX IF NOT EXISTS "ai_job_actor_idx" ON "comms"."ai_job" USING btree ("actor_id", "created_at" DESC);--> statement-breakpoint

-- 0126's map, one new row. `known` is `EntityKind` copied by hand: a typo would ship a
-- payload the listener's zod refuses, so this refuses it first.
DO $$
DECLARE
	known CONSTANT text[] := ARRAY['lead', 'opportunity', 'account', 'contact',
		'contract', 'workstream', 'meeting', 'comm', 'approval', 'mail', 'campaign',
		'scan', 'ai-job', 'config', 'kpi', 'hold', 'user'];
	m record;
	args text;
BEGIN
	FOR m IN SELECT * FROM (VALUES
		('comms', 'ai_job', ARRAY['ai-job'])
	) AS t(sch, tbl, kinds) LOOP
		IF NOT m.kinds <@ known THEN
			RAISE EXCEPTION 'pv_change: %.% names a kind outside EntityKind: %', m.sch, m.tbl, m.kinds;
		END IF;
		args := (SELECT string_agg(quote_literal(k), ', ') FROM unnest(m.kinds) AS k);
		EXECUTE format('DROP TRIGGER IF EXISTS "pv_change_write" ON %I.%I', m.sch, m.tbl);
		EXECUTE format('CREATE TRIGGER "pv_change_write" AFTER INSERT OR DELETE ON %I.%I '
			'FOR EACH ROW EXECUTE FUNCTION "platform"."notify_entity_change"(%s)', m.sch, m.tbl, args);
		EXECUTE format('DROP TRIGGER IF EXISTS "pv_change_update" ON %I.%I', m.sch, m.tbl);
		EXECUTE format('CREATE TRIGGER "pv_change_update" AFTER UPDATE ON %I.%I '
			'FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) '
			'EXECUTE FUNCTION "platform"."notify_entity_change"(%s)', m.sch, m.tbl, args);
	END LOOP;
END;
$$;--> statement-breakpoint

INSERT INTO "platform"."ai_route"
  ("task", "primary_model", "fallback_model", "max_tokens_in", "max_tokens_out",
   "timeout_ms", "daily_calls_per_user", "daily_token_budget", "enabled")
VALUES ('comm-audio-report', 'gemini-3.8-flash', NULL, NULL, 32768, 540000, 20, 0, false)
ON CONFLICT ("task") DO NOTHING;
