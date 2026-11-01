-- 0157 - `sales.lead_ai_job`: one press of the lead's AI fill button, run by the `lead.ai-fill`
-- worker and read by the tray (ADR 0131). State, step (0..5) and error-kind lists are
-- copied by hand from @pv/contracts `lead-ai-job.ts`. One active job per lead is a
-- partial UNIQUE, so two racing presses cannot both enqueue. Joins `pv_change` under
-- the new kind 'ai-job', checked against 0126's hand-copied `EntityKind` list.
-- `lead-enrich` timeout 30 s -> 60 s: the fill no longer blocks a request. Only a route
-- still on 0156's value moves. Between migrate and deploy the old api's blocking fill
-- (two calls in sequence) may hold one request for up to about 120 s.
-- Additive. ORDER: migrate BEFORE deploy - the old api never reads the table. Re-runnable:
-- IF NOT EXISTS, DROP ... IF EXISTS before ADD, guarded UPDATE. Hand-written for 0047's reason.
-- The FKs take a lock on `sales.lead` and `platform.actor` that every writer queues
-- behind: give up after 10 s instead. Lasts to the migrator's commit (one transaction).
SET LOCAL lock_timeout = '10s';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sales"."lead_ai_job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_code" text NOT NULL,
	"actor_id" text NOT NULL,
	"state" text DEFAULT 'QUEUED' NOT NULL,
	"step" smallint DEFAULT 0 NOT NULL,
	"step_ms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"result" jsonb,
	"error_kind" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	"undone_at" timestamp with time zone
);--> statement-breakpoint
ALTER TABLE "sales"."lead_ai_job" DROP CONSTRAINT IF EXISTS "lead_ai_job_lead_code_lead_code_fk";--> statement-breakpoint
ALTER TABLE "sales"."lead_ai_job" ADD CONSTRAINT "lead_ai_job_lead_code_lead_code_fk" FOREIGN KEY ("lead_code") REFERENCES "sales"."lead"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."lead_ai_job" DROP CONSTRAINT IF EXISTS "lead_ai_job_actor_id_actor_id_fk";--> statement-breakpoint
ALTER TABLE "sales"."lead_ai_job" ADD CONSTRAINT "lead_ai_job_actor_id_actor_id_fk" FOREIGN KEY ("actor_id") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."lead_ai_job" DROP CONSTRAINT IF EXISTS "lead_ai_job_state_known";--> statement-breakpoint
ALTER TABLE "sales"."lead_ai_job" ADD CONSTRAINT "lead_ai_job_state_known" CHECK ("state" IN ('QUEUED', 'RUNNING', 'DONE', 'FAILED'));--> statement-breakpoint
ALTER TABLE "sales"."lead_ai_job" DROP CONSTRAINT IF EXISTS "lead_ai_job_error_kind_known";--> statement-breakpoint
ALTER TABLE "sales"."lead_ai_job" ADD CONSTRAINT "lead_ai_job_error_kind_known" CHECK ("error_kind" IS NULL OR "error_kind" IN ('unavailable', 'busy', 'limit', 'failed'));--> statement-breakpoint
-- Five steps: read-lead, web-search, tax-lookup, dup-check, write.
ALTER TABLE "sales"."lead_ai_job" DROP CONSTRAINT IF EXISTS "lead_ai_job_step_range";--> statement-breakpoint
ALTER TABLE "sales"."lead_ai_job" ADD CONSTRAINT "lead_ai_job_step_range" CHECK ("step" BETWEEN 0 AND 5);--> statement-breakpoint
-- One duration per completed step: `step` and `step_ms` move in one UPDATE.
ALTER TABLE "sales"."lead_ai_job" DROP CONSTRAINT IF EXISTS "lead_ai_job_step_ms_per_step";--> statement-breakpoint
ALTER TABLE "sales"."lead_ai_job" ADD CONSTRAINT "lead_ai_job_step_ms_per_step" CHECK (jsonb_typeof("step_ms") = 'array' AND jsonb_array_length("step_ms") = "step");--> statement-breakpoint
ALTER TABLE "sales"."lead_ai_job" DROP CONSTRAINT IF EXISTS "lead_ai_job_done_has_result";--> statement-breakpoint
ALTER TABLE "sales"."lead_ai_job" ADD CONSTRAINT "lead_ai_job_done_has_result" CHECK ("state" <> 'DONE' OR ("result" IS NOT NULL AND "finished_at" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "sales"."lead_ai_job" DROP CONSTRAINT IF EXISTS "lead_ai_job_failed_has_error";--> statement-breakpoint
ALTER TABLE "sales"."lead_ai_job" ADD CONSTRAINT "lead_ai_job_failed_has_error" CHECK ("state" <> 'FAILED' OR ("error_kind" IS NOT NULL AND "error" IS NOT NULL AND "error" <> '' AND "finished_at" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "sales"."lead_ai_job" DROP CONSTRAINT IF EXISTS "lead_ai_job_active_unfinished";--> statement-breakpoint
ALTER TABLE "sales"."lead_ai_job" ADD CONSTRAINT "lead_ai_job_active_unfinished" CHECK ("state" NOT IN ('QUEUED', 'RUNNING') OR "finished_at" IS NULL);--> statement-breakpoint
ALTER TABLE "sales"."lead_ai_job" DROP CONSTRAINT IF EXISTS "lead_ai_job_undo_only_done";--> statement-breakpoint
ALTER TABLE "sales"."lead_ai_job" ADD CONSTRAINT "lead_ai_job_undo_only_done" CHECK ("undone_at" IS NULL OR "state" = 'DONE');--> statement-breakpoint
ALTER TABLE "sales"."lead_ai_job" DROP CONSTRAINT IF EXISTS "lead_ai_job_dismiss_only_finished";--> statement-breakpoint
ALTER TABLE "sales"."lead_ai_job" ADD CONSTRAINT "lead_ai_job_dismiss_only_finished" CHECK ("dismissed_at" IS NULL OR "finished_at" IS NOT NULL);--> statement-breakpoint
-- "Is a job already running for this lead": the 409 on a second press, and the sweeper's active set.
CREATE UNIQUE INDEX IF NOT EXISTS "lead_ai_job_one_active_uq" ON "sales"."lead_ai_job" USING btree ("lead_code") WHERE "state" IN ('QUEUED', 'RUNNING');--> statement-breakpoint
-- "My jobs, newest first": the tray's only read.
CREATE INDEX IF NOT EXISTS "lead_ai_job_actor_idx" ON "sales"."lead_ai_job" USING btree ("actor_id", "created_at" DESC);--> statement-breakpoint

-- 0126's map, one new row. `known` is `EntityKind` copied by hand, now with 'ai-job':
-- a typo would ship a payload the listener's zod refuses, so this refuses it first.
DO $$
DECLARE
	known CONSTANT text[] := ARRAY['lead', 'opportunity', 'account', 'contact',
		'contract', 'workstream', 'meeting', 'comm', 'approval', 'mail', 'campaign',
		'scan', 'ai-job', 'config', 'kpi', 'hold', 'user'];
	m record;
	args text;
BEGIN
	FOR m IN SELECT * FROM (VALUES
		('sales', 'lead_ai_job', ARRAY['ai-job'])
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

UPDATE "platform"."ai_route" SET "timeout_ms" = 60000
WHERE "task" = 'lead-enrich' AND "timeout_ms" = 30000;
