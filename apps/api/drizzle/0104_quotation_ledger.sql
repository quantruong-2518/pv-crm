-- 0104 - the quotation ledger (ADR 0090): `sales.quotation`, one row per
-- quotation sent; `sales.document_step`, the step label of a workstream
-- document; `sales.contract_installment` learns who recorded a payment.
-- Every CHECK list is copied by hand. `reason_id` has NO foreign key: the
-- virtual key 'other' is never a config row (`touch.reason_id`'s reason).
-- Both unique indexes key on coalesce("kind", ''), so the kind-less rows of a
-- deal are ONE group; a writer's ON CONFLICT must spell the same expression.
-- `sales.config_entry` needs no DDL: no constraint enumerates `list`.
-- ORDER: migrate BEFORE the deploy; the old build ignores every object here.
-- A touch the old build writes between migrate and deploy is ledgered by
-- `pnpm --filter @pv/api db:backfill:quotation-gap`, never by this file.
-- The DDL is not re-runnable; the two data statements are, and change nothing
-- the second time. Hand-written for 0047's reason. The why: ADR 0090.
CREATE TABLE "sales"."quotation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_code" text NOT NULL,
	"kind" text,
	"negotiation_no" integer NOT NULL,
	"round_no" integer NOT NULL,
	"amount" bigint,
	"currency" text,
	"sent_at" timestamp with time zone NOT NULL,
	"valid_until" date,
	"source" text NOT NULL,
	"outcome" text NOT NULL,
	"closed_at" timestamp with time zone,
	"reason_id" text,
	"stop_reason_key" text,
	"reason_note" text,
	"contract_code" text,
	"touch_id" uuid,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quotation_touch_uq" UNIQUE("touch_id"),
	CONSTRAINT "quotation_kind_known" CHECK ("kind" IS NULL OR "kind" IN ('licence', 'deployment', 'training')),
	CONSTRAINT "quotation_source_known" CHECK ("source" IN ('manual', 'mail', 'backfill')),
	CONSTRAINT "quotation_outcome_known" CHECK ("outcome" IN ('pending', 'won', 'not-closed')),
	CONSTRAINT "quotation_manual_has_kind" CHECK ("source" <> 'manual' OR "kind" IS NOT NULL),
	CONSTRAINT "quotation_manual_has_author" CHECK ("source" <> 'manual' OR "created_by" IS NOT NULL),
	CONSTRAINT "quotation_numbers_positive" CHECK ("negotiation_no" >= 1 AND "round_no" >= 1),
	CONSTRAINT "quotation_money_pair" CHECK (("amount" IS NULL) = ("currency" IS NULL)),
	CONSTRAINT "quotation_valid_after_sent" CHECK ("valid_until" IS NULL OR "valid_until" >= ("sent_at" AT TIME ZONE 'UTC')::date),
	CONSTRAINT "quotation_closed_pair" CHECK (("closed_at" IS NULL) = ("outcome" = 'pending')),
	CONSTRAINT "quotation_won_has_contract" CHECK ("outcome" <> 'won' OR "contract_code" IS NOT NULL),
	CONSTRAINT "quotation_not_closed_has_reason" CHECK ("outcome" <> 'not-closed' OR "source" = 'backfill'
          OR "reason_id" IS NOT NULL OR "stop_reason_key" IS NOT NULL),
	CONSTRAINT "quotation_reason_only_not_closed" CHECK ("outcome" = 'not-closed'
          OR ("reason_id" IS NULL AND "stop_reason_key" IS NULL AND "reason_note" IS NULL)),
	CONSTRAINT "quotation_other_has_note" CHECK ("reason_id" IS DISTINCT FROM 'other' OR "reason_note" IS NOT NULL),
	CONSTRAINT "quotation_no_blank" CHECK (btrim("reason_id") <> '' AND btrim("stop_reason_key") <> '' AND btrim("reason_note") <> '')
);--> statement-breakpoint
ALTER TABLE "sales"."quotation" ADD CONSTRAINT "quotation_opportunity_code_opportunity_code_fk" FOREIGN KEY ("opportunity_code") REFERENCES "sales"."opportunity"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."quotation" ADD CONSTRAINT "quotation_contract_code_contract_code_fk" FOREIGN KEY ("contract_code") REFERENCES "sales"."contract"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."quotation" ADD CONSTRAINT "quotation_touch_id_touch_id_fk" FOREIGN KEY ("touch_id") REFERENCES "sales"."touch"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."quotation" ADD CONSTRAINT "quotation_created_by_actor_id_fk" FOREIGN KEY ("created_by") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- "Is this round number taken", and "the quotations of this deal".
CREATE UNIQUE INDEX "quotation_round_uq" ON "sales"."quotation" USING btree ("opportunity_code",coalesce("kind", ''),"negotiation_no","round_no");--> statement-breakpoint
-- "Is a quotation of this negotiation still waiting" - at most one row says yes.
CREATE UNIQUE INDEX "quotation_one_pending_uq" ON "sales"."quotation" USING btree ("opportunity_code",coalesce("kind", ''),"negotiation_no") WHERE "outcome" = 'pending';--> statement-breakpoint

