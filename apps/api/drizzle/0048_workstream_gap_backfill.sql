-- 0048 - close the gap `0045` left open: write doors are only now being
-- taught to mint a workstream per new lead, so every lead inserted between
-- `0045` running and that teaching landing has `workstream_code IS NULL` -
-- and so do its opportunities and contracts. `0045`'s rules (`WS-` off
-- `sales.workstream_code_seq`, WON beats LOST, `opened_at` = `least()` of
-- `created_at` and the close date) with one change: WON needs no deal still
-- open, the lead book's `signed` rule, since a lead may now run several deals.
-- Restricted to the gap by the `IS NULL` filters below, which makes this a
-- NO-OP once every lead carries a code — and safe to re-run by hand right after
-- the deploy, for leads the old API wrote between migrate and release.
--
-- Hand-written for the same reason `0047` was: `meta/00[27-46]_snapshot.json`
-- do not exist, so `drizzle-kit generate`'s baseline is stuck at `0026` and a
-- real run replays every migration since as one diff.
DO $$
DECLARE
	leads_stamped bigint;
	opps_stamped bigint;
	contracts_stamped bigint;
BEGIN
	CREATE TEMP TABLE "_workstream_gap" AS
	SELECT
	  'WS-' || lpad(nextval('sales.workstream_code_seq')::text, 4, '0') AS code,
	  x.lead_code, x.account_code, x.created_at, x.closed_at, x.close_reason
	FROM (
	  SELECT l.code AS lead_code,
	         l.account_code,
	         l.created_at,
	         CASE
	           WHEN c.signed_at IS NOT NULL AND NOT o.open_deal THEN c.signed_at
	           ELSE l.exited_at
	         END AS closed_at,
	         CASE
	           WHEN c.signed_at IS NOT NULL AND NOT o.open_deal THEN 'WON'
	           WHEN l.exited_at IS NOT NULL THEN 'LOST'
	         END AS close_reason
	  FROM sales.lead l
	  LEFT JOIN LATERAL (
	    SELECT max(ct.signed_at) AS signed_at
	    FROM sales.contract ct
	    WHERE ct.lead_code = l.code
	  ) c ON true
	  LEFT JOIN LATERAL (
	    SELECT EXISTS (
	      SELECT 1 FROM sales.opportunity op
	       WHERE op.lead_code = l.code AND op.state <> 'close-lost'
	         AND NOT EXISTS (SELECT 1 FROM sales.contract k WHERE k.opportunity_code = op.code)
	    ) AS open_deal
	  ) o ON true
	  WHERE l.workstream_code IS NULL
	  ORDER BY l.created_at, l.code
	) x;

	INSERT INTO sales.workstream (code, account_code, opened_at, closed_at, close_reason)
	SELECT code, account_code, least(created_at, coalesce(closed_at, created_at)), closed_at, close_reason
	FROM "_workstream_gap";

	UPDATE sales.lead l
	   SET workstream_code = g.code
	  FROM "_workstream_gap" g
	 WHERE g.lead_code = l.code;
	GET DIAGNOSTICS leads_stamped = ROW_COUNT;

	UPDATE sales.opportunity o
	   SET workstream_code = l.workstream_code
	  FROM sales.lead l
	 WHERE l.code = o.lead_code AND o.workstream_code IS NULL;
	GET DIAGNOSTICS opps_stamped = ROW_COUNT;

	UPDATE sales.contract ct
	   SET workstream_code = l.workstream_code
	  FROM sales.lead l
	 WHERE l.code = ct.lead_code AND ct.workstream_code IS NULL;
	GET DIAGNOSTICS contracts_stamped = ROW_COUNT;

	DROP TABLE "_workstream_gap";

	RAISE NOTICE '0048 gap backfill: % leads, % opportunities, % contracts stamped', leads_stamped, opps_stamped, contracts_stamped;
END $$;
