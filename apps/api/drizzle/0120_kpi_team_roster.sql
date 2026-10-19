-- 0120 - KPI teams: `sales.kpi_team` (a named group), `sales.kpi_team_roster`
-- (one header row per month the membership changed) and
-- `sales.kpi_team_member` (who is in which team under that header, ADR 0101).
--
-- The roster in force for month P is the header with the greatest
-- `from_period <= P`. The header is its own table so an emptied roster (every
-- team deleted) still overrides the older one. A person is in at most one team
-- per roster (the member PK), and a team has at most one lead (partial unique
-- on `lead`). A team row is kept for history, so there is no delete path. The
-- period CHECK is copied by hand from 0113's `kpi_allocation_period_shape`.
--
-- Three new empty tables, so the old api is untouched between migrate and
-- deploy. ORDER: migrate BEFORE deploy. Re-runnable: IF NOT EXISTS on tables
-- and indexes, DROP ... IF EXISTS before every ADD CONSTRAINT.
--
-- Hand-written for 0047's reason: `generate`'s baseline is still stuck at 0026.
CREATE TABLE IF NOT EXISTS "sales"."kpi_team" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kpi_team_name_length" CHECK (length(btrim("name")) BETWEEN 1 AND 80)
);--> statement-breakpoint
ALTER TABLE "sales"."kpi_team" DROP CONSTRAINT IF EXISTS "kpi_team_created_by_actor_id_fk";--> statement-breakpoint
ALTER TABLE "sales"."kpi_team" ADD CONSTRAINT "kpi_team_created_by_actor_id_fk" FOREIGN KEY ("created_by") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "sales"."kpi_team_roster" (
	"from_period" text PRIMARY KEY NOT NULL,
	"saved_by" text NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kpi_team_roster_period_shape" CHECK ("from_period" ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$')
);--> statement-breakpoint
ALTER TABLE "sales"."kpi_team_roster" DROP CONSTRAINT IF EXISTS "kpi_team_roster_saved_by_actor_id_fk";--> statement-breakpoint
ALTER TABLE "sales"."kpi_team_roster" ADD CONSTRAINT "kpi_team_roster_saved_by_actor_id_fk" FOREIGN KEY ("saved_by") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "sales"."kpi_team_member" (
	"from_period" text NOT NULL,
	"actor_id" text NOT NULL,
	"team_id" uuid NOT NULL,
	"lead" boolean DEFAULT false NOT NULL,
	CONSTRAINT "kpi_team_member_pk" PRIMARY KEY("from_period","actor_id")
);--> statement-breakpoint
ALTER TABLE "sales"."kpi_team_member" DROP CONSTRAINT IF EXISTS "kpi_team_member_from_period_kpi_team_roster_from_period_fk";--> statement-breakpoint
ALTER TABLE "sales"."kpi_team_member" ADD CONSTRAINT "kpi_team_member_from_period_kpi_team_roster_from_period_fk" FOREIGN KEY ("from_period") REFERENCES "sales"."kpi_team_roster"("from_period") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."kpi_team_member" DROP CONSTRAINT IF EXISTS "kpi_team_member_actor_id_actor_id_fk";--> statement-breakpoint
ALTER TABLE "sales"."kpi_team_member" ADD CONSTRAINT "kpi_team_member_actor_id_actor_id_fk" FOREIGN KEY ("actor_id") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."kpi_team_member" DROP CONSTRAINT IF EXISTS "kpi_team_member_team_id_kpi_team_id_fk";--> statement-breakpoint
ALTER TABLE "sales"."kpi_team_member" ADD CONSTRAINT "kpi_team_member_team_id_kpi_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "sales"."kpi_team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "kpi_team_member_one_lead_uq" ON "sales"."kpi_team_member" USING btree ("from_period","team_id") WHERE "lead";
