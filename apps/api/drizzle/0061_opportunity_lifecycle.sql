-- 0061 - a deal's lifecycle becomes ONE axis (ADR 0064). `stage` says where it
-- stands, `state` says only whether it is still on the board: `open` or `care`.
-- `won` is still NOT stored - it is the existence of a `sales.contract` row.
--
-- The five columns are renamed and re-aimed: `discovery` -> `assigned`,
-- `demo-done` -> `poc`, `quoted` and `awaiting-signature` -> `quotation`, and
-- `new` SURVIVES its own spelling. Every remap is ONE `CASE` per table rather
-- than a chain of UPDATEs, because `quoted -> quotation` followed by any
-- statement landing on `quoted` would remap the same row twice.
--
-- `lost_reason`/`lost_note` are RENAMED, not re-created: the rows carry the
-- same sentences, under a model where leaving the board is care, not defeat.
-- `care_from_stage` joins them as the rung `reactivate` puts the deal back on;
-- for rows already closed it is the row's OWN `stage` when it still carries one
-- and the newest trail row otherwise. 0011 only ever ADDED `stage_since` - it
-- never nulled `stage` - so a legacy `close-lost` row can be sitting on a board
-- column right now. The three `*lost*` CHECKs are replaced rather
-- than renamed in place - the word is gone from the model, so a constraint
-- keeping it would name something the schema no longer has.
--
-- Hand-written for 0047-0058's reason: `generate`'s baseline is stuck at 0026.
ALTER TABLE "sales"."opportunity" DROP CONSTRAINT "opportunity_state_known";--> statement-breakpoint
ALTER TABLE "sales"."opportunity" DROP CONSTRAINT "opportunity_lost_closed";--> statement-breakpoint
ALTER TABLE "sales"."opportunity" DROP CONSTRAINT "opportunity_lost_state_closed";--> statement-breakpoint
ALTER TABLE "sales"."opportunity" RENAME COLUMN "lost_reason" TO "care_reason";--> statement-breakpoint
ALTER TABLE "sales"."opportunity" RENAME COLUMN "lost_note" TO "care_note";--> statement-breakpoint
ALTER TABLE "sales"."opportunity" ADD COLUMN "care_from_stage" text;--> statement-breakpoint

-- Twenty-three kinds now. Copied out by hand for 0046/0052/0054/0058's reason:
-- a CHECK is a string in a migration, so the day the contract's enum grows has
-- to be a migration a person reads. The three milestone kinds are what the
-- stage writer reads `sample`/`poc`/`quotation` off; `care-entered` carries the
-- reason and `care-left` the reopening. Every older kind stays valid FOREVER -
-- those rows are on disk.
ALTER TABLE "sales"."touch" DROP CONSTRAINT "touch_kind_known";--> statement-breakpoint
ALTER TABLE "sales"."touch" ADD CONSTRAINT "touch_kind_known" CHECK ("kind" IN ('created', 'contacted', 'field-filled', 'handed-over', 'tier-raised',
                     'care-planned', 'exchange-logged', 'first-action', 'verified',
                     'nurtured', 'resumed', 'archived', 'first-meeting',
                     'entered-pipeline', 'stage-changed', 'signed', 'exited',
                     'reopened', 'sample-sent', 'poc-run', 'quotation-sent',
                     'care-entered', 'care-left'));--> statement-breakpoint

-- DROPPED BEFORE THE DATA MOVES, re-added at the bottom with the new five: the
-- `opportunity_workstream_stand` trigger re-derives a run's stand inside the
-- UPDATE below, so the new keys land in `stand_key` while this fence still
-- named the old ones.
ALTER TABLE "sales"."workstream" DROP CONSTRAINT "workstream_stand_key_known";--> statement-breakpoint

-- The whole 0058 body again, because a function is replaced whole. Everything
-- but the `stages` array is 0058 verbatim.
CREATE OR REPLACE FUNCTION "sales"."workstream_stand"(ws_code text)
RETURNS TABLE (kind text, key text, code text, lead_key text, due_at timestamptz)
LANGUAGE plpgsql STABLE AS $fn$
DECLARE
  -- `StageKey.options`, `LEAD_LANE_BACKBONE` and `LeadTier.options`, copied out
  -- by hand: the day a ladder grows, that has to be a migration a person reads.
  stages      text[] := ARRAY['new', 'assigned', 'sample', 'poc', 'quotation'];
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
  -- won and cared-for deals never stand anywhere. The tie-break is load-bearing
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

