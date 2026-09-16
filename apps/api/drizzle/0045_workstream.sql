-- 0045 - `sales.workstream`: ONE CUSTOMER JOURNEY gets a row of its own, and
-- the three tables that make up a journey get a key pointing at it.
--
-- Until now the only thing grouping a lead, its deals and its contract was the
-- chain of foreign keys between them, which answers "what came out of this
-- lead" and cannot answer "how many separate runs have we had at this
-- company". `closed_at` is the column that makes the second question possible:
-- an account lives for ever, a run ends.
--
-- ------------------------------------------------------------------------
-- NO `platform.object` MIRROR ROW, DELIBERATELY
-- ------------------------------------------------------------------------
-- `ObjectKind` in `packages/engines/src/types.ts` has no `'WS'`, so there is
-- no legal mirror row for a workstream and a foreign key from `code` into
-- `platform.object` would refuse every insert this migration makes - a fence
-- failing a legitimate write, which `touch.schema.ts` already argues is worse
-- than no fence. Giving E1 a `WS` kind is an engine change, not a table
-- change, and it is not this migration.
--
-- ------------------------------------------------------------------------
-- WHY THE BACKFILL GROUPS BY LEAD AND NOT BY ACCOUNT
-- ------------------------------------------------------------------------
-- Migration 0026 grouped 100 fixture leads into companies by
-- `coalesce(tax_code, lower(name))`. That was the right rule for a COMPANY
-- book and it is the wrong rule here, for two reasons that both bite:
--
--   1. `lead.account_code` is NULLABLE. On a database built from migrations
--      and then seeded, 0026 ran against an EMPTY lead table, so
--      `sales.account` holds 0 rows and all 100 leads carry a NULL account.
--      Grouping by account there creates ZERO workstreams and strands every
--      single lead.
--   2. Grouping by account is grouping by exactly the thing `closed_at` exists
--      to separate. The 2024 purchase and the 2026 purchase at one company
--      would land in one endless row, which is the bug, not the backfill.
--
-- A lead is where a run starts, `lead.code` is never null, and every deal and
-- every contract already reaches a lead through a NOT NULL foreign key. So
-- one workstream per lead produces a code for every row in all three tables,
-- with no orphan possible - that last part is guaranteed by the existing
-- fences, not measured.
--
-- ------------------------------------------------------------------------
-- WHY SOME BACKFILLED ROWS ARE CLOSED, AND WHERE THE DATE COMES FROM
-- ------------------------------------------------------------------------
-- Leaving every row open would put a column with no non-null value in it into
-- production and would make the book's default filter (`status: 'open'`, see
-- `WorkstreamBookQuery`) report every finished journey as running. Two ends
-- are already WRITTEN DOWN in the data and neither has to be invented:
--
--   WON   `sales.contract.signed_at` - NOT NULL on every contract row.
--   LOST  `sales.lead.exited_at` - guaranteed non-null exactly when
--         `exit_reason` is, by the `lead_exit_pair` CHECK.
--
-- This matches the definition of "still running" the lead book already uses
-- (`lead.repository.ts#statusFilter`: not exited and not signed). WON wins
-- when a lead somehow carries both. CHURNED is set on NOTHING: no column in
-- this database records a customer who bought and did not come back, and
-- deriving one would be inventing business data.
--
-- `opened_at` is `least()` of the lead's `created_at` and whichever close date
-- the row got. Every value in that expression is a real recorded date; the
-- `least` is there so a backdated signature cannot abort the whole migration
-- against the `workstream_closed_after_opened` CHECK on a database nobody can
-- inspect from here. The `RAISE NOTICE` below prints how many rows that
-- applied to, so the number is in the migration log rather than guessed.
--
-- ------------------------------------------------------------------------
-- COUNTS - MEASURED LOCALLY, AND WHAT MUST BE COUNTED ON NEON FIRST
-- ------------------------------------------------------------------------
-- On a local PGlite database built by the migrate and seed commands:
--   100 leads   -> 100 workstream rows, 100 lead rows updated
--    16 deals   ->  16 opportunity rows updated
--     6         ->   6 contract rows updated
--    58 closed  ->   6 WON + 52 LOST; 42 rows left open; 0 CHURNED
--     0 rows with a close date before the lead's `created_at`
--
-- NEON CANNOT BE INFERRED FROM THE FIXTURE. 0026 measured 125 leads on Neon
-- against the fixture's 100, and the import door has been open since. The
-- pre-flight is the same one ADR 0032 recorded for the lead side of its own
-- UPDATE - run this before the migration and keep the output:
--
--   SELECT count(*) FROM sales.lead;
--   SELECT count(*) FROM sales.opportunity;
--   SELECT count(*) FROM sales.contract;
--   SELECT count(*) FROM sales.lead l
--    WHERE l.exit_reason IS NOT NULL
--       OR EXISTS (SELECT 1 FROM sales.contract c WHERE c.lead_code = l.code);
--
-- The first number is the number of `WS-` codes this migration mints, and the
-- sequence starts at 1 because nothing in any fixture, seed or migration has
-- ever minted one.
CREATE SEQUENCE "sales"."workstream_code_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "sales"."workstream" (
	"code" text PRIMARY KEY NOT NULL,
	"account_code" text,
	"opened_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"close_reason" text,
	CONSTRAINT "workstream_close_pair" CHECK (("closed_at" IS NULL) = ("close_reason" IS NULL)),
	CONSTRAINT "workstream_closed_after_opened" CHECK ("closed_at" IS NULL OR "closed_at" >= "opened_at"),
	CONSTRAINT "workstream_close_reason_known" CHECK ("close_reason" IS NULL OR "close_reason" IN ('WON', 'LOST', 'CHURNED'))
);
--> statement-breakpoint
ALTER TABLE "sales"."account" ADD COLUMN "owner_id" text;--> statement-breakpoint
ALTER TABLE "sales"."lead" ADD COLUMN "workstream_code" text;--> statement-breakpoint
ALTER TABLE "sales"."opportunity" ADD COLUMN "workstream_code" text;--> statement-breakpoint
ALTER TABLE "sales"."contract" ADD COLUMN "workstream_code" text;--> statement-breakpoint
ALTER TABLE "sales"."workstream" ADD CONSTRAINT "workstream_account_code_account_code_fk" FOREIGN KEY ("account_code") REFERENCES "sales"."account"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."account" ADD CONSTRAINT "account_owner_id_actor_id_fk" FOREIGN KEY ("owner_id") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."lead" ADD CONSTRAINT "lead_workstream_code_workstream_code_fk" FOREIGN KEY ("workstream_code") REFERENCES "sales"."workstream"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."opportunity" ADD CONSTRAINT "opportunity_workstream_code_workstream_code_fk" FOREIGN KEY ("workstream_code") REFERENCES "sales"."workstream"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."contract" ADD CONSTRAINT "contract_workstream_code_workstream_code_fk" FOREIGN KEY ("workstream_code") REFERENCES "sales"."workstream"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
/* "Which runs has this company had, and is one of them still open" - the
   question that tells a repeat customer from a first-time one. */
