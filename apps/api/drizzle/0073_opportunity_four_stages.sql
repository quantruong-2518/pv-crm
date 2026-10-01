-- 0073 - ADR 0072: a deal has FOUR stages - `new`, `assigned`, `engaged`,
-- `quotation`. Sample and POC stop being columns; with demo and site visit
-- they are repeatable care activities recorded as touches, so the
-- `sample-sent`/`poc-run` rows already on disk ARE that history and stay.
--
-- Every fence naming a stage is dropped FIRST and re-added LAST with the four
-- keys, so no ADD CONSTRAINT sees a value it is about to refuse. Every data
-- statement matches zero rows on a second run. A deal moved to `engaged` is
-- clocked from its first move into `engaged`, so the clock covers both old legs.
--
-- Two fences are NEW rather than re-spelled: `opportunity.stage` and the trail's
-- two columns never had one, and a writer still on the old enum between migrate
-- and deploy must be refused, not leave a key no reader can parse.
--
-- Hand-written for 0047-0072's reason: `generate`'s baseline is stuck at 0026.
ALTER TABLE "sales"."opportunity" DROP CONSTRAINT "opportunity_stopped_at_stage_known";--> statement-breakpoint
ALTER TABLE "sales"."config_entry" DROP CONSTRAINT "config_stage_known";--> statement-breakpoint
-- Dropped before the data moves for 0061's reason: the stand trigger re-derives
-- a run inside the opportunity UPDATE below.
ALTER TABLE "sales"."workstream" DROP CONSTRAINT "workstream_stand_key_known";--> statement-breakpoint

-- The whole 0067 body again, because a function is replaced whole. Only the
-- `stages` array and the comment counting the board's columns change.
CREATE OR REPLACE FUNCTION "sales"."workstream_stand"(ws_code text)
RETURNS TABLE (kind text, key text, code text, lead_key text, due_at timestamptz)
LANGUAGE plpgsql STABLE AS $fn$
DECLARE
  -- `StageKey.options`, `LEAD_LANE_BACKBONE` and `LeadTier.options`, copied out
  -- by hand: the day a ladder grows, that has to be a migration a person reads.
  stages      text[] := ARRAY['new', 'assigned', 'engaged', 'quotation'];
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
    -- Off the backbone (`disqualified`, ADR 0068 retired the only other exit):
    -- the furthest rung its trail PROVES it reached, never the one it was
    -- heading for. Rung `new` needs no row - every lead has a creation date -
    -- so the walk floors at 0.
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

-- ACTIVITY HISTORY BEFORE THE TRAIL LOSES ITS WORDS. A move into `sample`/`poc`
-- with no matching touch on the deal (0061 mapped `demo-done` -> `poc` without
-- writing one) would otherwise leave an `engaged` deal with zero activities.
-- One touch per such move, at its `at`, credited to whoever moved it.
INSERT INTO "sales"."touch" ("subject_code", "subject_kind", "kind", "at", "actor_id", "by", "note")
SELECT e."opportunity_code", 'opportunity',
       CASE e."to_stage" WHEN 'sample' THEN 'sample-sent' ELSE 'poc-run' END,
       e."at", e."by_id", e."by", 'Ghi lại từ cột cũ'
  FROM "sales"."opportunity_stage_event" e
 WHERE e."to_stage" IN ('sample', 'poc')
   AND NOT EXISTS (SELECT 1 FROM "sales"."touch" t
                    WHERE t."subject_code" = e."opportunity_code"
                      AND t."kind" = CASE e."to_stage" WHEN 'sample' THEN 'sample-sent' ELSE 'poc-run' END);--> statement-breakpoint