-- THE TRAIL FIRST, because the deal reads its `care_from_stage` off it. Same
-- shape 0046 used for this table: one `CASE` per column, `ELSE` keeps what is
-- there so NULL ends (entering the board, leaving it) stay NULL.
ALTER TABLE "sales"."opportunity_stage_event" DROP CONSTRAINT "opportunity_stage_event_moved";--> statement-breakpoint
UPDATE "sales"."opportunity_stage_event" SET "from_stage" = CASE "from_stage"
	WHEN 'discovery' THEN 'assigned'
	WHEN 'demo-done' THEN 'poc'
	WHEN 'quoted' THEN 'quotation'
	WHEN 'awaiting-signature' THEN 'quotation'
	ELSE "from_stage"
END, "to_stage" = CASE "to_stage"
	WHEN 'discovery' THEN 'assigned'
	WHEN 'demo-done' THEN 'poc'
	WHEN 'quoted' THEN 'quotation'
	WHEN 'awaiting-signature' THEN 'quotation'
	ELSE "to_stage"
END;--> statement-breakpoint

-- `quoted` and `awaiting-signature` are ONE column now, so every row recording
-- a move between the two has become a move from a column to itself - which the
-- constraint below refuses, and rightly: an event that moved nothing is not an
-- event. They are deleted rather than kept under a loosened fence. What is lost
-- is `days_in_from` of those two legs; the human trail of the same moves is in
-- `sales.touch`, which this migration does not touch.
DELETE FROM "sales"."opportunity_stage_event"
 WHERE "from_stage" IS NOT DISTINCT FROM "to_stage";--> statement-breakpoint
ALTER TABLE "sales"."opportunity_stage_event" ADD CONSTRAINT "opportunity_stage_event_moved" CHECK ("from_stage" IS DISTINCT FROM "to_stage");--> statement-breakpoint

-- ONE statement for the whole table, and that is what keeps `quoted` from being
-- read twice. `state` collapses to the two stored values: everything that is
-- not `close-lost` is simply still on the board, and a signed deal reads `won`
-- off its contract row exactly as it did before.
--
-- A deal going into care LEAVES THE BOARD in the same statement: `stage` and
-- `stage_since` go NULL, because that pair is what every reader counts a deal
-- as open by. Left set, one row would be on the board for the scorecard, seated
-- by `workstream_stand`, and refused by the milestone door for not being open -
-- three answers to one question. `care_from_stage` is where it stood: its own
-- `stage` first (0011 never nulled that column), the newest trail row next, and
-- `new` as the floor. `care_reason` floors at `other`, the catalogue's own
-- catch-all, because the old CHECK never required a reason at all. The
-- `ELSE`-less CASEs write NULL on every open row, which is how a reason left on
-- a deal that was never lost gets cleared.
UPDATE "sales"."opportunity" o SET
  "stage" = CASE WHEN o."state" = 'close-lost' THEN NULL ELSE CASE o."stage"
	WHEN 'discovery' THEN 'assigned'
	WHEN 'demo-done' THEN 'poc'
	WHEN 'quoted' THEN 'quotation'
	WHEN 'awaiting-signature' THEN 'quotation'
	ELSE o."stage"
  END END,
  "stage_since" = CASE WHEN o."state" = 'close-lost' THEN NULL ELSE o."stage_since" END,
  "state" = CASE WHEN o."state" = 'close-lost' THEN 'care' ELSE 'open' END,
  "care_from_stage" = CASE WHEN o."state" = 'close-lost' THEN COALESCE(
      CASE o."stage"
	WHEN 'discovery' THEN 'assigned'
	WHEN 'demo-done' THEN 'poc'
	WHEN 'quoted' THEN 'quotation'
	WHEN 'awaiting-signature' THEN 'quotation'
	ELSE o."stage"
      END,
      (SELECT COALESCE(e."to_stage", e."from_stage")
         FROM "sales"."opportunity_stage_event" e
        WHERE e."opportunity_code" = o."code"
        ORDER BY e."at" DESC, e."id" DESC
        LIMIT 1), 'new') END,
  "care_reason" = CASE WHEN o."state" = 'close-lost' THEN COALESCE(o."care_reason", 'other') END,
  "care_note" = CASE WHEN o."state" = 'close-lost' THEN o."care_note" END,
  "closed_at" = CASE WHEN o."state" = 'close-lost' THEN COALESCE(o."closed_at", now())
                     ELSE o."closed_at" END;--> statement-breakpoint

