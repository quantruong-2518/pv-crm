-- 0131 - `sales.contract.collector_id`: the PIC who collects the money.
--
-- Until now the collector was implicitly `owner_id`, the one who closed the deal.
-- A collector must hold `contract.record-payment` and be active (the rule
-- `ContractCollectors` enforces at the sign door), and a closer with the `sale`
-- role does not hold it. So the backfill is NOT a plain copy of `owner_id`:
--   1. the owner, when the owner passes the rule;
--   2. else the primary person of the signing-day snapshot (`contract_participant`,
--      ADR 0086), when that person passes it;
--   3. else the first person who passes it: `head-of-sales`, then `director`,
--      then the rest, each group by name then id.
-- "Passes the rule" is read from `platform.role_permission`, the table the guard
-- reads, plus the `Sales` licence: the same three tests `access.check` makes.
-- A role edited on the admin screen is therefore honoured; a hardcoded role list
-- would not be. The same pick rewrites every `contract-sign` approval payload
-- that lacks `sign.collectorId` (the profile re-parses them all, decided or not).
-- The migrator is one transaction; if nobody passes the rule the guard names the
-- count instead of leaving rows without a collector.
-- Real FK to `platform.actor`, like `owner_id`: a collector is a signed-in person.
-- ADDITIVE on purpose: the column stays NULLABLE here. The build running when this
-- lands INSERTs contracts without it; NOT NULL would break signing until the new
-- API is up. A later migration re-runs this backfill (and the approval patch) for
-- rows written in that window, then sets NOT NULL. ORDER: migrate, then deploy.
-- Re-runnable: IF [NOT] EXISTS on DDL, guarded data. Hand-written for 0047's
-- reason: `generate`'s baseline is still stuck at 0026.
ALTER TABLE "sales"."contract" ADD COLUMN IF NOT EXISTS "collector_id" text;--> statement-breakpoint

DO $$
DECLARE
	collectors text[];
	n integer;
BEGIN
	SELECT coalesce(array_agg(a."id" ORDER BY
	         CASE WHEN 'head-of-sales' = ANY(a."role_ids") THEN 0
	              WHEN 'director' = ANY(a."role_ids") THEN 1 ELSE 2 END,
	         a."name", a."id"), '{}')
	  INTO collectors
	  FROM "platform"."actor" a
	 WHERE a."disabled_at" IS NULL
	   AND 'Sales' = ANY(a."branches")
	   AND EXISTS (SELECT 1 FROM "platform"."role_permission" rp
	                WHERE rp."role_id" = ANY(a."role_ids")
	                  AND rp."permission" = 'contract.record-payment');

	UPDATE "sales"."contract" c
	   SET "collector_id" = coalesce(
	         CASE WHEN c."owner_id" = ANY(collectors) THEN c."owner_id" END,
	         (SELECT p."actor_id" FROM "sales"."contract_participant" p
	           WHERE p."contract_code" = c."code" AND p."is_primary"
	             AND p."actor_id" = ANY(collectors)
	           ORDER BY array_position(collectors, p."actor_id") LIMIT 1),
	         collectors[1])
	 WHERE c."collector_id" IS NULL;

	SELECT count(*) INTO n FROM "sales"."contract" WHERE "collector_id" IS NULL;
	IF n > 0 THEN
		RAISE EXCEPTION '0131: % contract(s) have no collector: nobody active holds contract.record-payment with the Sales licence', n;
	END IF;

	-- A sign request carries the same key in its jsonb payload; approving it and
	-- the opportunity profile both re-parse `ContractSignProposal`, where the key
	-- is now required. The signer named in the payload, else the person who
	-- raised it, else the first collector. Decided rows too.
	UPDATE "platform"."approval" a
	   SET "payload" = jsonb_set(a."payload", '{sign,collectorId}', to_jsonb(coalesce(
	         CASE WHEN a."payload" #>> '{sign,ownerId}' = ANY(collectors)
	              THEN a."payload" #>> '{sign,ownerId}' END,
	         CASE WHEN a."raised_by_id" = ANY(collectors) THEN a."raised_by_id" END,
	         collectors[1])))
	 WHERE a."kind" = 'contract-sign'
	   AND jsonb_typeof(a."payload" -> 'sign') = 'object'
	   AND coalesce(a."payload" #>> '{sign,collectorId}', '') = ''
	   AND collectors[1] IS NOT NULL;

	SELECT count(*) INTO n FROM "platform"."approval"
	 WHERE "kind" = 'contract-sign' AND jsonb_typeof("payload" -> 'sign') = 'object'
	   AND coalesce("payload" #>> '{sign,collectorId}', '') = '';
	IF n > 0 THEN
		RAISE EXCEPTION '0131: % contract-sign request(s) have no collectorId: nobody active holds contract.record-payment with the Sales licence', n;
	END IF;
END $$;--> statement-breakpoint

ALTER TABLE "sales"."contract" DROP CONSTRAINT IF EXISTS "contract_collector_id_actor_id_fk";--> statement-breakpoint
ALTER TABLE "sales"."contract" ADD CONSTRAINT "contract_collector_id_actor_id_fk" FOREIGN KEY ("collector_id") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contract_collector_idx" ON "sales"."contract" USING btree ("collector_id");
