-- 0114 - KPI configuration and alert memory: `sales.kpi_role_metric` (a
-- director's override of `KPI_CATALOG`: a metric switched on or off for a role,
-- and which one is the role's headline) and `sales.kpi_alert_sent` (one row per
-- slip/hit alert rung, so the daily sweep never rings the same person about
-- the same metric and flag twice in one month).
--
-- `kpi_role_metric` is an overlay, as `platform.setting` is: a missing row is
-- the code default, so no data is seeded here. Every CHECK list (roles, month
-- key, the fourteen metric keys, the flag) is copied by hand from
-- `kpi.schema.ts` and the contract. Two new empty tables, so the old api is
-- untouched between migrate and deploy. ORDER: migrate BEFORE deploy.
--
-- Written as 0111 and renumbered with 0113, for the same reason. Re-runnable:
-- IF NOT EXISTS on tables and indexes, DROP ... IF EXISTS before each ADD.
--
-- Hand-written for 0047's reason: `generate`'s baseline is still stuck at 0026.
CREATE TABLE IF NOT EXISTS "sales"."kpi_role_metric" (
	"role" text NOT NULL,
	"metric_key" text NOT NULL,
	"enabled" boolean NOT NULL,
	"is_primary" boolean NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kpi_role_metric_pk" PRIMARY KEY("role","metric_key"),
	CONSTRAINT "kpi_role_metric_role_known" CHECK ("role" IN ('director', 'head-of-sales', 'marketing', 'bd', 'presales', 'sale', 'account-executive')),
	CONSTRAINT "kpi_role_metric_metric_known" CHECK ("metric_key" IN ('leads-sourced', 'lead-to-opportunity-rate', 'sourced-signed-value', 'opportunities-opened', 'first-response-hours', 'opportunity-accept-rate', 'demos-joined', 'signed-value', 'win-rate', 'debriefs-closed', 'overdue-receivables', 'accept-lag-days', 'collected-value', 'approval-turnaround-hours')),
	CONSTRAINT "kpi_role_metric_primary_enabled" CHECK (NOT "is_primary" OR "enabled")
);--> statement-breakpoint
ALTER TABLE "sales"."kpi_role_metric" DROP CONSTRAINT IF EXISTS "kpi_role_metric_updated_by_actor_id_fk";--> statement-breakpoint
ALTER TABLE "sales"."kpi_role_metric" ADD CONSTRAINT "kpi_role_metric_updated_by_actor_id_fk" FOREIGN KEY ("updated_by") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "kpi_role_metric_one_primary_uq" ON "sales"."kpi_role_metric" USING btree ("role") WHERE "is_primary";--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "sales"."kpi_alert_sent" (
	"period" text NOT NULL,
	"actor_id" text NOT NULL,
	"role" text NOT NULL,
	"metric_key" text NOT NULL,
	"flag" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kpi_alert_sent_pk" PRIMARY KEY("period","actor_id","role","metric_key","flag"),
	CONSTRAINT "kpi_alert_sent_period_shape" CHECK ("period" ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "kpi_alert_sent_role_known" CHECK ("role" IN ('director', 'head-of-sales', 'marketing', 'bd', 'presales', 'sale', 'account-executive')),
	CONSTRAINT "kpi_alert_sent_metric_known" CHECK ("metric_key" IN ('leads-sourced', 'lead-to-opportunity-rate', 'sourced-signed-value', 'opportunities-opened', 'first-response-hours', 'opportunity-accept-rate', 'demos-joined', 'signed-value', 'win-rate', 'debriefs-closed', 'overdue-receivables', 'accept-lag-days', 'collected-value', 'approval-turnaround-hours')),
	CONSTRAINT "kpi_alert_sent_flag_known" CHECK ("flag" IN ('slip', 'hit'))
);--> statement-breakpoint
ALTER TABLE "sales"."kpi_alert_sent" DROP CONSTRAINT IF EXISTS "kpi_alert_sent_actor_id_actor_id_fk";--> statement-breakpoint
ALTER TABLE "sales"."kpi_alert_sent" ADD CONSTRAINT "kpi_alert_sent_actor_id_actor_id_fk" FOREIGN KEY ("actor_id") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;
