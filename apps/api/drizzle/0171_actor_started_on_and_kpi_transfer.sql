-- 0171 - `platform.actor.started_on`, `sales.kpi_transfer` and `kpi_assignment_line.added_at` (ADR 0156). started_on is the
-- first working day for the ramp; NULL = fully ramped, so no backfill and every old actor
-- keeps today's targets. kpi_transfer hands a leaver's month to a receiver from `from_day`
-- on; `to_actor_id` NULL = no receiver. One transfer per leaver per month (UNIQUE).
-- The period shape is copied by hand from `kpi-allocation.schema.ts`.
-- Additive. ORDER: migrate BEFORE deploy - the old api never reads either. Re-runnable:
-- IF NOT EXISTS, DROP ... IF EXISTS before ADD. Hand-written for 0047's reason.
-- ADD COLUMN and the FKs lock `platform.actor`, which every writer queues behind:
-- give up after 10 s instead. Lasts to the migrator's commit (one transaction).
SET LOCAL lock_timeout = '10s';--> statement-breakpoint
ALTER TABLE "platform"."actor" ADD COLUMN IF NOT EXISTS "started_on" date;--> statement-breakpoint
ALTER TABLE "sales"."kpi_assignment_line" ADD COLUMN IF NOT EXISTS "added_at" timestamp with time zone;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sales"."kpi_transfer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period" text NOT NULL,
	"from_actor_id" text NOT NULL,
	"to_actor_id" text,
	"from_day" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kpi_transfer_period_from_uq" UNIQUE("period","from_actor_id")
);--> statement-breakpoint
ALTER TABLE "sales"."kpi_transfer" DROP CONSTRAINT IF EXISTS "kpi_transfer_from_actor_id_actor_id_fk";--> statement-breakpoint
ALTER TABLE "sales"."kpi_transfer" ADD CONSTRAINT "kpi_transfer_from_actor_id_actor_id_fk" FOREIGN KEY ("from_actor_id") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."kpi_transfer" DROP CONSTRAINT IF EXISTS "kpi_transfer_to_actor_id_actor_id_fk";--> statement-breakpoint
ALTER TABLE "sales"."kpi_transfer" ADD CONSTRAINT "kpi_transfer_to_actor_id_actor_id_fk" FOREIGN KEY ("to_actor_id") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."kpi_transfer" DROP CONSTRAINT IF EXISTS "kpi_transfer_period_shape";--> statement-breakpoint
ALTER TABLE "sales"."kpi_transfer" ADD CONSTRAINT "kpi_transfer_period_shape" CHECK ("period" ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$');--> statement-breakpoint
ALTER TABLE "sales"."kpi_transfer" DROP CONSTRAINT IF EXISTS "kpi_transfer_not_self";--> statement-breakpoint
ALTER TABLE "sales"."kpi_transfer" ADD CONSTRAINT "kpi_transfer_not_self" CHECK ("from_actor_id" <> "to_actor_id");