CREATE INDEX "workstream_account_idx" ON "sales"."workstream" USING btree ("account_code");--> statement-breakpoint
/* "Everything belonging to this run" - the book screen groups by this column
   in all three tables, and this is the hottest join of the feature. */
CREATE INDEX "lead_workstream_idx" ON "sales"."lead" USING btree ("workstream_code");--> statement-breakpoint
CREATE INDEX "opportunity_workstream_idx" ON "sales"."opportunity" USING btree ("workstream_code");--> statement-breakpoint
CREATE INDEX "contract_workstream_idx" ON "sales"."contract" USING btree ("workstream_code");--> statement-breakpoint
/* ==========================================================================
   HAND-WRITTEN - BACKFILL. STANDS EXACTLY HERE, DO NOT MOVE.
   ==========================================================================
   `drizzle-kit` only generates the SHAPE. Everything from here down is DATA,
   and it runs AFTER the five foreign keys above rather than before them - the
   opposite of 0026, and on purpose. There the columns already held values, so
   a key added first would have been refused. Here the three `workstream_code`
   columns are brand new and entirely NULL, so the keys cost nothing to add and
   every row this backfill writes is written under a live fence: a bad code is
   refused now instead of discovered later.

   Regenerating this file with the drizzle generate command drops this block -
   copy it back, the same debt 0026 and `config_ord_uniq` already wrote down.

   The only `DROP` here is of a TEMP table this block creates four statements
   earlier. The operating rule against `DROP` is about business data; a table
   that lives for four statements is not that.
   ========================================================================== */
CREATE TEMP TABLE "_workstream_backfill" AS
SELECT
  'WS-' || lpad(nextval('sales.workstream_code_seq')::text, 4, '0') AS code,
  x.lead_code, x.account_code, x.created_at, x.closed_at, x.close_reason
FROM (
  /* ONE ROW PER LEAD - see the header for why this is not one row per
     account. `signed_at` beats `exited_at` when a lead carries both: a
     signature is a stronger statement about how a run ended than a funnel
     exit, and the lead book already treats `signed` as its own status. */
  SELECT l.code AS lead_code,
         l.account_code,
         l.created_at,
         coalesce(c.signed_at, l.exited_at) AS closed_at,
         CASE
           WHEN c.signed_at IS NOT NULL THEN 'WON'
           WHEN l.exited_at IS NOT NULL THEN 'LOST'
         END AS close_reason
  FROM sales.lead l
  LEFT JOIN LATERAL (
    SELECT max(ct.signed_at) AS signed_at
    FROM sales.contract ct
    WHERE ct.lead_code = l.code
  ) c ON true
  ORDER BY l.created_at, l.code
) x;--> statement-breakpoint
/* Information, not a gate - same role the count in 0042 plays. A run whose
   recorded close date precedes the lead row's `created_at` is a backdated
   signature, not a corrupt row, and the `least()` below is what keeps it from
   aborting the migration. The number belongs in the log either way. */
DO $$
DECLARE
	backdated bigint;
BEGIN
	SELECT count(*) INTO backdated
	FROM "_workstream_backfill"
	WHERE "closed_at" IS NOT NULL AND "closed_at" < "created_at";

	RAISE NOTICE '0045 backfill: rows whose close date precedes the lead created_at = %', backdated;
END $$;--> statement-breakpoint
INSERT INTO sales.workstream (code, account_code, opened_at, closed_at, close_reason)
SELECT code, account_code, least(created_at, coalesce(closed_at, created_at)), closed_at, close_reason
FROM "_workstream_backfill";--> statement-breakpoint
UPDATE sales.lead l
   SET workstream_code = b.code
  FROM "_workstream_backfill" b
 WHERE b.lead_code = l.code;--> statement-breakpoint
/* A deal takes the run of the lead it grew out of, and a contract takes the
   run of the lead it names - `opportunity.lead_code` and `contract.lead_code`
   are both NOT NULL with a foreign key, so neither statement can leave a row
   behind. Same standing as `account_code`: a copy of a key, not a second
   opinion about which run this is. */
UPDATE sales.opportunity o
   SET workstream_code = l.workstream_code
  FROM sales.lead l
 WHERE l.code = o.lead_code;--> statement-breakpoint
UPDATE sales.contract ct
   SET workstream_code = l.workstream_code
  FROM sales.lead l
 WHERE l.code = ct.lead_code;--> statement-breakpoint
DROP TABLE "_workstream_backfill";
