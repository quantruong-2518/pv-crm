-- 0135 - `acked_by_default` on a KPI allocation line: a lapsed line carried into
-- a reissued package keeps reading `lapsed` rather than "confirmed" (ADR 0114 §1).
-- The CHECK lets the flag stand only on an `acknowledged` line.
--
-- NOT NULL DEFAULT false: every existing row is a real answer or none, so false
-- is true of it; packages reissued before 0135 are not backfilled (ADR 0114,
-- default 3). The old api never names the column, so its writes take the default
-- and pass the CHECK. ORDER: migrate BEFORE deploy.
-- Re-runnable: IF NOT EXISTS on the column, DROP ... IF EXISTS before the ADD.
--
-- Hand-written for 0047's reason: `generate`'s baseline is still stuck at 0026.
ALTER TABLE "sales"."kpi_allocation_line" ADD COLUMN IF NOT EXISTS "acked_by_default" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sales"."kpi_allocation_line" DROP CONSTRAINT IF EXISTS "kpi_allocation_line_default_is_acked";--> statement-breakpoint
ALTER TABLE "sales"."kpi_allocation_line" ADD CONSTRAINT "kpi_allocation_line_default_is_acked" CHECK (NOT "acked_by_default" OR "ack_status" = 'acknowledged');