-- THE TRAIL FIRST. A `sample -> poc` move (or back) becomes a move from
-- `engaged` to itself, which `opportunity_stage_event_moved` refuses - so those
-- rows go, as 0061 did with `quoted -> awaiting-signature`. Their
-- `days_in_from` is not lost: it is added to the next surviving row leaving
-- `engaged`, so "days spent in engaged" counts the sample leg AND the POC leg.
WITH "ev" AS (
  SELECT e."id", e."opportunity_code", e."at", e."days_in_from", e."from_stage",
         CASE WHEN e."from_stage" IN ('sample', 'poc') THEN 'engaged' ELSE e."from_stage" END
           IS NOT DISTINCT FROM
         CASE WHEN e."to_stage" IN ('sample', 'poc') THEN 'engaged' ELSE e."to_stage" END AS "collapses"
    FROM "sales"."opportunity_stage_event" e
),
"fold" AS (
  SELECT (SELECT n."id" FROM "ev" n
           WHERE n."opportunity_code" = c."opportunity_code" AND NOT n."collapses"
             AND (n."at", n."id") > (c."at", c."id")
           ORDER BY n."at", n."id" LIMIT 1) AS "target",
         c."days_in_from"
    FROM "ev" c WHERE c."collapses"
)
UPDATE "sales"."opportunity_stage_event" e
   SET "days_in_from" = e."days_in_from" + f."days"
  FROM (SELECT "target", sum("days_in_from")::int AS "days" FROM "fold"
         WHERE "target" IS NOT NULL GROUP BY "target") f
 WHERE e."id" = f."target" AND e."from_stage" IN ('sample', 'poc');--> statement-breakpoint
DELETE FROM "sales"."opportunity_stage_event"
 WHERE "from_stage" IN ('sample', 'poc') AND "to_stage" IN ('sample', 'poc');--> statement-breakpoint
UPDATE "sales"."opportunity_stage_event" SET
  "from_stage" = CASE WHEN "from_stage" IN ('sample', 'poc') THEN 'engaged' ELSE "from_stage" END,
  "to_stage" = CASE WHEN "to_stage" IN ('sample', 'poc') THEN 'engaged' ELSE "to_stage" END
 WHERE "from_stage" IN ('sample', 'poc') OR "to_stage" IN ('sample', 'poc');--> statement-breakpoint

-- One statement for both columns. `stage` is in the SET list, so the stand
-- trigger re-derives each touched run with the four-rung function above. The
-- clock restarts at the earliest surviving move into `engaged` - the same
-- span the folded `days_in_from` measures; no such row keeps the old clock.
UPDATE "sales"."opportunity" o SET
  "stage" = CASE WHEN "stage" IN ('sample', 'poc') THEN 'engaged' ELSE "stage" END,
  "stage_since" = CASE WHEN "stage" IN ('sample', 'poc')
                       THEN COALESCE((SELECT min(e."at") FROM "sales"."opportunity_stage_event" e
                                       WHERE e."opportunity_code" = o."code"
                                         AND e."to_stage" = 'engaged'), "stage_since")
                       ELSE "stage_since" END,
  "stopped_at_stage" = CASE WHEN "stopped_at_stage" IN ('sample', 'poc') THEN 'engaged'
                            ELSE "stopped_at_stage" END
 WHERE "stage" IN ('sample', 'poc') OR "stopped_at_stage" IN ('sample', 'poc');--> statement-breakpoint

-- A deal's mirror row carries its stage as `state` (`toRef`) - 0061's reason.
UPDATE "platform"."object" SET "state" = 'engaged'
 WHERE "kind" = 'OP' AND "state" IN ('sample', 'poc');--> statement-breakpoint

-- A run the function answers nothing for (no anchor lead) keeps what it has,
-- so the resync below cannot be trusted to clear an old key on its own.
UPDATE "sales"."workstream" SET "stand_key" = 'engaged'
 WHERE "stand_kind" = 'OP' AND "stand_key" IN ('sample', 'poc');--> statement-breakpoint

