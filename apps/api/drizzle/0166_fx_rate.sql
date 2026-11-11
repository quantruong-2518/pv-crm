-- 0166 - `platform.fx_rate` (ADR 0149) and two bell values, kind `fx-rate-missing` and subject
-- `fx-rate`. The table holds the Vietcombank transfer-buying rate (VND per unit) per Vietnam
-- calendar day, one row per (currency, day). A foreign amount converts at the rate of the
-- day its money event happened, or the nearest earlier stored day. The `currency` and `source`
-- lists are copied by hand: a new currency or source is a migration a person reads.
-- `set_by` is text, not uuid: it references `platform.actor.id`, which is text.
-- Backfill: ('USD', 2000-01-01, 26400, 'legacy') so every past event resolves to 26,400
-- and no closed KPI month moves. VND never has rows.
-- Additive: the bell lists are widened by DROP + ADD, so every row 0164 accepted still passes.
-- ORDER: migrate BEFORE deploy - the old api never reads the table or emits the new values.
-- Re-runnable: IF NOT EXISTS, DROP ... IF EXISTS before ADD, ON CONFLICT DO NOTHING.
-- Hand-written for 0047's reason. The FK and the ADDs lock `platform.actor` and
-- `platform.notification`, which every writer queues behind: give up after 10 s instead.
-- Lasts to the migrator's commit (one transaction).
SET LOCAL lock_timeout = '10s';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform"."fx_rate" (
	"currency" text NOT NULL,
	"day" date NOT NULL,
	"rate" numeric(14, 2) NOT NULL,
	"source" text NOT NULL,
	"set_by" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fx_rate_currency_day_pk" PRIMARY KEY("currency","day")
);--> statement-breakpoint
ALTER TABLE "platform"."fx_rate" DROP CONSTRAINT IF EXISTS "fx_rate_set_by_actor_id_fk";--> statement-breakpoint
ALTER TABLE "platform"."fx_rate" ADD CONSTRAINT "fx_rate_set_by_actor_id_fk" FOREIGN KEY ("set_by") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Only USD besides VND today.
ALTER TABLE "platform"."fx_rate" DROP CONSTRAINT IF EXISTS "fx_rate_currency_known";--> statement-breakpoint
ALTER TABLE "platform"."fx_rate" ADD CONSTRAINT "fx_rate_currency_known" CHECK ("currency" = 'USD');--> statement-breakpoint
ALTER TABLE "platform"."fx_rate" DROP CONSTRAINT IF EXISTS "fx_rate_positive";--> statement-breakpoint
ALTER TABLE "platform"."fx_rate" ADD CONSTRAINT "fx_rate_positive" CHECK ("rate" > 0);--> statement-breakpoint
ALTER TABLE "platform"."fx_rate" DROP CONSTRAINT IF EXISTS "fx_rate_source_known";--> statement-breakpoint
ALTER TABLE "platform"."fx_rate" ADD CONSTRAINT "fx_rate_source_known" CHECK ("source" IN ('vietcombank', 'manual', 'legacy'));--> statement-breakpoint
-- A manual rate names its author; a fetched one never does.
ALTER TABLE "platform"."fx_rate" DROP CONSTRAINT IF EXISTS "fx_rate_manual_has_author";--> statement-breakpoint
ALTER TABLE "platform"."fx_rate" ADD CONSTRAINT "fx_rate_manual_has_author" CHECK (("source" = 'manual') = ("set_by" IS NOT NULL));--> statement-breakpoint

INSERT INTO "platform"."fx_rate" ("currency", "day", "rate", "source")
VALUES ('USD', '2000-01-01', 26400, 'legacy')
ON CONFLICT ("currency", "day") DO NOTHING;--> statement-breakpoint

