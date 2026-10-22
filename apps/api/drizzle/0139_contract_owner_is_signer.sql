-- 0139 - `sales.contract.owner_id` becomes the contract's creator (ADR 0113).
--
-- ADR 0110 §1 put a non-seller's signature on the deal's Sale PIC, so old rows
-- credit the PIC for contracts someone else created. The creator is read back,
-- never guessed:
--   1. the `signed` touch on the deal whose note names this contract: its actor
--      is the signer, or on the approval path the raiser (the sign door writes
--      `by` = raiser, not the approving director);
--   2. else the approved `contract-sign` request for the same deal whose frozen
--      `sign.signedAt` equals the contract's `signed_at`: its `raised_by_id`.
-- Either source must name exactly one person, and that person must exist in
-- `platform.actor`; otherwise the row keeps its owner. `collector_id` is untouched.
-- The `HĐ` mirror row in `platform.object` follows, in the same statement, for
-- the rows moved here only. Live KPI, leaderboard and the contract book follow;
-- closed KPI months (`sales.kpi_month_value`) keep their frozen numbers.
-- ORDER: migrate, deploy, then run this file once more for rows the old build
-- signed in between. Re-runnable: a second run moves nothing.
WITH "by_touch" AS (
	SELECT c."code", min(t."actor_id") AS "actor_id"
	  FROM "sales"."contract" c
	  JOIN "sales"."touch" t
	    ON t."kind" = 'signed' AND t."subject_kind" = 'opportunity'
	   AND t."subject_code" = c."opportunity_code"
	   AND t."note" = 'Ký hợp đồng ' || c."code"
	   AND t."actor_id" IS NOT NULL
	 GROUP BY c."code"
	HAVING count(DISTINCT t."actor_id") = 1
), "by_request" AS (
	-- A deal may sign more than once, so the deal code alone is not enough: the
	-- signing moment the request froze ties it to one contract.
	SELECT c."code", min(a."raised_by_id") AS "actor_id"
	  FROM "sales"."contract" c
	  JOIN "platform"."approval" a
	    ON a."kind" = 'contract-sign' AND a."state" = 'approved'
	   AND a."payload" ->> 'opportunityCode' = c."opportunity_code"
	   AND (a."payload" #>> '{sign,signedAt}')::timestamptz = c."signed_at"
	 GROUP BY c."code"
	HAVING count(DISTINCT a."raised_by_id") = 1
), "creator" AS (
	SELECT c."code", coalesce(bt."actor_id", br."actor_id") AS "actor_id"
	  FROM "sales"."contract" c
	  LEFT JOIN "by_touch" bt ON bt."code" = c."code"
	  LEFT JOIN "by_request" br ON br."code" = c."code"
), "moved" AS (
	UPDATE "sales"."contract" c
	   SET "owner_id" = p."id"
	  FROM "creator" k
	  JOIN "platform"."actor" p ON p."id" = k."actor_id"
	 WHERE c."code" = k."code"
	   AND c."owner_id" IS DISTINCT FROM p."id"
	RETURNING c."code", c."owner_id"
)
UPDATE "platform"."object" o
   SET "owner" = p."name", "owner_id" = p."id"
  FROM "moved" m
  JOIN "platform"."actor" p ON p."id" = m."owner_id"
 WHERE o."code" = m."code" AND o."kind" = 'HĐ';
