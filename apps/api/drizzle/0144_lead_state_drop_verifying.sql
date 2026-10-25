-- 0144 - the lead state `verifying` is removed (ADR 0123). The backbone is
-- new -> assigned -> working -> converted; scheduling care moves nothing. Every
-- stored `verifying` (lead, its `platform.object` mirror, both stand columns)
-- becomes `assigned`, `state_since` kept. Lead `step_template` rows re-key to
-- `assigned`, switched off where an active `assigned` one holds the name (never
-- deleted: steps and touches point at them); a `state_rule` that would collide is
-- deleted. Touch kinds `care-planned`/`first-action` stay valid as legacy rows.
--
-- ORDER OUTSIDE: migrate BEFORE deploy. Until the deploy, the old build's care
-- scheduling is refused (23514); after it, the new build would meet `verifying`.
-- ORDER INSIDE: fences dropped, function replaced, data moved, fences re-added.
-- Re-runnable: IF EXISTS on DDL, every data statement guarded by its WHERE.
-- Hand-written for 0047's reason: `generate`'s baseline is still stuck at 0026.

ALTER TABLE "sales"."lead" DROP CONSTRAINT IF EXISTS "lead_state_known";--> statement-breakpoint
ALTER TABLE "sales"."lead" DROP CONSTRAINT IF EXISTS "lead_open_owner_matches";--> statement-breakpoint
ALTER TABLE "sales"."workstream" DROP CONSTRAINT IF EXISTS "workstream_stand_key_known";--> statement-breakpoint
ALTER TABLE "sales"."workstream" DROP CONSTRAINT IF EXISTS "workstream_stand_lead_key_known";--> statement-breakpoint
ALTER TABLE "sales"."step_template" DROP CONSTRAINT IF EXISTS "step_template_state_known";--> statement-breakpoint
ALTER TABLE "sales"."state_rule" DROP CONSTRAINT IF EXISTS "state_rule_state_known";--> statement-breakpoint

-- 0129's body again with a four-rung backbone and the trail walk re-indexed to
-- it. Replaced before the lead UPDATE so the stand trigger draws with the new rule.
CREATE OR REPLACE FUNCTION "sales"."workstream_stand"(ws_code text)
RETURNS TABLE (kind text, key text, code text, lead_key text, due_at timestamptz)
LANGUAGE plpgsql STABLE AS $fn$
DECLARE
  -- `StageKey.options`, `LEAD_LANE_BACKBONE` and `LeadTier.options`, copied out
  -- by hand: the day a ladder grows, that has to be a migration a person reads.
  stages      text[] := ARRAY['new', 'assigned', 'engaged', 'quotation'];
  backbone    text[] := ARRAY['new', 'assigned', 'working', 'converted'];
  tiers       text[] := ARRAY['prospect', 'mql', 'sql'];
  anchor      sales.lead%ROWTYPE;
  lead_rung   text;
  reached     int;
  deal        record;
  signed_code text;
  live        text;
  due         timestamptz;
