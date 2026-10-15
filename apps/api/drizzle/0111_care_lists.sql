-- 0111 - care lists: holds ("Tạm hoãn", ADR 0088 §10), waiting labels (§5),
-- the campaign's "added while nurturing" fact, the machine park reason, and
-- the two hold reminder kinds.
--
-- Every statement adds: new tables, a defaulted column, one catalogue row and
-- two widened CHECKs. Old code runs fine on the result, so migrate BEFORE
-- deploy - the hub swallows a CHECK failure under a savepoint, so new code
-- shipped first would lose every hold bell without a sound.
--
-- `sales.hold.subject_code` IS fenced, unlike `touch`'s: two generated key
-- halves point at `sales.lead` / `sales.opportunity` themselves, not at the
-- `platform.object` mirror, and neither table deletes rows. No CHECK on
-- `config_entry.list` exists, so `WAITING_LABEL` needs no DDL there.
-- Hand-written for 0047's reason: `generate`'s baseline is still stuck at 0026.
CREATE TABLE "sales"."hold" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_type" text NOT NULL,
	"subject_code" text NOT NULL,
	"lead_code" text GENERATED ALWAYS AS (CASE WHEN "subject_type" = 'lead' THEN "subject_code" END) STORED,
	"opportunity_code" text GENERATED ALWAYS AS (CASE WHEN "subject_type" = 'opportunity' THEN "subject_code" END) STORED,
	"until_day" date NOT NULL,
	"note" text,
	"set_by" text NOT NULL,
	"set_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"ended_by" text,
	"end_kind" text,
	"reminded_soon_at" timestamp with time zone,
	"reminded_due_at" timestamp with time zone,
	CONSTRAINT "hold_subject_type_known" CHECK ("subject_type" IN ('lead', 'opportunity')),
	CONSTRAINT "hold_end_kind_known" CHECK ("end_kind" IS NULL OR "end_kind" IN ('resumed', 'to-waiting', 'touch', 'stopped', 'disqualified', 'converted')),
	CONSTRAINT "hold_end_pair" CHECK (("ended_at" IS NULL) = ("end_kind" IS NULL) AND ("ended_by" IS NULL OR "ended_at" IS NOT NULL)),
	CONSTRAINT "hold_no_blank" CHECK ("subject_code" <> '' AND ("note" IS NULL OR "note" <> ''))
);--> statement-breakpoint
ALTER TABLE "sales"."hold" ADD CONSTRAINT "hold_lead_fk" FOREIGN KEY ("lead_code") REFERENCES "sales"."lead"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."hold" ADD CONSTRAINT "hold_opportunity_fk" FOREIGN KEY ("opportunity_code") REFERENCES "sales"."opportunity"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."hold" ADD CONSTRAINT "hold_set_by_actor_id_fk" FOREIGN KEY ("set_by") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."hold" ADD CONSTRAINT "hold_ended_by_actor_id_fk" FOREIGN KEY ("ended_by") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- "Is this subject held right now": at most one open hold per subject.
CREATE UNIQUE INDEX "hold_open_subject_uq" ON "sales"."hold" USING btree ("subject_type","subject_code") WHERE "ended_at" IS NULL;--> statement-breakpoint
-- "Which open holds reach their date by day D" (the reminder sweep), and the list sorted by date.
CREATE INDEX "hold_open_until_idx" ON "sales"."hold" USING btree ("until_day") WHERE "ended_at" IS NULL;--> statement-breakpoint

-- Waiting labels: `opportunity_product`'s composite anchor on `config_id_list`.
CREATE TABLE "sales"."lead_label" (
	"lead_code" text NOT NULL,
	"label_id" text NOT NULL,
	"list" text DEFAULT 'WAITING_LABEL' NOT NULL,
	CONSTRAINT "lead_label_pk" PRIMARY KEY("lead_code","label_id"),
	CONSTRAINT "lead_label_list" CHECK ("list" = 'WAITING_LABEL')
);--> statement-breakpoint
ALTER TABLE "sales"."lead_label" ADD CONSTRAINT "lead_label_lead_code_lead_code_fk" FOREIGN KEY ("lead_code") REFERENCES "sales"."lead"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."lead_label" ADD CONSTRAINT "lead_label_config_fk" FOREIGN KEY ("label_id","list") REFERENCES "sales"."config_entry"("id","list") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- "Which leads carry label X": book filter, audience filter, config usage count.
CREATE INDEX "lead_label_label_idx" ON "sales"."lead_label" USING btree ("label_id");--> statement-breakpoint

-- Unknown on old rows reads as "not from the waiting group": nothing is parked on a guess.
ALTER TABLE "sales"."campaign_member" ADD COLUMN "added_while_nurturing" boolean DEFAULT false NOT NULL;--> statement-breakpoint

