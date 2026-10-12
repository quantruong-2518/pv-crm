-- 0100 - the person in charge, stored instead of re-derived (ADR 0086).
--
-- Three fences, one owner decision each:
--   1. `opportunity_owner.is_primary` - the SALE lane names ONE accountable
--      person. Until now `holderOf` picked it on every read from name order.
--   2. `contract_participant` - the deal's SALE/BD people frozen at signing,
--      because `opportunity_owner` keeps moving after the contract exists.
--   3. `campaign.owner_id` becomes a real foreign key to `platform.actor`.
--
-- "A non-empty SALE lane has AT LEAST one primary" spans rows, so no CHECK can
-- say it: the service keeps it. The database only caps it at one.
--
-- Additive for old code: `is_primary` defaults to false, so a writer deployed
-- before this migration still inserts valid rows. It leaves the lane WITHOUT a
-- primary, though (and the old hand-over deletes the primary's row), so readers
-- must fall back to the old rule until the new writers are live.
--
-- Locks: ADD COLUMN with a constant default is metadata-only; the CHECK and
-- the unique index each scan `opportunity_owner` (small); the campaign FK
-- scans `campaign` and takes SHARE ROW EXCLUSIVE on `platform.actor`.
--
-- Hand-written for 0047's reason: `generate`'s baseline is still stuck at 0026.
ALTER TABLE "sales"."opportunity_owner" ADD COLUMN "is_primary" boolean DEFAULT false NOT NULL;--> statement-breakpoint

-- Backfill 1. Where the SALE lane holds a seller, the primary is the person
-- `holderOf` (opportunity.mapper.ts) already picks, so that holder does not
-- move: the first seller by actor name then id compared by CODE POINT - hence
-- COLLATE "C", so Neon's locale cannot pick someone else. The seller list is
-- `SELLER_ROLES` from @pv/contracts, copied out by hand; `false` sorts before
-- `true`, which is what puts sellers first.
-- A lane with NO seller (legacy: a head standing on SALE) takes its first
-- owner in the same order. That is the owner's rule and NOT what `holderOf`
-- answers there (acceptor, else first BD). A deal with no SALE row gets none.
UPDATE "sales"."opportunity_owner" AS o
SET "is_primary" = true
FROM (
  SELECT DISTINCT ON (w."opportunity_code") w."opportunity_code", w."actor_id"
  FROM "sales"."opportunity_owner" AS w
  JOIN "platform"."actor" AS a ON a."id" = w."actor_id"
  WHERE w."role" = 'SALE'
  ORDER BY w."opportunity_code",
           NOT (a."role_ids" && ARRAY['sale', 'account-executive']::text[]),
           a."name" COLLATE "C",
           a."id" COLLATE "C"
) AS p
WHERE o."opportunity_code" = p."opportunity_code"
  AND o."actor_id" = p."actor_id"
  AND o."role" = 'SALE';--> statement-breakpoint

ALTER TABLE "sales"."opportunity_owner" ADD CONSTRAINT "opportunity_owner_primary_is_sale" CHECK (NOT "is_primary" OR "role" = 'SALE');--> statement-breakpoint
CREATE UNIQUE INDEX "opportunity_owner_one_primary_idx" ON "sales"."opportunity_owner" USING btree ("opportunity_code") WHERE "is_primary";--> statement-breakpoint

CREATE TABLE "sales"."contract_participant" (
	"contract_code" text NOT NULL,
	"actor_id" text NOT NULL,
	"role" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	CONSTRAINT "contract_participant_pk" PRIMARY KEY("contract_code","actor_id","role"),
	CONSTRAINT "contract_participant_role_known" CHECK ("role" IN ('SALE', 'BD')),
	CONSTRAINT "contract_participant_primary_is_sale" CHECK (NOT "is_primary" OR "role" = 'SALE')
);--> statement-breakpoint
ALTER TABLE "sales"."contract_participant" ADD CONSTRAINT "contract_participant_contract_code_contract_code_fk" FOREIGN KEY ("contract_code") REFERENCES "sales"."contract"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."contract_participant" ADD CONSTRAINT "contract_participant_actor_id_actor_id_fk" FOREIGN KEY ("actor_id") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contract_participant_one_primary_idx" ON "sales"."contract_participant" USING btree ("contract_code") WHERE "is_primary";--> statement-breakpoint

-- Backfill 2: contracts that already exist get the deal's owners as they
-- stand TODAY, after backfill 1 - migration day, not signing day. Nothing
-- recorded the signing-day list, so this is the best record there is.
INSERT INTO "sales"."contract_participant" ("contract_code", "actor_id", "role", "is_primary")
SELECT c."code", w."actor_id", w."role", w."is_primary"
FROM "sales"."contract" AS c
JOIN "sales"."opportunity_owner" AS w ON w."opportunity_code" = c."opportunity_code";--> statement-breakpoint

-- `campaign.owner_id` was a bare text, so it may name nobody. Those become
-- "no owner" - the state the column already allows - or the FK could not build.
UPDATE "sales"."campaign" AS c
SET "owner_id" = NULL
WHERE c."owner_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "platform"."actor" AS a WHERE a."id" = c."owner_id");--> statement-breakpoint
ALTER TABLE "sales"."campaign" ADD CONSTRAINT "campaign_owner_id_actor_id_fk" FOREIGN KEY ("owner_id") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;