CREATE TABLE "sales"."document_step" (
	"attachment_id" uuid PRIMARY KEY NOT NULL,
	"step_kind" text NOT NULL,
	"quotation_id" uuid,
	"contract_code" text,
	"installment_no" integer,
	CONSTRAINT "document_step_kind_known" CHECK ("step_kind" IN ('quotation', 'contract', 'installment')),
	CONSTRAINT "document_step_one_target" CHECK (CASE "step_kind"
            WHEN 'quotation' THEN "quotation_id" IS NOT NULL AND "contract_code" IS NULL
                                  AND "installment_no" IS NULL
            WHEN 'contract' THEN "quotation_id" IS NULL AND "contract_code" IS NOT NULL
                                 AND "installment_no" IS NULL
            WHEN 'installment' THEN "quotation_id" IS NULL AND "contract_code" IS NOT NULL
                                    AND "installment_no" IS NOT NULL
            ELSE true
          END)
);--> statement-breakpoint
ALTER TABLE "sales"."document_step" ADD CONSTRAINT "document_step_attachment_id_attachment_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "platform"."attachment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."document_step" ADD CONSTRAINT "document_step_quotation_id_quotation_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "sales"."quotation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."document_step" ADD CONSTRAINT "document_step_contract_code_contract_code_fk" FOREIGN KEY ("contract_code") REFERENCES "sales"."contract"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- MATCH SIMPLE: skipped while "installment_no" is NULL, i.e. on a 'contract' row.
ALTER TABLE "sales"."document_step" ADD CONSTRAINT "document_step_installment_fk" FOREIGN KEY ("contract_code","installment_no") REFERENCES "sales"."contract_installment"("contract_code","no") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- "The files of this quotation" - the count beside each round.
CREATE INDEX "document_step_quotation_idx" ON "sales"."document_step" USING btree ("quotation_id") WHERE "quotation_id" IS NOT NULL;--> statement-breakpoint
-- "The files of this contract, by installment" - signed documents and the drawer.
CREATE INDEX "document_step_contract_idx" ON "sales"."document_step" USING btree ("contract_code","installment_no") WHERE "contract_code" IS NOT NULL;--> statement-breakpoint

-- Who recorded a payment, and when. ONE-WAY on purpose: a recorder needs a
-- paid row, but a paid row needs no recorder - every installment `seed.ts`
-- plants, and any paid before today, has `paid_at` and nobody to name. An
-- equality would refuse the seed; a made-up recorder would be a lie in a
-- column whose whole point is "who may undo this".
ALTER TABLE "sales"."contract_installment" ADD COLUMN "paid_by_id" text;--> statement-breakpoint
ALTER TABLE "sales"."contract_installment" ADD COLUMN "paid_recorded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sales"."contract_installment" ADD CONSTRAINT "contract_installment_paid_by_id_actor_id_fk" FOREIGN KEY ("paid_by_id") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."contract_installment" ADD CONSTRAINT "contract_installment_paid_recorder" CHECK (("paid_by_id" IS NULL) = ("paid_recorded_at" IS NULL)
          AND ("paid_by_id" IS NULL OR "paid_at" IS NOT NULL));--> statement-breakpoint

