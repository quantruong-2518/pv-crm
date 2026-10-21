-- 0128 - contract termination (ADR 0107): one row per signed contract that
-- later fell apart. `sales.contract` and its installments are not touched.
--
-- `reason_key` has no FK, `opportunity.stop_reason`'s convention: the virtual
-- key 'other' has no catalogue row. `sales.config_entry` needs no DDL for the
-- new list: no constraint enumerates `list` (0104 and 0108 said the same).
-- Reason ids use prefix TN, not CT: CATEGORY already mints CT-01.. in the same
-- primary key, and `seed.ts` plants them on every database.
--
-- The bell kind `contract-terminated` joins both kind lists (0127's fifty-seven
-- plus it: fifty-eight); subject 'contract' is already listed. The table joins
-- the `pv_change` map (0126) under every kind whose reads now fold termination in
-- (contract, opportunity, workstream, lead): it writes no other row.
-- `contract.terminate` rows mirror 0102: no `permission_seed` row, so the boot
-- seeder still plants the defaults if an old build's `forgetUnknown()` drops these.
-- ORDER: migrate BEFORE deploy; the old build never reads or writes the table.
-- Re-runnable: IF [NOT] EXISTS on DDL, guarded data. Hand-written for 0047's reason.
CREATE TABLE IF NOT EXISTS "sales"."contract_termination" (
	"contract_code" text PRIMARY KEY NOT NULL,
	"reason_key" text NOT NULL,
	"note" text,
	"collected_amount" bigint NOT NULL,
	"refunded_amount" bigint NOT NULL,
	"terminated_at" timestamp with time zone NOT NULL,
	"terminated_by_id" text NOT NULL,
	CONSTRAINT "contract_termination_other_has_note" CHECK ("reason_key" <> 'other' OR btrim(coalesce("note", '')) <> ''),
	CONSTRAINT "contract_termination_collected_nonneg" CHECK ("collected_amount" >= 0),
	CONSTRAINT "contract_termination_refunded_nonneg" CHECK ("refunded_amount" >= 0),
	CONSTRAINT "contract_termination_refund_within_collected" CHECK ("refunded_amount" <= "collected_amount")
);--> statement-breakpoint
ALTER TABLE "sales"."contract_termination" DROP CONSTRAINT IF EXISTS "contract_termination_contract_code_contract_code_fk";--> statement-breakpoint
ALTER TABLE "sales"."contract_termination" ADD CONSTRAINT "contract_termination_contract_code_contract_code_fk" FOREIGN KEY ("contract_code") REFERENCES "sales"."contract"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."contract_termination" DROP CONSTRAINT IF EXISTS "contract_termination_terminated_by_id_actor_id_fk";--> statement-breakpoint
ALTER TABLE "sales"."contract_termination" ADD CONSTRAINT "contract_termination_terminated_by_id_actor_id_fk" FOREIGN KEY ("terminated_by_id") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contract_termination_at_idx" ON "sales"."contract_termination" USING btree ("terminated_at");--> statement-breakpoint

DROP TRIGGER IF EXISTS "pv_change_write" ON "sales"."contract_termination";--> statement-breakpoint
CREATE TRIGGER "pv_change_write" AFTER INSERT OR DELETE ON "sales"."contract_termination" FOR EACH ROW EXECUTE FUNCTION "platform"."notify_entity_change"('contract', 'opportunity', 'workstream', 'lead');--> statement-breakpoint
DROP TRIGGER IF EXISTS "pv_change_update" ON "sales"."contract_termination";--> statement-breakpoint
CREATE TRIGGER "pv_change_update" AFTER UPDATE ON "sales"."contract_termination" FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION "platform"."notify_entity_change"('contract', 'opportunity', 'workstream', 'lead');--> statement-breakpoint