BEGIN
  -- The anchor lead is read FIRST and unconditionally, because `lead_key` is
  -- computed even while the run stands on a deal: it is the rung a card falls
  -- back to for a reader who may not open that deal. One run, one lead - 0045.
  SELECT * INTO anchor
    FROM sales.lead l
   WHERE l.workstream_code = ws_code
   ORDER BY l.code
   LIMIT 1;

  -- No anchor lead YET is the normal intake path, not a broken row: the run is
  -- opened one statement before the lead that anchors it. Answer nothing, so
  -- the caller keeps what it has instead of writing a guess.
  IF NOT FOUND THEN RETURN; END IF;

  IF anchor.state = ANY (backbone) THEN
    lead_rung := anchor.state;
  ELSE
    -- Off the backbone (`nurturing`, the pool since ADR 0109): the furthest
    -- rung its trail PROVES it reached; the walk floors at `new`. Legacy
    -- `first-action`/`care-planned` rows proved a holder, so they read `assigned`.
    SELECT max(CASE
                 WHEN t.kind = 'entered-pipeline' THEN 3
                 WHEN t.kind IN ('verified', 'exchange-logged') THEN 2
                 WHEN t.kind IN ('first-action', 'care-planned') THEN 1
                 WHEN t.kind IN ('created', 'handed-over') AND t.to_actor_id IS NOT NULL THEN 1
                 ELSE 0
               END)
      INTO reached
      FROM sales.touch t
     WHERE t.subject_code = anchor.code;
    lead_rung := backbone[COALESCE(reached, 0) + 1];
  END IF;

  -- A deal that has left the four-column board carries no `stage` at all, so
  -- won and lost deals never stand anywhere. The tie-break is load-bearing
  -- now that the CODE travels too: `dealsOf` reads newest code first and
  -- `liveOf` keeps the first of a tie, so the highest code wins a shared rung.
  SELECT o.code, o.stage, o.stage_since INTO deal
    FROM sales.opportunity o
   WHERE o.workstream_code = ws_code
     AND o.stage IS NOT NULL
   ORDER BY array_position(stages, o.stage) DESC, o.code DESC
   LIMIT 1;

  IF FOUND THEN
    -- `pipelinePosition`: the STAGE ladder, the rung the deal stands on, and
    -- `stage_since` as the clock. `overdueBy` is then `now - due_at` in whole
    -- days, which is a subtraction the book can do in its ORDER BY.
    live := deal.code;
    due := deal.stage_since
         + make_interval(days => sales.ladder_limit_days('STAGE',
             array_position(stages, deal.stage), array_length(stages, 1)));
    RETURN QUERY SELECT 'OP'::text, deal.stage, live, lead_rung, due;
    RETURN;
  END IF;

  -- The NEWEST signature, the order `contractsOf` hands them to the mapper in,
  -- so two reads of one run never name two different contracts.
  SELECT c.code INTO signed_code
    FROM sales.contract c
   WHERE c.workstream_code = ws_code
   ORDER BY c.signed_at DESC, c.code DESC
   LIMIT 1;

  IF FOUND THEN
    -- No due date, and that is `inputOf` returning null for a run on a
    -- contract: no contract ladder exists in `config_entry`, so there is no
    -- rung to place it on and no clock to judge it by.
    RETURN QUERY SELECT 'HĐ'::text, 'signed'::text, signed_code, lead_rung, NULL::timestamptz;
    RETURN;
  END IF;

  -- The lead's clock is the TIER ladder against `state_since`, and a lead with
  -- no tier has no rung to be late on - `inputOf` returns null there too. Note
  -- it is the TIER rung, not the lifecycle rung `key` carries: the two ladders
  -- are different questions and only one of them has a configured clock.
  due := anchor.state_since
       + make_interval(days => sales.ladder_limit_days('TIER',
           array_position(tiers, anchor.tier), array_length(tiers, 1)));
  RETURN QUERY SELECT 'LD'::text, lead_rung, anchor.code, lead_rung, due;
END
$fn$;--> statement-breakpoint

UPDATE "sales"."lead" SET "state" = 'assigned' WHERE "state" = 'verifying';--> statement-breakpoint
UPDATE "platform"."object" SET "state" = 'assigned' WHERE "kind" = 'LD' AND "state" = 'verifying';--> statement-breakpoint

-- `workstream_stand_sync` joins INNER, so a run the function answers nothing for
-- keeps its stored pair: rewrite those directly. Then redraw every pool lead's
-- run, the only ones whose rung the re-indexed walk can now answer differently.
UPDATE "sales"."workstream" SET "stand_key" = 'assigned' WHERE "stand_kind" = 'LD' AND "stand_key" = 'verifying';--> statement-breakpoint
UPDATE "sales"."workstream" SET "stand_lead_key" = 'assigned' WHERE "stand_lead_key" = 'verifying';--> statement-breakpoint
SELECT "sales"."workstream_stand_sync"(ARRAY(
  SELECT DISTINCT l."workstream_code" FROM "sales"."lead" l
   WHERE l."state" = 'nurturing' AND l."workstream_code" IS NOT NULL));--> statement-breakpoint

