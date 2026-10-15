-- 0113 - per-person KPI allocation: `sales.kpi_allocation` (one role's monthly
-- package, versioned), `sales.kpi_allocation_line` (one person x metric) and
-- `sales.kpi_counter` (a holder's counter-proposal on one line). Plus two
-- `platform.setting` keys for the slip/hit alert thresholds, in whole percent:
-- the column is `integer`, so 0.8 is stored as 80. Their defaults live in
-- `SETTING_REGISTRY`, not here; a row is only ever an override.
--
-- Every CHECK list (roles, month key, the fourteen metric keys, each status)
-- is copied by hand from `kpi.schema.ts` and the contract. Four-eyes on the
-- package is a CHECK (`kpi_allocation_decided_by_another`); the service still
-- guards it first. Three new empty tables and a widened key list (0080's nine
-- keys plus the two `kpi.alert.*`), so the old api is untouched between
-- migrate and deploy. ORDER: migrate BEFORE deploy.
--
-- Written as 0110 and renumbered when it met the other line's 0110/0111:
-- drizzle had skipped it on a database whose newest applied `when` was 0112's.
-- Re-runnable for that reason: IF NOT EXISTS on tables and indexes, and
-- DROP ... IF EXISTS before every ADD CONSTRAINT.
--
-- Hand-written for 0047's reason: `generate`'s baseline is still stuck at 0026.
CREATE TABLE IF NOT EXISTS "sales"."kpi_allocation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period" text NOT NULL,
	"role" text NOT NULL,
	"version" integer NOT NULL,
	"status" text NOT NULL,
	"submitted_by" text NOT NULL,
	"submitted_at" timestamp with time zone,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"return_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kpi_allocation_version_uq" UNIQUE("period","role","version"),
	CONSTRAINT "kpi_allocation_period_shape" CHECK ("period" ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "kpi_allocation_role_known" CHECK ("role" IN ('director', 'head-of-sales', 'marketing', 'bd', 'presales', 'sale', 'account-executive')),
	CONSTRAINT "kpi_allocation_version_positive" CHECK ("version" >= 1),
	CONSTRAINT "kpi_allocation_status_known" CHECK ("status" IN ('draft', 'submitted', 'returned', 'agreed', 'superseded')),
	CONSTRAINT "kpi_allocation_submitted_stamp" CHECK (("status" = 'draft') = ("submitted_at" IS NULL)),
	CONSTRAINT "kpi_allocation_decided_pair" CHECK (("decided_by" IS NULL) = ("decided_at" IS NULL)),
	CONSTRAINT "kpi_allocation_decision_matches_status" CHECK (("status" NOT IN ('returned', 'agreed') OR "decided_at" IS NOT NULL) AND ("status" NOT IN ('draft', 'submitted') OR "decided_at" IS NULL)),
	CONSTRAINT "kpi_allocation_decided_by_another" CHECK ("decided_by" IS NULL OR "decided_by" <> "submitted_by"),
	CONSTRAINT "kpi_allocation_returned_has_reason" CHECK ("status" <> 'returned' OR length(btrim(coalesce("return_reason", ''))) > 0),
	CONSTRAINT "kpi_allocation_reason_only_when_returned" CHECK ("status" NOT IN ('draft', 'submitted', 'agreed') OR "return_reason" IS NULL)
);--> statement-breakpoint
ALTER TABLE "sales"."kpi_allocation" DROP CONSTRAINT IF EXISTS "kpi_allocation_submitted_by_actor_id_fk";--> statement-breakpoint
ALTER TABLE "sales"."kpi_allocation" ADD CONSTRAINT "kpi_allocation_submitted_by_actor_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."kpi_allocation" DROP CONSTRAINT IF EXISTS "kpi_allocation_decided_by_actor_id_fk";--> statement-breakpoint
ALTER TABLE "sales"."kpi_allocation" ADD CONSTRAINT "kpi_allocation_decided_by_actor_id_fk" FOREIGN KEY ("decided_by") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "kpi_allocation_one_live_uq" ON "sales"."kpi_allocation" USING btree ("period","role") WHERE "status" IN ('draft', 'submitted', 'returned', 'agreed');--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "sales"."kpi_allocation_line" (
	"allocation_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"metric_key" text NOT NULL,
	"value" numeric NOT NULL,
	"ack_status" text DEFAULT 'pending' NOT NULL,
	"acked_at" timestamp with time zone,
	CONSTRAINT "kpi_allocation_line_pk" PRIMARY KEY("allocation_id","actor_id","metric_key"),
	CONSTRAINT "kpi_allocation_line_metric_known" CHECK ("metric_key" IN ('leads-sourced', 'lead-to-opportunity-rate', 'sourced-signed-value', 'opportunities-opened', 'first-response-hours', 'opportunity-accept-rate', 'demos-joined', 'signed-value', 'win-rate', 'debriefs-closed', 'overdue-receivables', 'accept-lag-days', 'collected-value', 'approval-turnaround-hours')),
	CONSTRAINT "kpi_allocation_line_value_not_negative" CHECK ("value" >= 0),
	CONSTRAINT "kpi_allocation_line_ack_known" CHECK ("ack_status" IN ('pending', 'acknowledged', 'countered')),
	CONSTRAINT "kpi_allocation_line_acked_stamp" CHECK (("ack_status" = 'pending') = ("acked_at" IS NULL))
);--> statement-breakpoint
ALTER TABLE "sales"."kpi_allocation_line" DROP CONSTRAINT IF EXISTS "kpi_allocation_line_allocation_id_kpi_allocation_id_fk";--> statement-breakpoint
ALTER TABLE "sales"."kpi_allocation_line" ADD CONSTRAINT "kpi_allocation_line_allocation_id_kpi_allocation_id_fk" FOREIGN KEY ("allocation_id") REFERENCES "sales"."kpi_allocation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."kpi_allocation_line" DROP CONSTRAINT IF EXISTS "kpi_allocation_line_actor_id_actor_id_fk";--> statement-breakpoint
ALTER TABLE "sales"."kpi_allocation_line" ADD CONSTRAINT "kpi_allocation_line_actor_id_actor_id_fk" FOREIGN KEY ("actor_id") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "sales"."kpi_counter" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"allocation_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"metric_key" text NOT NULL,
	"proposed_value" numeric NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolved_by" text,
	"resolved_at" timestamp with time zone,
	"counter_value" numeric,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kpi_counter_status_known" CHECK ("status" IN ('open', 'accepted', 'kept', 'countered')),
	CONSTRAINT "kpi_counter_proposed_not_negative" CHECK ("proposed_value" >= 0),
	CONSTRAINT "kpi_counter_reason_present" CHECK (length(btrim("reason")) > 0),
	CONSTRAINT "kpi_counter_resolved_pair" CHECK (("resolved_by" IS NULL) = ("resolved_at" IS NULL) AND ("status" = 'open') = ("resolved_at" IS NULL)),
	CONSTRAINT "kpi_counter_value_on_countered" CHECK (("status" = 'countered') = ("counter_value" IS NOT NULL) AND ("counter_value" IS NULL OR "counter_value" >= 0)),
	CONSTRAINT "kpi_counter_resolved_by_another" CHECK ("resolved_by" IS NULL OR "resolved_by" <> "actor_id")
);--> statement-breakpoint
ALTER TABLE "sales"."kpi_counter" DROP CONSTRAINT IF EXISTS "kpi_counter_line_fk";--> statement-breakpoint
ALTER TABLE "sales"."kpi_counter" ADD CONSTRAINT "kpi_counter_line_fk" FOREIGN KEY ("allocation_id","actor_id","metric_key") REFERENCES "sales"."kpi_allocation_line"("allocation_id","actor_id","metric_key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."kpi_counter" DROP CONSTRAINT IF EXISTS "kpi_counter_resolved_by_actor_id_fk";--> statement-breakpoint
ALTER TABLE "sales"."kpi_counter" ADD CONSTRAINT "kpi_counter_resolved_by_actor_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "kpi_counter_one_open_uq" ON "sales"."kpi_counter" USING btree ("allocation_id","actor_id","metric_key") WHERE "status" = 'open';--> statement-breakpoint

ALTER TABLE "platform"."setting" DROP CONSTRAINT IF EXISTS "setting_key_known";--> statement-breakpoint
ALTER TABLE "platform"."setting" ADD CONSTRAINT "setting_key_known" CHECK ("key" IN ('comms.reply.silence-days', 'comms.unmatched.retention-days', 'comms.blob.retention-days', 'sequence.step.default-wait-days', 'sequence.max-steps', 'content.share.expires-days', 'sales.activity.warn-days', 'sales.activity.alert-days', 'auth.session.remembered-days', 'kpi.alert.slip-percent', 'kpi.alert.hit-percent'));
