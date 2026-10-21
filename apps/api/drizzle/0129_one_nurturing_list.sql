-- 0129 - one nurturing list (ADR 0109), EXPAND half: `nurturing` becomes a
-- shared pool with no holder that carries a park reason and moment, and every
-- `disqualified` lead joins it. Two system park reasons join EXIT_REASON, and
-- the retired hold end, meeting cause and bell kinds are rewritten in place.
--
-- ORDER OUTSIDE: migrate BEFORE deploy. Only fences that refuse the new rows are
-- relaxed, so the old build keeps writing (an owned or reasonless `nurturing`,
-- `disqualified`, `lead-stopped`, `added_while_nurturing`). 0130 is the CONTRACT
-- half: it re-runs these moves for rows the old build wrote in the window, then
-- tightens every fence. EX-08/EX-09 must be free on Neon, or the guards stop here.
-- ORDER INSIDE: fences dropped first, re-added last; the stand functions are
-- replaced before the data moves so the stand trigger draws with the new rule.
-- Re-runnable: IF EXISTS on DDL, every data statement guarded.
-- Hand-written for 0047's reason: `generate`'s baseline is still stuck at 0026.

-- The two automatic park reasons (ADR 0109 §2), 0111's EX-07 pattern: `ord`
-- computed, skipped when the id or a live name is taken, then a guard that
-- fails when the id names another reason - the api writes these ids blind.
INSERT INTO "sales"."config_entry" ("id", "list", "name", "ord")
SELECT 'EX-08', 'EXIT_REASON', 'Cơ hội bị dừng', coalesce(max("ord"), 0) + 1
  FROM "sales"."config_entry"
 WHERE "list" = 'EXIT_REASON'
HAVING NOT EXISTS (SELECT 1 FROM "sales"."config_entry"
                    WHERE "id" = 'EX-08'
                       OR ("list" = 'EXIT_REASON' AND "active"
                           AND lower("name") = lower('Cơ hội bị dừng')));--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "sales"."config_entry"
                  WHERE "id" = 'EX-08' AND "list" = 'EXIT_REASON'
                    AND "name" = 'Cơ hội bị dừng') THEN
    RAISE EXCEPTION '0129: EX-08 is not "Cơ hội bị dừng" - read EXIT_REASON before migrating';
  END IF;
END $$;--> statement-breakpoint
INSERT INTO "sales"."config_entry" ("id", "list", "name", "ord")
SELECT 'EX-09', 'EXIT_REASON', 'Hợp đồng bị chấm dứt', coalesce(max("ord"), 0) + 1
  FROM "sales"."config_entry"
 WHERE "list" = 'EXIT_REASON'
HAVING NOT EXISTS (SELECT 1 FROM "sales"."config_entry"
                    WHERE "id" = 'EX-09'
                       OR ("list" = 'EXIT_REASON' AND "active"
                           AND lower("name") = lower('Hợp đồng bị chấm dứt')));--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "sales"."config_entry"
                  WHERE "id" = 'EX-09' AND "list" = 'EXIT_REASON'
                    AND "name" = 'Hợp đồng bị chấm dứt') THEN
    RAISE EXCEPTION '0129: EX-09 is not "Hợp đồng bị chấm dứt" - read EXIT_REASON before migrating';
  END IF;
END $$;--> statement-breakpoint

-- The three fences that refuse the moved rows. `lead_disqualified_has_reason`
-- has no replacement until 0130: in the window the old build parks a lead in
-- `nurturing` with no reason, and the new build parks it with one.
ALTER TABLE "sales"."lead" DROP CONSTRAINT IF EXISTS "lead_disqualified_has_reason";--> statement-breakpoint
ALTER TABLE "sales"."lead" DROP CONSTRAINT IF EXISTS "lead_open_owner_matches";--> statement-breakpoint
ALTER TABLE "sales"."meeting" DROP CONSTRAINT IF EXISTS "meeting_cancel_cause_known";--> statement-breakpoint

-- The whole 0073 body again, because a function is replaced whole. The
-- `nurturing` branch is gone: it drew the rung `resume` would restore, but a
-- pool lead may never have been assigned, so it now takes the trail walk
-- `disqualified` used - the furthest rung the trail PROVES.
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

  IF anchor.state = ANY (backbone) THEN
    lead_rung := anchor.state;
  ELSE
    -- Off the backbone (`nurturing`, the pool since ADR 0109; `disqualified`
    -- until 0130): the furthest rung its trail PROVES it reached. Rung `new`
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

