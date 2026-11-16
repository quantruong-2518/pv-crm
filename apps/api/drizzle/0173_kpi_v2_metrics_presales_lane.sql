-- 0173 - KPI v2 from 2027-01 (ADR 0160). Six metric keys join `KpiMetricKey` (sixteen plus six:
-- twenty-two): mql-reached, lead-to-mql-rate, cost-per-mql, presales-signed-value,
-- on-time-collection-rate, solution-days. Seven lists widen: kpi_target, kpi_allocation_line,
-- kpi_allocation_share, kpi_assignment_line, kpi_month_value, kpi_role_metric, kpi_alert_sent.
-- `kpi_role_metric` becomes a set versioned by month: `from_period` (rows already there get
-- '2000-01', earlier than any real month, so they keep applying to every v1 month) and a
-- nullable percent `weight`. The new `kpi_funnel_target` and `kpi_marketing_budget` hold the
-- funnel step targets and the Marketing budget. `touch_kind_known` gains `solution-sent` (0101's
-- twenty-nine plus one: thirty); the two owner-role lists gain `PRESALES`. Lists copied by hand.
--
-- `kpi_marketing_budget.unit_id` has no FK, like `kpi_assignment.unit_id`: `org_node` is keyed
-- (from_period, unit_id), so a unit id alone is not unique there.
-- `opportunity_owner_primary_is_sale` and `contract_participant_primary_is_sale` stay as they
-- are: PRESALES, like BD, never carries the primary flag, so both one-primary indexes still hold.
--
-- Every existing row stays valid, but NOT backward compatible with the old build. ORDER: migrate
-- BEFORE deploy. Until the new build is live, the old api's config save (delete + insert on
-- kpi_role_metric) fails on the NOT NULL `from_period` instead of silently writing a v1 set.
-- Re-runnable: IF NOT EXISTS, DROP ... IF EXISTS before every ADD. Hand-written for 0047's reason.
-- Each ADD scans its table under a lock: give up after 10 s instead of queueing writers.
SET LOCAL lock_timeout = '10s';--> statement-breakpoint

ALTER TABLE "sales"."kpi_target" DROP CONSTRAINT IF EXISTS "kpi_target_metric_known";--> statement-breakpoint
ALTER TABLE "sales"."kpi_target" ADD CONSTRAINT "kpi_target_metric_known" CHECK ("metric_key" IN ('leads-sourced', 'lead-to-opportunity-rate', 'sourced-signed-value', 'opportunities-opened', 'first-response-hours', 'opportunity-accept-rate', 'demos-joined', 'signed-value', 'win-rate', 'debriefs-closed', 'overdue-receivables', 'accept-lag-days', 'collected-value', 'approval-turnaround-hours', 'quotes-sent', 'sales-cycle-days', 'mql-reached', 'lead-to-mql-rate', 'cost-per-mql', 'presales-signed-value', 'on-time-collection-rate', 'solution-days'));--> statement-breakpoint

ALTER TABLE "sales"."kpi_allocation_line" DROP CONSTRAINT IF EXISTS "kpi_allocation_line_metric_known";--> statement-breakpoint
ALTER TABLE "sales"."kpi_allocation_line" ADD CONSTRAINT "kpi_allocation_line_metric_known" CHECK ("metric_key" IN ('leads-sourced', 'lead-to-opportunity-rate', 'sourced-signed-value', 'opportunities-opened', 'first-response-hours', 'opportunity-accept-rate', 'demos-joined', 'signed-value', 'win-rate', 'debriefs-closed', 'overdue-receivables', 'accept-lag-days', 'collected-value', 'approval-turnaround-hours', 'quotes-sent', 'sales-cycle-days', 'mql-reached', 'lead-to-mql-rate', 'cost-per-mql', 'presales-signed-value', 'on-time-collection-rate', 'solution-days'));--> statement-breakpoint