-- Bell kind `fx-rate-missing` and subject `fx-rate` (ADR 0149). Lists copied by hand:
-- 0164's kind list (sixty-seven) plus one, 0150's subject list (nineteen) plus one.
ALTER TABLE "platform"."notification" DROP CONSTRAINT IF EXISTS "notification_kind_known";--> statement-breakpoint
ALTER TABLE "platform"."notification" ADD CONSTRAINT "notification_kind_known" CHECK ("kind" IN ('lead-pooled', 'lead-received', 'lead-removed', 'lead-re-entered', 'lead-scan-ready', 'lead-scan-committed', 'lead-scan-failed', 'opportunity-awaiting-accept', 'opportunity-lost', 'opportunity-accepted', 'opportunity-assigned', 'opportunity-unassigned', 'next-step-assigned', 'next-step-done', 'approval-waiting', 'approval-approved', 'approval-rejected', 'mail-run-sent', 'mail-run-cancelled', 'mail-failed', 'customer-replied', 'access-changed', 'password-reset-by-admin', 'google-link-broken', 'opportunity-stage-moved', 'opportunity-primary-changed', 'contract-signed', 'quotation-new-round', 'quotation-superseded', 'contract-installment-paid', 'contract-installment-undone', 'contract-schedule-replaced', 'contract-condition-done', 'campaign-stopped', 'campaign-finished', 'kpi-target-proposed', 'kpi-target-agreed', 'comm-closed-by-other', 'lead-nurtured', 'lead-resumed', 'mail-run-replied', 'comm-record-late', 'contract-installment-overdue', 'hold-due-soon', 'hold-due', 'kpi-target-allocated', 'kpi-counter-resolved', 'kpi-allocation-returned', 'kpi-about-to-miss', 'kpi-about-to-hit', 'overdue-reason-waiting', 'overdue-reason-decided', 'kpi-team-share-assigned', 'meeting-cancelled', 'meeting-calendar-failed', 'contract-terminated', 'contract-collector-changed', 'kpi-allocation-waiting', 'kpi-counter-proposed', 'kpi-month-unclosed', 'kpi-stand-in', 'customer-recare-due', 'contract-penalty-changed', 'kpi-assignment-received', 'kpi-assignment-late', 'kpi-away-declared', 'kpi-digest', 'fx-rate-missing'));--> statement-breakpoint
ALTER TABLE "platform"."notification_kind_policy" DROP CONSTRAINT IF EXISTS "notification_kind_policy_kind_known";--> statement-breakpoint
ALTER TABLE "platform"."notification_kind_policy" ADD CONSTRAINT "notification_kind_policy_kind_known" CHECK ("kind" IN ('lead-pooled', 'lead-received', 'lead-removed', 'lead-re-entered', 'lead-scan-ready', 'lead-scan-committed', 'lead-scan-failed', 'opportunity-awaiting-accept', 'opportunity-lost', 'opportunity-accepted', 'opportunity-assigned', 'opportunity-unassigned', 'next-step-assigned', 'next-step-done', 'approval-waiting', 'approval-approved', 'approval-rejected', 'mail-run-sent', 'mail-run-cancelled', 'mail-failed', 'customer-replied', 'access-changed', 'password-reset-by-admin', 'google-link-broken', 'opportunity-stage-moved', 'opportunity-primary-changed', 'contract-signed', 'quotation-new-round', 'quotation-superseded', 'contract-installment-paid', 'contract-installment-undone', 'contract-schedule-replaced', 'contract-condition-done', 'campaign-stopped', 'campaign-finished', 'kpi-target-proposed', 'kpi-target-agreed', 'comm-closed-by-other', 'lead-nurtured', 'lead-resumed', 'mail-run-replied', 'comm-record-late', 'contract-installment-overdue', 'hold-due-soon', 'hold-due', 'kpi-target-allocated', 'kpi-counter-resolved', 'kpi-allocation-returned', 'kpi-about-to-miss', 'kpi-about-to-hit', 'overdue-reason-waiting', 'overdue-reason-decided', 'kpi-team-share-assigned', 'meeting-cancelled', 'meeting-calendar-failed', 'contract-terminated', 'contract-collector-changed', 'kpi-allocation-waiting', 'kpi-counter-proposed', 'kpi-month-unclosed', 'kpi-stand-in', 'customer-recare-due', 'contract-penalty-changed', 'kpi-assignment-received', 'kpi-assignment-late', 'kpi-away-declared', 'kpi-digest', 'fx-rate-missing'));--> statement-breakpoint
ALTER TABLE "platform"."notification" DROP CONSTRAINT IF EXISTS "notification_subject_kind_known";--> statement-breakpoint
ALTER TABLE "platform"."notification" ADD CONSTRAINT "notification_subject_kind_known" CHECK ("subject_kind" IN ('lead', 'lead-pool', 'opportunity', 'approval', 'lead-scan', 'mail-run', 'user', 'google-link', 'contract', 'campaign', 'kpi-target', 'comm', 'lead-batch', 'opportunity-batch', 'comm-record', 'kpi-scorecard', 'kpi-allocation', 'kpi-team', 'kpi-assignment', 'fx-rate'));--> statement-breakpoint

-- 0126's map, one new row: /admin/fx-rates lists the table, and a rate change moves every money
-- figure of its day. `known` is `EntityKind` copied by hand (plus 'fx-rate'): a typo is refused here.
DO $$
DECLARE
	known CONSTANT text[] := ARRAY['lead', 'opportunity', 'account', 'contact',
		'contract', 'workstream', 'meeting', 'comm', 'approval', 'mail', 'campaign',
		'scan', 'ai-job', 'config', 'kpi', 'hold', 'user', 'fx-rate'];
	m record;
	args text;
BEGIN
	FOR m IN SELECT * FROM (VALUES
		('platform', 'fx_rate', ARRAY['fx-rate'])
	) AS t(sch, tbl, kinds) LOOP
		IF NOT m.kinds <@ known THEN
			RAISE EXCEPTION 'pv_change: %.% names a kind outside EntityKind: %', m.sch, m.tbl, m.kinds;
		END IF;
		args := (SELECT string_agg(quote_literal(k), ', ') FROM unnest(m.kinds) AS k);
		EXECUTE format('DROP TRIGGER IF EXISTS "pv_change_write" ON %I.%I', m.sch, m.tbl);
		EXECUTE format('CREATE TRIGGER "pv_change_write" AFTER INSERT OR DELETE ON %I.%I '
			'FOR EACH ROW EXECUTE FUNCTION "platform"."notify_entity_change"(%s)', m.sch, m.tbl, args);
		EXECUTE format('DROP TRIGGER IF EXISTS "pv_change_update" ON %I.%I', m.sch, m.tbl);
		EXECUTE format('CREATE TRIGGER "pv_change_update" AFTER UPDATE ON %I.%I '
			'FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) '
			'EXECUTE FUNCTION "platform"."notify_entity_change"(%s)', m.sch, m.tbl, args);
	END LOOP;
END;
$$;