-- THE STAGE LADDER, still paired BY ORDINAL POSITION (`ladder.ts`,
-- `ladder_limit_days`): four ACTIVE rows in `ord` order, or every rung loses its
-- clock. Rung 3 (was `sample`) becomes `engaged` and takes the LONGER of the
-- sample and POC limits - it now covers both, and a shorter clock would flag
-- deals that were on time yesterday. Rung 4 (`poc`) is disabled, never deleted
-- (`config_entry`'s rule); the config door refuses toggling a ladder row, so it
-- cannot come back and shift the count. No rows = a fresh database the seed
-- fills; four = already done. Any other count has no position to trust.
DO $$
DECLARE
  rungs text[];
BEGIN
  SELECT array_agg("id" ORDER BY "ord") INTO rungs
    FROM "sales"."config_entry" WHERE "list" = 'STAGE' AND "active";
  IF rungs IS NULL OR cardinality(rungs) = 4 THEN RETURN; END IF;
  IF cardinality(rungs) <> 5 THEN
    RAISE EXCEPTION '0073: % active STAGE rows, expected 5 - no position to map', cardinality(rungs);
  END IF;
  UPDATE "sales"."config_entry" SET "active" = false WHERE "id" = rungs[4];
  UPDATE "sales"."config_entry" c SET
    "name" = v."name",
    "limit_days" = CASE WHEN v."pos" = 3
                        THEN (SELECT greatest(max(s."limit_days") FILTER (WHERE s."id" = rungs[3]),
                                              max(s."limit_days") FILTER (WHERE s."id" = rungs[4]))
                                FROM "sales"."config_entry" s)
                        ELSE c."limit_days" END
    FROM (VALUES (1, 'Khởi tạo'), (2, 'Đang phân công'), (3, 'Chăm sóc'), (5, 'Báo giá'))
         AS v("pos", "name")
   WHERE c."id" = rungs[v."pos"];
END $$;--> statement-breakpoint

-- A stop reason scoped to `sample` or `poc` now fits `engaged`. No dedupe is
-- needed: `config_name_live` already makes a live name unique across the
-- whole list, whatever its scope, and `id` is the key.
UPDATE "sales"."config_entry" SET "stage" = 'engaged'
 WHERE "list" = 'LOSS_REASON' AND "stage" IN ('sample', 'poc');--> statement-breakpoint

-- THE WHOLE BOOK, for 0061's reason: the ladder now counts four rungs, so
-- every run on a deal has a new due date even where its key did not move.
SELECT "sales"."workstream_stand_sync"(ARRAY(SELECT "code" FROM "sales"."workstream"));--> statement-breakpoint

-- `StageKey.options`, copied out by hand on every column that holds one.
ALTER TABLE "sales"."opportunity" ADD CONSTRAINT "opportunity_stage_known" CHECK (
  "stage" IS NULL OR "stage" IN ('new', 'assigned', 'engaged', 'quotation')
);--> statement-breakpoint
ALTER TABLE "sales"."opportunity" ADD CONSTRAINT "opportunity_stopped_at_stage_known" CHECK (
  "stopped_at_stage" IS NULL
  OR "stopped_at_stage" IN ('new', 'assigned', 'engaged', 'quotation')
);--> statement-breakpoint
ALTER TABLE "sales"."opportunity_stage_event" ADD CONSTRAINT "opportunity_stage_event_stage_known" CHECK (
  ("from_stage" IS NULL OR "from_stage" IN ('new', 'assigned', 'engaged', 'quotation'))
  AND ("to_stage" IS NULL OR "to_stage" IN ('new', 'assigned', 'engaged', 'quotation'))
);--> statement-breakpoint
ALTER TABLE "sales"."config_entry" ADD CONSTRAINT "config_stage_known" CHECK (
  "stage" IS NULL OR "stage" IN ('new', 'assigned', 'engaged', 'quotation')
);--> statement-breakpoint
ALTER TABLE "sales"."workstream" ADD CONSTRAINT "workstream_stand_key_known" CHECK (
  CASE "stand_kind"
    WHEN 'HĐ' THEN "stand_key" = 'signed'
    WHEN 'OP' THEN "stand_key" IN ('new', 'assigned', 'engaged', 'quotation')
    WHEN 'LD' THEN "stand_key" IN ('new', 'assigned', 'verifying', 'working', 'nurturing',
                                   'converted', 'disqualified')
    ELSE true
  END
);--> statement-breakpoint

-- Twenty-seven `TouchKind` values: `demo-held` and `site-visited` join
-- `sample-sent`/`poc-run` as care activities (ADR 0072 §3). Nothing leaves.
ALTER TABLE "sales"."touch" DROP CONSTRAINT "touch_kind_known";--> statement-breakpoint
ALTER TABLE "sales"."touch" ADD CONSTRAINT "touch_kind_known" CHECK ("kind" IN ('created', 'contacted', 'field-filled', 'handed-over', 'tier-raised',
                     'care-planned', 'exchange-logged', 'first-action', 'verified',
                     'nurtured', 'resumed', 'archived', 'first-meeting',
                     'entered-pipeline', 'stage-changed', 'signed', 'exited',
                     'reopened', 'sample-sent', 'poc-run', 'demo-held', 'site-visited',
                     'quotation-sent', 'care-left', 'next-step-done',
                     'mail-failed', 'mail-sync-failed'));