-- The owner's care templates keep living one step earlier, listed after the
-- `assigned` ones. A name an active `assigned` template already holds is switched
-- off first, or `step_template_name_live` refuses the re-key.
UPDATE "sales"."step_template" v
   SET "active" = false
 WHERE v."object_kind" = 'lead' AND v."state_key" = 'verifying' AND v."active"
   AND EXISTS (SELECT 1 FROM "sales"."step_template" a
                WHERE a."object_kind" = 'lead' AND a."state_key" = 'assigned' AND a."active"
                  AND lower(a."name") = lower(v."name"));--> statement-breakpoint
UPDATE "sales"."step_template" v
   SET "state_key" = 'assigned',
       "ord" = v."ord" + COALESCE((SELECT max(a."ord") FROM "sales"."step_template" a
                                    WHERE a."object_kind" = 'lead' AND a."state_key" = 'assigned'), 0)
 WHERE v."object_kind" = 'lead' AND v."state_key" = 'verifying';--> statement-breakpoint

-- `state_rule_pk` is (kind, state): an existing `assigned` rule wins.
DELETE FROM "sales"."state_rule" v
 WHERE v."object_kind" = 'lead' AND v."state_key" = 'verifying'
   AND EXISTS (SELECT 1 FROM "sales"."state_rule" a
                WHERE a."object_kind" = 'lead' AND a."state_key" = 'assigned');--> statement-breakpoint
UPDATE "sales"."state_rule" SET "state_key" = 'assigned'
 WHERE "object_kind" = 'lead' AND "state_key" = 'verifying';--> statement-breakpoint

-- Five `LeadState` values now, not six.
ALTER TABLE "sales"."lead" ADD CONSTRAINT "lead_state_known" CHECK ("state" IN ('new', 'assigned', 'working', 'nurturing', 'converted'));--> statement-breakpoint
ALTER TABLE "sales"."lead" ADD CONSTRAINT "lead_open_owner_matches" CHECK ("state" NOT IN ('new', 'assigned', 'working', 'nurturing')
          OR (("state" IN ('new', 'nurturing')) = ("owner_id" IS NULL)));--> statement-breakpoint
ALTER TABLE "sales"."workstream" ADD CONSTRAINT "workstream_stand_key_known" CHECK (
  CASE "stand_kind"
    WHEN 'HĐ' THEN "stand_key" = 'signed'
    WHEN 'OP' THEN "stand_key" IN ('new', 'assigned', 'engaged', 'quotation')
    WHEN 'LD' THEN "stand_key" IN ('new', 'assigned', 'working', 'nurturing', 'converted')
    ELSE true
  END
);--> statement-breakpoint
ALTER TABLE "sales"."workstream" ADD CONSTRAINT "workstream_stand_lead_key_known" CHECK (
  "stand_lead_key" IN ('new', 'assigned', 'working', 'nurturing', 'converted')
);--> statement-breakpoint
ALTER TABLE "sales"."step_template" ADD CONSTRAINT "step_template_state_known" CHECK (("object_kind" <> 'lead' OR "state_key" IN ('new', 'assigned', 'working', 'nurturing'))
      AND ("object_kind" <> 'opportunity' OR "state_key" IN ('new', 'assigned', 'engaged', 'quotation'))
      AND ("object_kind" <> 'customer' OR "state_key" IN ('hot', 'warm', 'cold')));--> statement-breakpoint
ALTER TABLE "sales"."state_rule" ADD CONSTRAINT "state_rule_state_known" CHECK (("object_kind" <> 'lead' OR "state_key" IN ('new', 'assigned', 'working', 'nurturing'))
      AND ("object_kind" <> 'opportunity' OR "state_key" IN ('new', 'assigned', 'engaged', 'quotation'))
      AND ("object_kind" <> 'customer' OR "state_key" IN ('hot', 'warm', 'cold')));
