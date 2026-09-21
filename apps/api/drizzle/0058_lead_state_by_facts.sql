-- 0058 - a lead's state is read off FACTS, not off `tier`: `verifying` means the
-- owner scheduled care, `working` means a real exchange was logged. Tier is
-- decoupled from both (ADR 0063), so `lead_working_has_tier` goes.
--
-- Two new touch kinds carry those facts: `care-planned` (-> `verifying`) and
-- `exchange-logged` (-> `working`, carrying NO tier). `first-action` and
-- `verified` stay valid FOREVER - the rows written under them are on disk, so
-- every walk of the trail reads both spellings at the same rung.
--
-- `sales.workstream_stand()` is re-emitted whole with two edits: each rung test
-- gains the new kind beside its legacy twin, and the `nurturing` branch stops
-- deriving its rung from `tier` - it asks whether an exchange was ever logged.
-- Stored stands are resynced for nurturing leads only, because they are the only
-- runs whose answer this function can now give differently.
-- Hand-written for 0047-0057's reason: `generate`'s baseline is stuck at 0026.
ALTER TABLE "sales"."lead" DROP CONSTRAINT "lead_working_has_tier";--> statement-breakpoint

-- Eighteen kinds now. Copied out by hand for 0046/0052/0054's reason: a CHECK is
-- a string in a migration, so the day the contract's enum grows has to be a
-- migration a person reads. `touch_tier_raised_has_tier` is deliberately NOT
-- touched - legacy `verified` rows still carry the tier of the day, and
-- `exchange-logged` is not named by it, so it may carry none.
ALTER TABLE "sales"."touch" DROP CONSTRAINT "touch_kind_known";--> statement-breakpoint
ALTER TABLE "sales"."touch" ADD CONSTRAINT "touch_kind_known" CHECK ("kind" IN ('created', 'contacted', 'field-filled', 'handed-over', 'tier-raised',
                     'care-planned', 'exchange-logged', 'first-action', 'verified',
                     'nurtured', 'resumed', 'archived', 'first-meeting',
                     'entered-pipeline', 'stage-changed', 'signed', 'exited',
                     'reopened'));--> statement-breakpoint

-- Seven kinds a rung is read off, not five, and the WHEN still keeps the other
-- eleven from ever entering the function - `sales.touch` is the most written
-- table of the branch, and 0062 measured what that early exit is worth.
DROP TRIGGER "touch_workstream_stand" ON "sales"."touch";--> statement-breakpoint
CREATE TRIGGER "touch_workstream_stand"
AFTER INSERT ON "sales"."touch"
FOR EACH ROW
WHEN (NEW."subject_kind" = 'lead'
      AND NEW."kind" IN ('created', 'handed-over', 'first-action', 'care-planned',
                         'verified', 'exchange-logged', 'entered-pipeline'))
EXECUTE FUNCTION "sales"."workstream_stand_bump_touch"();--> statement-breakpoint

-- The whole 0056 body again, because a function is replaced whole. Everything
-- outside the two edits named in the header is 0056 verbatim.
CREATE OR REPLACE FUNCTION "sales"."workstream_stand"(ws_code text)
RETURNS TABLE (kind text, key text, code text, lead_key text, due_at timestamptz)
LANGUAGE plpgsql STABLE AS $fn$
DECLARE
  -- `StageKey.options`, `LEAD_LANE_BACKBONE` and `LeadTier.options`, copied out
  -- by hand: the day a ladder grows, that has to be a migration a person reads.
  stages      text[] := ARRAY['new', 'discovery', 'demo-done', 'quoted', 'awaiting-signature'];
  backbone    text[] := ARRAY['new', 'assigned', 'verifying', 'working', 'converted'];
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

  IF anchor.state = 'nurturing' THEN
    -- `nurturing` is a stop, not a step forward, so the lead is drawn exactly
    -- where `resume` would put it back - and that is a FACT now, not a tier: an
    -- exchange was logged, or care had only ever been planned.
    lead_rung := CASE
                   WHEN EXISTS (SELECT 1
                                  FROM sales.touch t
                                 WHERE t.subject_code = anchor.code
                                   AND t.kind IN ('verified', 'exchange-logged'))
                   THEN 'working'
                   ELSE 'verifying'
                 END;
  ELSIF anchor.state = ANY (backbone) THEN
    lead_rung := anchor.state;
  ELSE
    -- Off the backbone (`disqualified`, `archived`): the furthest rung its
    -- trail PROVES it reached, never the one it was heading for. Rung `new`
    -- needs no row - every lead has a creation date - so the walk floors at 0.
    SELECT max(CASE
                 WHEN t.kind = 'entered-pipeline' THEN 4
                 WHEN t.kind IN ('verified', 'exchange-logged') THEN 3
                 WHEN t.kind IN ('first-action', 'care-planned') THEN 2
                 WHEN t.kind IN ('created', 'handed-over') AND t.to_actor_id IS NOT NULL THEN 1
                 ELSE 0
               END)
      INTO reached
      FROM sales.touch t
     WHERE t.subject_code = anchor.code;
    lead_rung := backbone[COALESCE(reached, 0) + 1];
  END IF;

  -- A deal that has left the five-column board carries no `stage` at all, so
  -- won and lost deals never stand anywhere. The tie-break is load-bearing now
  -- that the CODE travels too: `dealsOf` reads newest code first and `liveOf`
  -- keeps the first of a tie, so the highest code wins a shared rung.
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

-- The only stands whose value can have moved: a nurturing lead used to be drawn
-- by its tier and is now drawn by its trail. Every other state reads its rung
-- straight off `lead.state`, which no statement here changes. `sync` itself
-- writes nothing where the five columns already agree, so an empty list and a
-- book with no nurturing lead are the same no-op.
SELECT "sales"."workstream_stand_sync"(
  ARRAY(SELECT l."workstream_code"
          FROM "sales"."lead" l
         WHERE l."state" = 'nurturing'
           AND l."workstream_code" IS NOT NULL)
);
