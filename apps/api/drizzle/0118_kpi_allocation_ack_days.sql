-- 0118 - the acknowledgement deadline of a KPI package: `ack_days`, the whole
-- days the holders have to answer, counted from the day the package was agreed
-- (ADR 0099 §6). The due date is derived on read, never stored or swept.
--
-- Nullable on purpose: packages agreed before this column have no deadline and
-- stay NULL. One new nullable column, so the old api is untouched between
-- migrate and deploy. ORDER: migrate BEFORE deploy.
-- Re-runnable: IF NOT EXISTS on the column, DROP ... IF EXISTS before the ADD.
--
-- Hand-written for 0047's reason: `generate`'s baseline is still stuck at 0026.
ALTER TABLE "sales"."kpi_allocation" ADD COLUMN IF NOT EXISTS "ack_days" integer;--> statement-breakpoint
ALTER TABLE "sales"."kpi_allocation" DROP CONSTRAINT IF EXISTS "kpi_allocation_ack_days_range";--> statement-breakpoint
ALTER TABLE "sales"."kpi_allocation" ADD CONSTRAINT "kpi_allocation_ack_days_range" CHECK ("ack_days" IS NULL OR "ack_days" BETWEEN 1 AND 31);
