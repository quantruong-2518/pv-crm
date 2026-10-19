-- 0120 - month close: `sales.kpi_month_close` (one row per closed month, who
-- and when) and `sales.kpi_month_value` (every reading the cards showed that
-- month, frozen). A month with no close row is still live (ADR 0100).
--
-- `kpi_month_value.actor_id` is NULL for a room seat (company-wide reading),
-- so uniqueness is an expression index on `coalesce("actor_id", '')`: a plain
-- UNIQUE treats two NULLs as different and would let a seat be frozen twice.
-- The actor ids are text (`platform.actor.id`), hence '' and not 0. `value`
-- is NULL where the reading had no data that month. Every CHECK list (month
-- key, roles, the fourteen metric keys) is copied by hand from 0113.
-- There is no unlock: the rows are never updated or deleted by the api.
--
-- Two new empty tables, so the old api is untouched between migrate and
-- deploy. ORDER: migrate BEFORE deploy. Re-runnable: IF NOT EXISTS on tables
-- and indexes, DROP ... IF EXISTS before every ADD CONSTRAINT.
--
-- Hand-written for 0047's reason: `generate`'s baseline is still stuck at 0026.
CREATE TABLE IF NOT EXISTS "sales"."kpi_month_close" (
	"period" text PRIMARY KEY NOT NULL,
	"closed_by_id" text NOT NULL,
	"closed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kpi_month_close_period_shape" CHECK ("period" ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$')
);--> statement-breakpoint
ALTER TABLE "sales"."kpi_month_close" DROP CONSTRAINT IF EXISTS "kpi_month_close_closed_by_id_actor_id_fk";--> statement-breakpoint
ALTER TABLE "sales"."kpi_month_close" ADD CONSTRAINT "kpi_month_close_closed_by_id_actor_id_fk" FOREIGN KEY ("closed_by_id") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "sales"."kpi_month_value" (
	"period" text NOT NULL,
	"role" text NOT NULL,
	"actor_id" text,
	"metric_key" text NOT NULL,
	"value" numeric,
	CONSTRAINT "kpi_month_value_period_shape" CHECK ("period" ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "kpi_month_value_role_known" CHECK ("role" IN ('director', 'head-of-sales', 'marketing', 'bd', 'presales', 'sale', 'account-executive')),
	CONSTRAINT "kpi_month_value_metric_known" CHECK ("metric_key" IN ('leads-sourced', 'lead-to-opportunity-rate', 'sourced-signed-value', 'opportunities-opened', 'first-response-hours', 'opportunity-accept-rate', 'demos-joined', 'signed-value', 'win-rate', 'debriefs-closed', 'overdue-receivables', 'accept-lag-days', 'collected-value', 'approval-turnaround-hours'))
);--> statement-breakpoint
ALTER TABLE "sales"."kpi_month_value" DROP CONSTRAINT IF EXISTS "kpi_month_value_period_kpi_month_close_period_fk";--> statement-breakpoint
ALTER TABLE "sales"."kpi_month_value" ADD CONSTRAINT "kpi_month_value_period_kpi_month_close_period_fk" FOREIGN KEY ("period") REFERENCES "sales"."kpi_month_close"("period") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."kpi_month_value" DROP CONSTRAINT IF EXISTS "kpi_month_value_actor_id_actor_id_fk";--> statement-breakpoint
ALTER TABLE "sales"."kpi_month_value" ADD CONSTRAINT "kpi_month_value_actor_id_actor_id_fk" FOREIGN KEY ("actor_id") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "kpi_month_value_seat_uq" ON "sales"."kpi_month_value" USING btree ("period","role",coalesce("actor_id", ''),"metric_key");
