-- 0126 - Postgres announces "a record of kind X changed" on `pv_change` (ADR 0104).
--
-- 0103's reasoning, widened from the bell to every book: a trigger cannot be
-- forgotten by a future writer, and NOTIFY is delivered only on COMMIT. The
-- payload is one `EntityKind` and nothing else; the browser re-reads through the
-- permission-checked GETs, so no row data leaves the database this way.
--
-- ROW-level, not statement-level: a statement-level trigger fires on the worker
-- sweeps that change nothing (every 30 s, waking every browser), a row-level one
-- does not. Postgres folds identical channel+payload pairs inside a transaction,
-- so a 1,000-row import still sends one NOTIFY per kind. `OLD.* IS DISTINCT FROM
-- NEW.*` keeps a no-op UPDATE silent. NOTIFY fires no trigger, so nothing loops.
--
-- Hand-written for 0047's reason: `generate`'s baseline is still stuck at 0026.

-- Every argument is one kind. A child table whose owner is polymorphic (a touch
-- of a lead OR an opportunity) passes all of them: a combined INSERT OR DELETE
-- trigger cannot read the type column in WHEN, and an extra refetch is cheap.
CREATE OR REPLACE FUNCTION "platform"."notify_entity_change"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
	FOR i IN 0 .. TG_NARGS - 1 LOOP
		PERFORM pg_notify('pv_change', TG_ARGV[i]);
	END LOOP;
	RETURN NULL;
END;
$$;--> statement-breakpoint

-- One row per table, so the table -> kind map reads as a list. Left out on
-- purpose (no trigger): `platform.notification` has its own channel;
-- `object`/`edge` only mirror a parent row that already fires; `audit`,
-- `session`, `password_reset`, `lead_intake` are trails, not books;
-- `mail_gate`, `lead_intake_rate`, `email_webhook_event`, `kpi_alert_sent`,
-- `permission_seed` are machine ledgers; `ai_call`/`ai_price` are the AI cost
-- ledger; `search_recent`, `user_pin`, `google_link` are one person's own state.
DO $$
DECLARE
	-- `EntityKind` in `@pv/contracts`, copied by hand: a typo here would ship a
	-- payload the listener's zod refuses, so the migration refuses it first.
	known CONSTANT text[] := ARRAY['lead', 'opportunity', 'account', 'contact',
		'contract', 'workstream', 'meeting', 'comm', 'approval', 'mail', 'campaign',
		'scan', 'config', 'kpi', 'hold', 'user'];
	m record;
	args text;
BEGIN
	FOR m IN SELECT * FROM (VALUES
		('sales', 'lead', ARRAY['lead']),
		('sales', 'lead_label', ARRAY['lead']),
		('sales', 'touch', ARRAY['lead', 'opportunity']),
		('sales', 'next_step', ARRAY['lead', 'opportunity']),
		('sales', 'opportunity', ARRAY['opportunity']),
		('sales', 'opportunity_contact', ARRAY['opportunity']),
		('sales', 'opportunity_owner', ARRAY['opportunity']),
		('sales', 'opportunity_product', ARRAY['opportunity']),
		('sales', 'opportunity_stage_event', ARRAY['opportunity']),
		('sales', 'quotation', ARRAY['opportunity']),
		('sales', 'account', ARRAY['account']),
		('sales', 'contact', ARRAY['contact']),
		('sales', 'contract', ARRAY['contract']),
		('sales', 'contract_condition', ARRAY['contract']),
		('sales', 'contract_document', ARRAY['contract']),
		('sales', 'contract_installment', ARRAY['contract']),
		('sales', 'contract_note', ARRAY['contract']),
		('sales', 'contract_participant', ARRAY['contract']),
		('sales', 'contract_record', ARRAY['contract']),
		('sales', 'installment_overdue_reason', ARRAY['contract']),
		('sales', 'workstream', ARRAY['workstream']),
		('sales', 'document_step', ARRAY['workstream']),
		('platform', 'attachment', ARRAY['lead', 'comm', 'workstream']),
		('sales', 'meeting', ARRAY['meeting']),
		('sales', 'meeting_attendee', ARRAY['meeting']),
		('comms', 'identity', ARRAY['comm']),
		('comms', 'thread', ARRAY['comm']),
		('comms', 'message', ARRAY['comm']),
		('comms', 'message_party', ARRAY['comm']),
		('comms', 'link', ARRAY['comm']),
		('comms', 'debrief', ARRAY['comm']),
		('comms', 'debrief_answer', ARRAY['comm']),
		('platform', 'approval', ARRAY['approval']),
		('platform', 'approval_link', ARRAY['approval']),
		-- Platform mail knows no campaign (ADR 0040): a wave's progress arrives
		-- as 'mail', and the listener maps it onto campaign reads as well.
		('platform', 'mail_run', ARRAY['mail']),
		('platform', 'email_delivery', ARRAY['mail']),
		('platform', 'email_delivery_address', ARRAY['mail']),
		('platform', 'mail_event', ARRAY['mail']),
		('platform', 'mail_reply', ARRAY['mail']),
		('platform', 'email_suppression', ARRAY['mail']),
		('sales', 'mail_sequence', ARRAY['mail']),
		('sales', 'mail_template', ARRAY['mail']),
		('sales', 'mail_template_default', ARRAY['mail']),
		('sales', 'mail_sequence_run', ARRAY['mail', 'campaign']),
		('sales', 'campaign', ARRAY['campaign']),
		('sales', 'campaign_member', ARRAY['campaign']),
		('sales', 'scan_batch', ARRAY['scan']),
		('sales', 'scan_file', ARRAY['scan']),
		('sales', 'config_entry', ARRAY['config']),
		('sales', 'motion_policy', ARRAY['config']),
		('sales', 'state_rule', ARRAY['config']),
		('sales', 'step_template', ARRAY['config']),
		('sales', 'lead_origin', ARRAY['config']),
		('sales', 'lead_origin_alias', ARRAY['config']),
		('sales', 'lead_origin_motion', ARRAY['config']),
		('sales', 'partner', ARRAY['config']),
		('sales', 'source_cost', ARRAY['config']),
		('sales', 'source_event', ARRAY['config']),
		('sales', 'source_follower', ARRAY['config']),
		('platform', 'setting', ARRAY['config']),
		('platform', 'notification_kind_policy', ARRAY['config']),
		('sales', 'kpi_target', ARRAY['kpi']),
		('sales', 'kpi_acknowledgement', ARRAY['kpi']),
		('sales', 'kpi_allocation', ARRAY['kpi']),
		('sales', 'kpi_allocation_line', ARRAY['kpi']),
		('sales', 'kpi_allocation_share', ARRAY['kpi']),
		('sales', 'kpi_counter', ARRAY['kpi']),
		('sales', 'kpi_month_close', ARRAY['kpi']),
		('sales', 'kpi_month_value', ARRAY['kpi']),
		('sales', 'kpi_role_metric', ARRAY['kpi']),
		('sales', 'kpi_team', ARRAY['kpi']),
		('sales', 'kpi_team_member', ARRAY['kpi']),
		('sales', 'kpi_team_roster', ARRAY['kpi']),
		('sales', 'hold', ARRAY['hold']),
		('platform', 'actor', ARRAY['user']),
		('platform', 'role_permission', ARRAY['user'])
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