ALTER TABLE "platform"."notification" DROP CONSTRAINT IF EXISTS "notification_kind_known";--> statement-breakpoint
ALTER TABLE "platform"."notification" ADD CONSTRAINT "notification_kind_known" CHECK ("kind" IN ('lead-pooled', 'lead-received', 'lead-removed', 'lead-re-entered', 'lead-stopped', 'lead-scan-ready', 'lead-scan-committed', 'lead-scan-failed', 'opportunity-awaiting-accept', 'opportunity-lost', 'opportunity-accepted', 'opportunity-assigned', 'opportunity-unassigned', 'next-step-assigned', 'next-step-done', 'approval-waiting', 'approval-approved', 'approval-rejected', 'mail-run-sent', 'mail-run-cancelled', 'mail-failed', 'customer-replied', 'access-changed', 'password-reset-by-admin', 'google-link-broken', 'opportunity-stage-moved', 'opportunity-primary-changed', 'contract-signed', 'quotation-new-round', 'quotation-superseded', 'contract-installment-paid', 'contract-installment-undone', 'contract-schedule-replaced', 'contract-condition-done', 'campaign-stopped', 'campaign-finished', 'kpi-target-proposed', 'kpi-target-agreed', 'comm-closed-by-other', 'lead-nurtured', 'lead-resumed', 'lead-reopened', 'mail-run-replied', 'comm-record-late', 'contract-installment-overdue', 'hold-due-soon', 'hold-due', 'kpi-target-allocated', 'kpi-counter-resolved', 'kpi-allocation-returned', 'kpi-about-to-miss', 'kpi-about-to-hit', 'overdue-reason-waiting', 'overdue-reason-decided', 'kpi-team-share-assigned', 'meeting-cancelled', 'meeting-calendar-failed', 'contract-terminated'));--> statement-breakpoint
ALTER TABLE "platform"."notification_kind_policy" DROP CONSTRAINT IF EXISTS "notification_kind_policy_kind_known";--> statement-breakpoint
ALTER TABLE "platform"."notification_kind_policy" ADD CONSTRAINT "notification_kind_policy_kind_known" CHECK ("kind" IN ('lead-pooled', 'lead-received', 'lead-removed', 'lead-re-entered', 'lead-stopped', 'lead-scan-ready', 'lead-scan-committed', 'lead-scan-failed', 'opportunity-awaiting-accept', 'opportunity-lost', 'opportunity-accepted', 'opportunity-assigned', 'opportunity-unassigned', 'next-step-assigned', 'next-step-done', 'approval-waiting', 'approval-approved', 'approval-rejected', 'mail-run-sent', 'mail-run-cancelled', 'mail-failed', 'customer-replied', 'access-changed', 'password-reset-by-admin', 'google-link-broken', 'opportunity-stage-moved', 'opportunity-primary-changed', 'contract-signed', 'quotation-new-round', 'quotation-superseded', 'contract-installment-paid', 'contract-installment-undone', 'contract-schedule-replaced', 'contract-condition-done', 'campaign-stopped', 'campaign-finished', 'kpi-target-proposed', 'kpi-target-agreed', 'comm-closed-by-other', 'lead-nurtured', 'lead-resumed', 'lead-reopened', 'mail-run-replied', 'comm-record-late', 'contract-installment-overdue', 'hold-due-soon', 'hold-due', 'kpi-target-allocated', 'kpi-counter-resolved', 'kpi-allocation-returned', 'kpi-about-to-miss', 'kpi-about-to-hit', 'overdue-reason-waiting', 'overdue-reason-decided', 'kpi-team-share-assigned', 'meeting-cancelled', 'meeting-calendar-failed', 'contract-terminated'));--> statement-breakpoint

-- The six starting reasons, per row: skipped when the id is taken (CT is
-- CATEGORY's, hence TN) or any row of the list already has the name, live or
-- off (`config_name_live` folds case, so this does too). A re-run changes nothing.
INSERT INTO "sales"."config_entry" ("id", "list", "name", "ord")
SELECT v."id", 'CONTRACT_TERMINATION_REASON', v."name", v."ord"
  FROM (VALUES
    ('TN-01', 'Khách rút lui', 1),
    ('TN-02', 'Khách không đủ khả năng thanh toán', 2),
    ('TN-03', 'Tranh chấp thanh toán', 3),
    ('TN-04', 'Tranh chấp nội dung hợp đồng', 4),
    ('TN-05', 'Bên mình không thực hiện được', 5),
    ('TN-06', 'Ký nhầm hoặc ký trùng', 6)
  ) AS v("id", "name", "ord")
 WHERE NOT EXISTS (SELECT 1 FROM "sales"."config_entry" c WHERE c."id" = v."id")
   AND NOT EXISTS (SELECT 1 FROM "sales"."config_entry" c
                    WHERE c."list" = 'CONTRACT_TERMINATION_REASON'
                      AND lower(c."name") = lower(v."name"));--> statement-breakpoint

-- `granted_by` NULL, like a seeder-planted row: nobody ticked this.
INSERT INTO "platform"."role_permission" ("role_id", "permission")
VALUES ('director', 'contract.terminate'), ('head-of-sales', 'contract.terminate')
ON CONFLICT ("role_id", "permission") DO NOTHING;