-- DATA 1 of 2 - the four starting reasons a quotation is "not closed". Only if
-- the list is empty, 0069's guard: a database that already holds rows is left
-- alone rather than given a second, differently-worded set.
INSERT INTO "sales"."config_entry" ("id", "list", "name", "ord")
SELECT v."id", 'QUOTE_REVISION_REASON', v."name", v."ord"
  FROM (VALUES
    ('QR-01', 'Khách chê giá cao', 1),
    ('QR-02', 'Khách đổi số lượng', 2),
    ('QR-03', 'Khách đổi phạm vi', 3),
    ('QR-04', 'Báo giá hết hiệu lực', 4)
  ) AS v("id", "name", "ord")
 WHERE NOT EXISTS (SELECT 1 FROM "sales"."config_entry" WHERE "list" = 'QUOTE_REVISION_REASON');--> statement-breakpoint

-- DATA 2 of 2 - one ledger row per `quotation-sent` touch, for deals the
-- ledger does not know yet. INSERT ONLY: a deal that already has a row is
-- skipped whole, so nothing a person or the new build wrote is ever rewritten
-- or renumbered. Touch rows are read, never written. Rule and why: ADR 0090.
--   negotiation_no  1 + the deal's contracts signed strictly BEFORE the touch
--   round_no        order of `at` inside the negotiation (`id` breaks a tie)
--   signed          the negotiation's contract is the deal's N-th by signed_at:
--                   last row `won`, earlier rows `not-closed`, all carry the code
--   deal lost       last row `not-closed` + the deal's `stop_reason`
--   otherwise       last row `pending`, earlier rows `not-closed`
-- `closed_at` is when the row stopped waiting: the next quotation, the
-- signature, or the stop. `kind` and `amount` stay NULL - a touch never knew.
-- KEEP THIS THE LAST STATEMENT: `src/seed-quotation.ts` runs the file's tail.
WITH "signed" AS (
  SELECT c."code", c."opportunity_code", c."signed_at",
         row_number() OVER (PARTITION BY c."opportunity_code" ORDER BY c."signed_at", c."code") AS "n"
    FROM "sales"."contract" c
), "sent" AS (
  SELECT t."id", t."at", t."actor_id", o."code" AS "opp", o."state", o."stop_reason",
         o."closed_at" AS "stopped_at",
         1 + (SELECT count(*) FROM "signed" s
               WHERE s."opportunity_code" = o."code" AND s."signed_at" < t."at")::int AS "neg"
    FROM "sales"."touch" t
    JOIN "sales"."opportunity" o ON o."code" = t."subject_code"
   WHERE t."kind" = 'quotation-sent' AND t."subject_kind" = 'opportunity'
     AND NOT EXISTS (SELECT 1 FROM "sales"."quotation" q WHERE q."opportunity_code" = o."code")
), "ranked" AS (
  SELECT s.*,
         row_number() OVER w AS "round",
         lead(s."at") OVER w AS "next_at"
    FROM "sent" s
  WINDOW w AS (PARTITION BY s."opp", s."neg" ORDER BY s."at", s."id")
), "calc" AS (
  SELECT r.*, c."code" AS "contract_code", c."signed_at"
    FROM "ranked" r
    LEFT JOIN "signed" c ON c."opportunity_code" = r."opp" AND c."n" = r."neg"
)
INSERT INTO "sales"."quotation"
  ("opportunity_code", "negotiation_no", "round_no", "sent_at", "source", "outcome",
   "closed_at", "stop_reason_key", "contract_code", "touch_id", "created_by")
SELECT k."opp", k."neg", k."round", k."at", 'backfill',
       CASE WHEN k."next_at" IS NOT NULL THEN 'not-closed'
            WHEN k."contract_code" IS NOT NULL THEN 'won'
            WHEN k."state" = 'lost' THEN 'not-closed'
            ELSE 'pending' END,
       CASE WHEN k."next_at" IS NOT NULL THEN k."next_at"
            WHEN k."contract_code" IS NOT NULL THEN k."signed_at"
            WHEN k."state" = 'lost' THEN GREATEST(k."stopped_at", k."at") END,
       CASE WHEN k."next_at" IS NULL AND k."contract_code" IS NULL AND k."state" = 'lost'
            THEN k."stop_reason" END,
       k."contract_code", k."id", k."actor_id"
  FROM "calc" k
 ORDER BY k."opp", k."neg", k."round"
ON CONFLICT DO NOTHING;