ALTER TABLE "sales"."kpi_allocation_share" DROP CONSTRAINT IF EXISTS "kpi_allocation_share_metric_known";--> statement-breakpoint
ALTER TABLE "sales"."kpi_allocation_share" ADD CONSTRAINT "kpi_allocation_share_metric_known" CHECK ("metric_key" IN ('leads-sourced', 'lead-to-opportunity-rate', 'sourced-signed-value', 'opportunities-opened', 'first-response-hours', 'opportunity-accept-rate', 'demos-joined', 'signed-value', 'win-rate', 'debriefs-closed', 'overdue-receivables', 'accept-lag-days', 'collected-value', 'approval-turnaround-hours', 'quotes-sent', 'sales-cycle-days', 'mql-reached', 'lead-to-mql-rate', 'cost-per-mql', 'presales-signed-value', 'on-time-collection-rate', 'solution-days'));--> statement-breakpoint

ALTER TABLE "sales"."kpi_assignment_line" DROP CONSTRAINT IF EXISTS "kpi_assignment_line_metric_known";--> statement-breakpoint
ALTER TABLE "sales"."kpi_assignment_line" ADD CONSTRAINT "kpi_assignment_line_metric_known" CHECK ("metric_key" IN ('leads-sourced', 'lead-to-opportunity-rate', 'sourced-signed-value', 'opportunities-opened', 'first-response-hours', 'opportunity-accept-rate', 'demos-joined', 'signed-value', 'win-rate', 'debriefs-closed', 'overdue-receivables', 'accept-lag-days', 'collected-value', 'approval-turnaround-hours', 'quotes-sent', 'sales-cycle-days', 'mql-reached', 'lead-to-mql-rate', 'cost-per-mql', 'presales-signed-value', 'on-time-collection-rate', 'solution-days'));--> statement-breakpoint

ALTER TABLE "sales"."kpi_month_value" DROP CONSTRAINT IF EXISTS "kpi_month_value_metric_known";--> statement-breakpoint
ALTER TABLE "sales"."kpi_month_value" ADD CONSTRAINT "kpi_month_value_metric_known" CHECK ("metric_key" IN ('leads-sourced', 'lead-to-opportunity-rate', 'sourced-signed-value', 'opportunities-opened', 'first-response-hours', 'opportunity-accept-rate', 'demos-joined', 'signed-value', 'win-rate', 'debriefs-closed', 'overdue-receivables', 'accept-lag-days', 'collected-value', 'approval-turnaround-hours', 'quotes-sent', 'sales-cycle-days', 'mql-reached', 'lead-to-mql-rate', 'cost-per-mql', 'presales-signed-value', 'on-time-collection-rate', 'solution-days'));--> statement-breakpoint

ALTER TABLE "sales"."kpi_role_metric" DROP CONSTRAINT IF EXISTS "kpi_role_metric_metric_known";--> statement-breakpoint
ALTER TABLE "sales"."kpi_role_metric" ADD CONSTRAINT "kpi_role_metric_metric_known" CHECK ("metric_key" IN ('leads-sourced', 'lead-to-opportunity-rate', 'sourced-signed-value', 'opportunities-opened', 'first-response-hours', 'opportunity-accept-rate', 'demos-joined', 'signed-value', 'win-rate', 'debriefs-closed', 'overdue-receivables', 'accept-lag-days', 'collected-value', 'approval-turnaround-hours', 'quotes-sent', 'sales-cycle-days', 'mql-reached', 'lead-to-mql-rate', 'cost-per-mql', 'presales-signed-value', 'on-time-collection-rate', 'solution-days'));--> statement-breakpoint