-- The mirror row of a deal carries its stage as `state` (`toRef`), so it is
-- remapped by the same table - 0046 moved this column for the same reason. A
-- mirror left holding `quoted` is a value no label map knows.
UPDATE "platform"."object" SET "state" = CASE "state"
	WHEN 'discovery' THEN 'assigned'
	WHEN 'demo-done' THEN 'poc'
	WHEN 'quoted' THEN 'quotation'
	WHEN 'awaiting-signature' THEN 'quotation'
	ELSE "state"
END
WHERE "kind" = 'OP';--> statement-breakpoint

-- The STAGE ladder is paired to the keys BY ORDINAL POSITION (`ladder.ts`), so
-- the row COUNT must stay five or every rung loses its clock. Only `name` is
-- written: `limit_days` is a number somebody configured per row and this
-- migration has no better one - which does mean rung 3's old clock now belongs
-- to `sample` rather than to the column that earned it.
UPDATE "sales"."config_entry" c SET "name" = v.name
  FROM (VALUES (1, 'Khởi tạo opp'), (2, 'Nhận PIC'), (3, 'Sample'),
               (4, 'POC'), (5, 'Quotation')) AS v(ord, name)
 WHERE c."list" = 'STAGE' AND c."ord" = v.ord;--> statement-breakpoint

-- Two stored values, and `won` is not one of them - see the table's docblock.
ALTER TABLE "sales"."opportunity" ADD CONSTRAINT "opportunity_state_known" CHECK ("state" IN ('open', 'care'));--> statement-breakpoint

-- `StageKey.options`, copied out by hand for `touch_kind_known`'s reason. It
-- fences the column the reopen door reads: a key nothing can put back on the
-- board is a deal that can never leave the care list.
ALTER TABLE "sales"."opportunity" ADD CONSTRAINT "opportunity_care_from_stage_known" CHECK (
  "care_from_stage" IS NULL
  OR "care_from_stage" IN ('new', 'assigned', 'sample', 'poc', 'quotation')
);--> statement-breakpoint

-- What `opportunity_lost_closed` and `opportunity_lost_state_closed` said, in
-- the new model: a deal in care has left the board (`closed_at`), says WHY, and
-- remembers WHERE it stood - without the third, reopening has nowhere to go.
ALTER TABLE "sales"."opportunity" ADD CONSTRAINT "opportunity_care_closed" CHECK (
  "state" <> 'care'
  OR ("care_from_stage" IS NOT NULL AND "care_reason" IS NOT NULL AND "closed_at" IS NOT NULL)
);--> statement-breakpoint

-- OFF THE BOARD MEANS OFF THE BOARD. Neither CHECK above says this: a row with
-- `care_from_stage`, `care_reason` and `closed_at` all set passes both while
-- still holding a `stage`, and `opportunity_stage_clock` only pairs the clock to
-- the column. That combination is a deal two readers count differently - the
-- scorecard as open, `workstream_stand` as seated - so it is refused here.
-- `stage_since` needs no clause: the clock CHECK ties it to `stage`.
ALTER TABLE "sales"."opportunity" ADD CONSTRAINT "opportunity_care_off_board" CHECK (
  "state" <> 'care' OR "stage" IS NULL
);--> statement-breakpoint

-- And the other direction of the same law: a deal ON the board carries no care
-- columns at all. `closed_at` is NOT in this list - it also marks the day a
-- deal was won, and a won deal is stored `open`.
ALTER TABLE "sales"."opportunity" ADD CONSTRAINT "opportunity_open_has_no_care" CHECK (
  "state" <> 'open'
  OR ("care_from_stage" IS NULL AND "care_reason" IS NULL AND "care_note" IS NULL)
);--> statement-breakpoint

-- The OP branch, re-created with the five new rungs. Copied out by hand for
-- 0056's reason; the LD branch is 0056 verbatim.
ALTER TABLE "sales"."workstream" ADD CONSTRAINT "workstream_stand_key_known" CHECK (
  CASE "stand_kind"
    WHEN 'HĐ' THEN "stand_key" = 'signed'
    WHEN 'OP' THEN "stand_key" IN ('new', 'assigned', 'sample', 'poc', 'quotation')
    WHEN 'LD' THEN "stand_key" IN ('new', 'assigned', 'verifying', 'working', 'nurturing',
                                   'converted', 'disqualified', 'archived')
    ELSE true
  END
);--> statement-breakpoint

-- THE WHOLE BOOK, not a filtered list as 0058 could use: every run standing on
-- a deal has a new rung name, and every run whose deal just went into care no
-- longer stands on it. `sync` writes nothing where the five columns already
-- agree, so the runs that stand on a lead cost a read and no write.
SELECT "sales"."workstream_stand_sync"(ARRAY(SELECT "code" FROM "sales"."workstream"));