-- The touch-side trigger follows: the two states whose rung is read off the
-- trail are the only ones a new touch can move. 0130 drops `disqualified`.
CREATE OR REPLACE FUNCTION "sales"."workstream_stand_bump_touch"()
RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE
  ws text;
BEGIN
  SELECT l.workstream_code INTO ws
    FROM sales.lead l
   WHERE l.code = NEW.subject_code
     AND l.state IN ('nurturing', 'disqualified');
  IF ws IS NOT NULL THEN PERFORM sales.workstream_stand_sync(ARRAY[ws]); END IF;
  RETURN NULL;
END
$fn$;--> statement-breakpoint

-- Every parked lead joins the pool. A `disqualified` lead keeps its reason and
-- moment. A `nurturing` lead with no reason, or still with a holder (the old
-- build's park), takes them from its latest `nurtured` touch: no reason there
-- is a deal-stop park (EX-08); no touch at all reads 'other' at `state_since`.
UPDATE "sales"."lead" l
   SET "state" = 'nurturing',
       "owner_id" = NULL,
       "exit_reason" = CASE WHEN l."exit_reason" IS NULL OR (l."state" = 'nurturing' AND l."owner_id" IS NOT NULL)
                            THEN COALESCE((SELECT COALESCE(t."reason_id", 'EX-08')
                                             FROM "sales"."touch" t
                                            WHERE t."subject_code" = l."code" AND t."subject_kind" = 'lead'
                                              AND t."kind" = 'nurtured'
                                            ORDER BY t."at" DESC, t."id" DESC LIMIT 1),
                                          'other')
                            ELSE l."exit_reason" END,
       "exited_at" = CASE WHEN l."exit_reason" IS NULL OR (l."state" = 'nurturing' AND l."owner_id" IS NOT NULL)
                          THEN COALESCE((SELECT t."at"
                                           FROM "sales"."touch" t
                                          WHERE t."subject_code" = l."code" AND t."subject_kind" = 'lead'
                                            AND t."kind" = 'nurtured'
                                          ORDER BY t."at" DESC, t."id" DESC LIMIT 1),
                                        l."state_since")
                          ELSE l."exited_at" END
 WHERE l."state" IN ('nurturing', 'disqualified')
   AND (l."state" = 'disqualified' OR l."owner_id" IS NOT NULL OR l."exit_reason" IS NULL);--> statement-breakpoint

-- The mirror row, which `toRef` would write: E2's scope axis reads
-- `owner_id`, so a stale holder there would keep reach over a pool lead.
UPDATE "platform"."object" o
   SET "state" = 'nurturing', "owner" = NULL, "owner_id" = NULL
  FROM "sales"."lead" l
 WHERE o."code" = l."code" AND l."state" = 'nurturing'
   AND (o."state", o."owner", o."owner_id") IS DISTINCT FROM ('nurturing', NULL, NULL);--> statement-breakpoint

-- A pool lead has nobody to do a next step or to come back to a hold, the
-- same two effects every park door now writes.
DELETE FROM "sales"."next_step" s
 USING "sales"."lead" l
 WHERE s."subject_code" = l."code" AND l."state" = 'nurturing';--> statement-breakpoint
UPDATE "sales"."hold" h
   SET "ended_at" = now(), "end_kind" = 'to-waiting'
  FROM "sales"."lead" l
 WHERE h."subject_type" = 'lead' AND h."subject_code" = l."code"
   AND l."state" = 'nurturing' AND h."ended_at" IS NULL;--> statement-breakpoint

-- Re-draw every pool lead's run. `state` in the SET list above already fired the
-- stand trigger per row; this also covers a pool lead that UPDATE's filter
-- skipped, since the rule for `nurturing` changed under rows already drawn.
SELECT "sales"."workstream_stand_sync"(ARRAY(
  SELECT DISTINCT l."workstream_code" FROM "sales"."lead" l
   WHERE l."state" = 'nurturing' AND l."workstream_code" IS NOT NULL));--> statement-breakpoint

-- Their runs closed by `workstream-sync.ts` SYNC_CLOSED's NEW rule, copied
-- out with `open-deal.ts` inlined: `nurturing` takes `disqualified`'s place,
-- so a pool lead with no deal closes LOST at `exited_at`. Change one, change both.
UPDATE "sales"."workstream" w
   SET "closed_at" = v."closed_at", "close_reason" = v."close_reason"
  FROM (
    SELECT w2."code",
           CASE WHEN x."won" THEN greatest(x."signed_at", w2."opened_at")
                WHEN x."lost_at" IS NOT NULL THEN greatest(x."lost_at", w2."opened_at")
           END AS "closed_at",
           CASE WHEN x."won" THEN 'WON'
                WHEN x."lost_at" IS NOT NULL THEN 'LOST'
           END AS "close_reason"
      FROM "sales"."workstream" w2
      JOIN LATERAL (
        SELECT (s."live_contract" AND NOT s."open_deal") AS "won",
               (SELECT max(k."signed_at") FROM "sales"."contract" k
                 WHERE k."lead_code" = l."code"
                   AND NOT EXISTS (SELECT 1 FROM "sales"."contract_termination" t
                                    WHERE t."contract_code" = k."code")) AS "signed_at",
               CASE WHEN NOT s."live_contract" AND s."any_deal" AND NOT s."open_deal"
                         AND (l."state" IN ('nurturing', 'new')
                              OR EXISTS (SELECT 1 FROM "sales"."contract" k WHERE k."lead_code" = l."code"))
                      THEN greatest(
                             (SELECT max(o."closed_at") FROM "sales"."opportunity" o WHERE o."lead_code" = l."code"),
                             (SELECT max(t."terminated_at") FROM "sales"."contract_termination" t
                                JOIN "sales"."contract" k ON k."code" = t."contract_code"
                               WHERE k."lead_code" = l."code"),
                             CASE l."state" WHEN 'nurturing' THEN l."exited_at" END)
                    WHEN l."state" = 'nurturing' AND NOT s."any_deal"
                      THEN l."exited_at"
               END AS "lost_at"
          FROM "sales"."lead" l
          CROSS JOIN LATERAL (
            SELECT EXISTS (SELECT 1 FROM "sales"."contract" c
                            WHERE c."lead_code" = l."code"
                              AND NOT EXISTS (SELECT 1 FROM "sales"."contract_termination" t
                                               WHERE t."contract_code" = c."code")) AS "live_contract",
                   EXISTS (SELECT 1 FROM "sales"."opportunity" o
                            WHERE o."lead_code" = l."code" AND o."state" = 'open'
                              AND NOT EXISTS (SELECT 1 FROM "sales"."contract" k
                                               WHERE k."opportunity_code" = o."code")) AS "open_deal",
                   EXISTS (SELECT 1 FROM "sales"."opportunity" o WHERE o."lead_code" = l."code") AS "any_deal"
          ) s
         WHERE l."workstream_code" = w2."code"
      ) x ON true
     WHERE w2."code" IN (SELECT l."workstream_code" FROM "sales"."lead" l
                          WHERE l."state" = 'nurturing' AND l."workstream_code" IS NOT NULL)
  ) v
 WHERE w."code" = v."code"
   AND (w."closed_at", w."close_reason") IS DISTINCT FROM (v."closed_at", v."close_reason");--> statement-breakpoint

-- Stored values of retired enum members, renamed to the member that now
-- means the same thing. Policy rows are deleted, not renamed: `kind` is the
-- key, and a mute set for `lead-nurtured` itself must win over an old one.
UPDATE "sales"."hold" SET "end_kind" = 'to-waiting' WHERE "end_kind" = 'disqualified';--> statement-breakpoint
UPDATE "sales"."meeting" SET "cancel_cause" = 'lead-nurtured' WHERE "cancel_cause" = 'lead-disqualified';--> statement-breakpoint
UPDATE "platform"."notification"
   SET "kind" = CASE "kind" WHEN 'lead-stopped' THEN 'lead-nurtured' ELSE 'lead-resumed' END
 WHERE "kind" IN ('lead-stopped', 'lead-reopened');--> statement-breakpoint
DELETE FROM "platform"."notification_kind_policy" WHERE "kind" IN ('lead-stopped', 'lead-reopened');--> statement-breakpoint

-- Relaxed for the window: `new` has no holder and the working rungs have one,
-- as before; `nurturing` may go either way until 0130 makes it the pool's.
ALTER TABLE "sales"."lead" ADD CONSTRAINT "lead_open_owner_matches" CHECK ("state" NOT IN ('new', 'assigned', 'verifying', 'working')
          OR (("state" = 'new') = ("owner_id" IS NULL)));--> statement-breakpoint
-- `lead-nurtured` joins; `lead-disqualified` stays until 0130.
ALTER TABLE "sales"."meeting" ADD CONSTRAINT "meeting_cancel_cause_known" CHECK ("cancel_cause" IS NULL OR "cancel_cause" IN ('opportunity-lost', 'lead-disqualified', 'lead-nurtured', 'lead-disabled'));