-- The machine park reason (care-lists §1.4). Re-runnable. NOT ON CONFLICT:
-- Postgres refuses it on this table outright (55000), since `config_ord_uniq`
-- is DEFERRABLE. `ord` is computed: a fixed 7 would collide at COMMIT if the
-- desk already added a seventh reason. Skipped when the id or the live name is
-- taken; the guard below decides whether that skip is safe.
INSERT INTO "sales"."config_entry" ("id", "list", "name", "ord")
SELECT 'EX-07', 'EXIT_REASON', 'Không phản hồi chiến dịch', coalesce(max("ord"), 0) + 1
  FROM "sales"."config_entry"
 WHERE "list" = 'EXIT_REASON'
HAVING NOT EXISTS (SELECT 1 FROM "sales"."config_entry"
                    WHERE "id" = 'EX-07'
                       OR ("list" = 'EXIT_REASON' AND "active"
                           AND lower("name") = lower('Không phản hồi chiến dịch')));--> statement-breakpoint
-- The api names this row by id. If `EX-07` is some other reason the desk
-- added, a silent skip would park leads under the wrong reason: fail instead.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "sales"."config_entry"
                  WHERE "id" = 'EX-07' AND "list" = 'EXIT_REASON'
                    AND "name" = 'Không phản hồi chiến dịch') THEN
    RAISE EXCEPTION '0111: EX-07 is not "Không phản hồi chiến dịch" - read EXIT_REASON before migrating';
  END IF;
END $$;--> statement-breakpoint

-- `hold-due-soon` and `hold-due` join both kind lists, copied by hand from
-- 0110. Subjects are `lead`/`opportunity`, already allowed: no subject change.
ALTER TABLE "platform"."notification" DROP CONSTRAINT IF EXISTS "notification_kind_known";--> statement-breakpoint
ALTER TABLE "platform"."notification" ADD CONSTRAINT "notification_kind_known" CHECK ("kind" IN ('lead-pooled', 'lead-received', 'lead-removed', 'lead-re-entered', 'lead-stopped', 'lead-scan-ready', 'lead-scan-committed', 'lead-scan-failed', 'opportunity-awaiting-accept', 'opportunity-lost', 'opportunity-accepted', 'opportunity-assigned', 'opportunity-unassigned', 'next-step-assigned', 'next-step-done', 'approval-waiting', 'approval-approved', 'approval-rejected', 'mail-run-sent', 'mail-run-cancelled', 'mail-failed', 'customer-replied', 'access-changed', 'password-reset-by-admin', 'google-link-broken', 'opportunity-stage-moved', 'opportunity-primary-changed', 'contract-signed', 'quotation-new-round', 'quotation-superseded', 'contract-installment-paid', 'contract-installment-undone', 'contract-schedule-replaced', 'contract-condition-done', 'campaign-stopped', 'campaign-finished', 'kpi-target-proposed', 'kpi-target-agreed', 'comm-closed-by-other', 'lead-nurtured', 'lead-resumed', 'lead-reopened', 'mail-run-replied', 'comm-record-late', 'contract-installment-overdue', 'hold-due-soon', 'hold-due'));--> statement-breakpoint
ALTER TABLE "platform"."notification_kind_policy" DROP CONSTRAINT IF EXISTS "notification_kind_policy_kind_known";--> statement-breakpoint
ALTER TABLE "platform"."notification_kind_policy" ADD CONSTRAINT "notification_kind_policy_kind_known" CHECK ("kind" IN ('lead-pooled', 'lead-received', 'lead-removed', 'lead-re-entered', 'lead-stopped', 'lead-scan-ready', 'lead-scan-committed', 'lead-scan-failed', 'opportunity-awaiting-accept', 'opportunity-lost', 'opportunity-accepted', 'opportunity-assigned', 'opportunity-unassigned', 'next-step-assigned', 'next-step-done', 'approval-waiting', 'approval-approved', 'approval-rejected', 'mail-run-sent', 'mail-run-cancelled', 'mail-failed', 'customer-replied', 'access-changed', 'password-reset-by-admin', 'google-link-broken', 'opportunity-stage-moved', 'opportunity-primary-changed', 'contract-signed', 'quotation-new-round', 'quotation-superseded', 'contract-installment-paid', 'contract-installment-undone', 'contract-schedule-replaced', 'contract-condition-done', 'campaign-stopped', 'campaign-finished', 'kpi-target-proposed', 'kpi-target-agreed', 'comm-closed-by-other', 'lead-nurtured', 'lead-resumed', 'lead-reopened', 'mail-run-replied', 'comm-record-late', 'contract-installment-overdue', 'hold-due-soon', 'hold-due'));
