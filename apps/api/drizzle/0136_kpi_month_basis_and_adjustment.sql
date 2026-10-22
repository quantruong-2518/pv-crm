-- 0136 - a closed month's records are frozen too; later changes to them become
-- adjustments in the running month (ADR 0115). `kpi_month_basis` keeps every basis
-- row a close froze, `kpi_adjustment` the signed differences the reconcile finds;
-- both append-only. `kpi_month_close.basis_frozen` marks a close that copied its
-- basis: a quiet month has no rows, yet is not a pre-0136 month (those take false).
--
-- `series` is `seriesKey`'s seat key: a length CHECK, not a list, so a metric added
-- in code never refuses a close. `actor_id` is NULL on a room series. `applied_period`
-- is shape-checked, not an FK: the running month has no close row. Cause list copied
-- by hand. Both tables join the `pv_change` map (0126) under 'kpi', as the close's
-- other tables do, so open KPI screens refresh when the sweep writes adjustments.
--
-- Additive: the old api never names the tables and takes the column's default.
-- ORDER: migrate BEFORE deploy. Re-runnable: IF [NOT] EXISTS, DROP before every ADD.
-- Hand-written for 0047's reason: `generate`'s baseline is still stuck at 0026.
ALTER TABLE "sales"."kpi_month_close" ADD COLUMN IF NOT EXISTS "basis_frozen" boolean DEFAULT false NOT NULL;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "sales"."kpi_month_basis" (
	"period" text NOT NULL,
	"series" text NOT NULL,
	"actor_id" text,
	"kind" text,
	"code" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"value" numeric,
	"tag" text,
	CONSTRAINT "kpi_month_basis_series_sane" CHECK (char_length("series") BETWEEN 3 AND 120)
);--> statement-breakpoint
ALTER TABLE "sales"."kpi_month_basis" DROP CONSTRAINT IF EXISTS "kpi_month_basis_period_kpi_month_close_period_fk";--> statement-breakpoint
ALTER TABLE "sales"."kpi_month_basis" ADD CONSTRAINT "kpi_month_basis_period_kpi_month_close_period_fk" FOREIGN KEY ("period") REFERENCES "sales"."kpi_month_close"("period") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."kpi_month_basis" DROP CONSTRAINT IF EXISTS "kpi_month_basis_actor_id_actor_id_fk";--> statement-breakpoint
ALTER TABLE "sales"."kpi_month_basis" ADD CONSTRAINT "kpi_month_basis_actor_id_actor_id_fk" FOREIGN KEY ("actor_id") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kpi_month_basis_series_idx" ON "sales"."kpi_month_basis" USING btree ("period","series");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "sales"."kpi_adjustment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_period" text NOT NULL,
	"applied_period" text NOT NULL,
	"series" text NOT NULL,
	"actor_id" text,
	"kind" text,
	"tag" text,
	"code" text NOT NULL,
	"delta" numeric NOT NULL,
	"cause" text NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kpi_adjustment_applied_period_shape" CHECK ("applied_period" ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "kpi_adjustment_applies_later" CHECK ("applied_period" > "source_period"),
	CONSTRAINT "kpi_adjustment_series_sane" CHECK (char_length("series") BETWEEN 3 AND 120),
	CONSTRAINT "kpi_adjustment_cause_known" CHECK ("cause" IN ('appeared', 'vanished', 'changed'))
);--> statement-breakpoint
ALTER TABLE "sales"."kpi_adjustment" DROP CONSTRAINT IF EXISTS "kpi_adjustment_source_period_kpi_month_close_period_fk";--> statement-breakpoint
ALTER TABLE "sales"."kpi_adjustment" ADD CONSTRAINT "kpi_adjustment_source_period_kpi_month_close_period_fk" FOREIGN KEY ("source_period") REFERENCES "sales"."kpi_month_close"("period") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."kpi_adjustment" DROP CONSTRAINT IF EXISTS "kpi_adjustment_actor_id_actor_id_fk";--> statement-breakpoint
ALTER TABLE "sales"."kpi_adjustment" ADD CONSTRAINT "kpi_adjustment_actor_id_actor_id_fk" FOREIGN KEY ("actor_id") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kpi_adjustment_applied_idx" ON "sales"."kpi_adjustment" USING btree ("applied_period","series");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kpi_adjustment_source_idx" ON "sales"."kpi_adjustment" USING btree ("source_period","series",coalesce("actor_id", ''),"code");--> statement-breakpoint

DROP TRIGGER IF EXISTS "pv_change_write" ON "sales"."kpi_month_basis";--> statement-breakpoint
CREATE TRIGGER "pv_change_write" AFTER INSERT OR DELETE ON "sales"."kpi_month_basis" FOR EACH ROW EXECUTE FUNCTION "platform"."notify_entity_change"('kpi');--> statement-breakpoint
DROP TRIGGER IF EXISTS "pv_change_update" ON "sales"."kpi_month_basis";--> statement-breakpoint
CREATE TRIGGER "pv_change_update" AFTER UPDATE ON "sales"."kpi_month_basis" FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION "platform"."notify_entity_change"('kpi');--> statement-breakpoint
DROP TRIGGER IF EXISTS "pv_change_write" ON "sales"."kpi_adjustment";--> statement-breakpoint
CREATE TRIGGER "pv_change_write" AFTER INSERT OR DELETE ON "sales"."kpi_adjustment" FOR EACH ROW EXECUTE FUNCTION "platform"."notify_entity_change"('kpi');--> statement-breakpoint
DROP TRIGGER IF EXISTS "pv_change_update" ON "sales"."kpi_adjustment";--> statement-breakpoint
CREATE TRIGGER "pv_change_update" AFTER UPDATE ON "sales"."kpi_adjustment" FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION "platform"."notify_entity_change"('kpi');
