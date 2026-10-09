-- 0095 - KPI by role: the agreed, versioned target per (role, month, metric)
-- and each holder's acknowledgement of it. Readings get NO table: they are
-- computed on read.
--
-- A changed target is a new `version`, never an UPDATE of an agreed row, so
-- the version is part of the key. Both four-eyes rules are fences here:
-- `kpi_target_agreed_pair` (who and when, or neither) and
-- `kpi_target_agreed_by_another` (the agreer is not the proposer).
--
-- The seven role ids (`actor_role_ids_known`) and the fourteen `KpiMetricKey`
-- values are copied by hand: a new role or metric must be a migration somebody
-- reads. Which key belongs to which role is NOT fenced - that pairing is
-- `KPI_CATALOG` in the contract, enforced at the propose door.
--
-- All three actor columns are plain foreign keys: only a signed-in person
-- writes these rows. Two new empty tables, so the old api is untouched
-- between migrate and deploy.
--
-- Hand-written for 0047's reason: `generate`'s baseline is still stuck at 0026.
CREATE TABLE "sales"."kpi_target" (
	"role" text NOT NULL,
	"period" text NOT NULL,
	"metric_key" text NOT NULL,
	"version" integer NOT NULL,
	"value" numeric NOT NULL,
	"proposed_by_id" text NOT NULL,
	"proposed_at" timestamp with time zone NOT NULL,
	"agreed_by_id" text,
	"agreed_at" timestamp with time zone,
	CONSTRAINT "kpi_target_pk" PRIMARY KEY("role","period","metric_key","version"),
	CONSTRAINT "kpi_target_role_known" CHECK ("role" IN ('director', 'head-of-sales', 'marketing', 'bd', 'presales', 'sale', 'account-executive')),
	CONSTRAINT "kpi_target_period_shape" CHECK ("period" ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "kpi_target_metric_known" CHECK ("metric_key" IN ('leads-sourced', 'lead-to-opportunity-rate', 'sourced-signed-value', 'opportunities-opened', 'first-response-hours', 'opportunity-accept-rate', 'demos-joined', 'signed-value', 'win-rate', 'debriefs-closed', 'overdue-receivables', 'accept-lag-days', 'collected-value', 'approval-turnaround-hours')),
	CONSTRAINT "kpi_target_version_positive" CHECK ("version" >= 1),
	CONSTRAINT "kpi_target_value_not_negative" CHECK ("value" >= 0),
	CONSTRAINT "kpi_target_agreed_pair" CHECK (("agreed_by_id" IS NULL) = ("agreed_at" IS NULL)),
	CONSTRAINT "kpi_target_agreed_by_another" CHECK ("agreed_by_id" IS NULL OR "agreed_by_id" <> "proposed_by_id")
);--> statement-breakpoint
ALTER TABLE "sales"."kpi_target" ADD CONSTRAINT "kpi_target_proposed_by_id_actor_id_fk" FOREIGN KEY ("proposed_by_id") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."kpi_target" ADD CONSTRAINT "kpi_target_agreed_by_id_actor_id_fk" FOREIGN KEY ("agreed_by_id") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

CREATE TABLE "sales"."kpi_acknowledgement" (
	"actor_id" text NOT NULL,
	"role" text NOT NULL,
	"period" text NOT NULL,
	"acknowledged_at" timestamp with time zone NOT NULL,
	CONSTRAINT "kpi_acknowledgement_pk" PRIMARY KEY("actor_id","role","period"),
	CONSTRAINT "kpi_acknowledgement_role_known" CHECK ("role" IN ('director', 'head-of-sales', 'marketing', 'bd', 'presales', 'sale', 'account-executive')),
	CONSTRAINT "kpi_acknowledgement_period_shape" CHECK ("period" ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$')
);--> statement-breakpoint
ALTER TABLE "sales"."kpi_acknowledgement" ADD CONSTRAINT "kpi_acknowledgement_actor_id_actor_id_fk" FOREIGN KEY ("actor_id") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;