ALTER TABLE "sales"."kpi_alert_sent" DROP CONSTRAINT IF EXISTS "kpi_alert_sent_metric_known";--> statement-breakpoint
ALTER TABLE "sales"."kpi_alert_sent" ADD CONSTRAINT "kpi_alert_sent_metric_known" CHECK ("metric_key" IN ('leads-sourced', 'lead-to-opportunity-rate', 'sourced-signed-value', 'opportunities-opened', 'first-response-hours', 'opportunity-accept-rate', 'demos-joined', 'signed-value', 'win-rate', 'debriefs-closed', 'overdue-receivables', 'accept-lag-days', 'collected-value', 'approval-turnaround-hours', 'quotes-sent', 'sales-cycle-days', 'mql-reached', 'lead-to-mql-rate', 'cost-per-mql', 'presales-signed-value', 'on-time-collection-rate', 'solution-days'));--> statement-breakpoint

-- kpi_role_metric: one set per (role, from_period). DEFAULT only backfills, then goes: a writer
-- that forgets the month must fail, not write a v1 set.
ALTER TABLE "sales"."kpi_role_metric" ADD COLUMN IF NOT EXISTS "from_period" text DEFAULT '2000-01' NOT NULL;--> statement-breakpoint
ALTER TABLE "sales"."kpi_role_metric" ALTER COLUMN "from_period" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "sales"."kpi_role_metric" ADD COLUMN IF NOT EXISTS "weight" integer;--> statement-breakpoint
ALTER TABLE "sales"."kpi_role_metric" DROP CONSTRAINT IF EXISTS "kpi_role_metric_from_period_shape";--> statement-breakpoint
ALTER TABLE "sales"."kpi_role_metric" ADD CONSTRAINT "kpi_role_metric_from_period_shape" CHECK ("from_period" ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$');--> statement-breakpoint
ALTER TABLE "sales"."kpi_role_metric" DROP CONSTRAINT IF EXISTS "kpi_role_metric_weight_percent";--> statement-breakpoint
ALTER TABLE "sales"."kpi_role_metric" ADD CONSTRAINT "kpi_role_metric_weight_percent" CHECK ("weight" IS NULL OR "weight" BETWEEN 0 AND 100);--> statement-breakpoint
ALTER TABLE "sales"."kpi_role_metric" DROP CONSTRAINT IF EXISTS "kpi_role_metric_pk";--> statement-breakpoint
ALTER TABLE "sales"."kpi_role_metric" ADD CONSTRAINT "kpi_role_metric_pk" PRIMARY KEY ("role", "from_period", "metric_key");--> statement-breakpoint
DROP INDEX IF EXISTS "sales"."kpi_role_metric_one_primary_uq";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "kpi_role_metric_one_primary_uq" ON "sales"."kpi_role_metric" USING btree ("role", "from_period") WHERE "is_primary";--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "sales"."kpi_funnel_target" (
	"role" text NOT NULL,
	"from_period" text NOT NULL,
	"step_key" text NOT NULL,
	"ratio_bp" integer NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kpi_funnel_target_pk" PRIMARY KEY("role","from_period","step_key")
);--> statement-breakpoint
ALTER TABLE "sales"."kpi_funnel_target" DROP CONSTRAINT IF EXISTS "kpi_funnel_target_updated_by_actor_id_fk";--> statement-breakpoint
ALTER TABLE "sales"."kpi_funnel_target" ADD CONSTRAINT "kpi_funnel_target_updated_by_actor_id_fk" FOREIGN KEY ("updated_by") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."kpi_funnel_target" DROP CONSTRAINT IF EXISTS "kpi_funnel_target_role_known";--> statement-breakpoint
ALTER TABLE "sales"."kpi_funnel_target" ADD CONSTRAINT "kpi_funnel_target_role_known" CHECK ("role" IN ('director', 'head-of-sales', 'marketing', 'bd', 'presales', 'sale', 'account-executive'));--> statement-breakpoint
ALTER TABLE "sales"."kpi_funnel_target" DROP CONSTRAINT IF EXISTS "kpi_funnel_target_from_period_shape";--> statement-breakpoint
ALTER TABLE "sales"."kpi_funnel_target" ADD CONSTRAINT "kpi_funnel_target_from_period_shape" CHECK ("from_period" ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$');--> statement-breakpoint
ALTER TABLE "sales"."kpi_funnel_target" DROP CONSTRAINT IF EXISTS "kpi_funnel_target_step_known";--> statement-breakpoint
ALTER TABLE "sales"."kpi_funnel_target" ADD CONSTRAINT "kpi_funnel_target_step_known" CHECK ("step_key" IN ('lead', 'mql', 'sql', 'opportunity', 'lead-received', 'contacted', 'accepted', 'met', 'solution', 'quotation', 'signed', 'new', 'assigned', 'engaged'));--> statement-breakpoint
ALTER TABLE "sales"."kpi_funnel_target" DROP CONSTRAINT IF EXISTS "kpi_funnel_target_ratio_bp_range";--> statement-breakpoint
ALTER TABLE "sales"."kpi_funnel_target" ADD CONSTRAINT "kpi_funnel_target_ratio_bp_range" CHECK ("ratio_bp" BETWEEN 0 AND 10000);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "sales"."kpi_marketing_budget" (
	"unit_id" uuid NOT NULL,
	"period" text NOT NULL,
	"amount" bigint NOT NULL,
	"set_by" text NOT NULL,
	"set_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kpi_marketing_budget_pk" PRIMARY KEY("unit_id","period")
);--> statement-breakpoint
ALTER TABLE "sales"."kpi_marketing_budget" DROP CONSTRAINT IF EXISTS "kpi_marketing_budget_set_by_actor_id_fk";--> statement-breakpoint
ALTER TABLE "sales"."kpi_marketing_budget" ADD CONSTRAINT "kpi_marketing_budget_set_by_actor_id_fk" FOREIGN KEY ("set_by") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."kpi_marketing_budget" DROP CONSTRAINT IF EXISTS "kpi_marketing_budget_period_shape";--> statement-breakpoint
ALTER TABLE "sales"."kpi_marketing_budget" ADD CONSTRAINT "kpi_marketing_budget_period_shape" CHECK ("period" ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$');--> statement-breakpoint
ALTER TABLE "sales"."kpi_marketing_budget" DROP CONSTRAINT IF EXISTS "kpi_marketing_budget_amount_nonneg";--> statement-breakpoint
ALTER TABLE "sales"."kpi_marketing_budget" ADD CONSTRAINT "kpi_marketing_budget_amount_nonneg" CHECK ("amount" >= 0);--> statement-breakpoint

ALTER TABLE "sales"."touch" DROP CONSTRAINT IF EXISTS "touch_kind_known";--> statement-breakpoint
ALTER TABLE "sales"."touch" ADD CONSTRAINT "touch_kind_known" CHECK ("kind" IN ('created', 'contacted', 'field-filled', 'handed-over', 'tier-raised', 'care-planned', 'exchange-logged', 'first-action', 'verified', 'nurtured', 'resumed', 'archived', 'first-meeting', 'entered-pipeline', 'stage-changed', 'signed', 'exited', 'reopened', 'sample-sent', 'poc-run', 'demo-held', 'site-visited', 'quotation-sent', 'care-left', 'next-step-done', 'mail-failed', 'mail-sync-failed', 're-entered', 'customer-replied', 'solution-sent'));--> statement-breakpoint

ALTER TABLE "sales"."opportunity_owner" DROP CONSTRAINT IF EXISTS "opportunity_owner_role_known";--> statement-breakpoint
ALTER TABLE "sales"."opportunity_owner" ADD CONSTRAINT "opportunity_owner_role_known" CHECK ("role" IN ('SALE', 'BD', 'PRESALES'));--> statement-breakpoint

ALTER TABLE "sales"."contract_participant" DROP CONSTRAINT IF EXISTS "contract_participant_role_known";--> statement-breakpoint
ALTER TABLE "sales"."contract_participant" ADD CONSTRAINT "contract_participant_role_known" CHECK ("role" IN ('SALE', 'BD', 'PRESALES'));
