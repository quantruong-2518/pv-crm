-- 0067 - ADR 0068 retires the lead state `archived`. Nothing retires a lead on
-- a timer any more: a parked lead (`nurturing`, "Nhóm chờ chăm sóc") stays
-- parked until a real touch loops it back to `working`. The touch KIND
-- `archived` on `sales.touch` is untouched - those rows are on disk, same
-- reason `touch_kind_known` already keeps `first-action`/`verified` forever.
--
-- Data moves BEFORE the CHECKs tighten, so the ADD CONSTRAINT statements below
-- never see a value they are about to refuse. The UPDATE is naturally
-- idempotent - it matches zero rows once the first run has cleared them.
--
-- Hand-written for 0047-0066's reason: `generate`'s baseline is stuck at 0026.

-- REOPEN FIRST, while `state = 'archived'` still names the rows to fix. The old
-- sweep path (`LeadArchiveSweeper`, deleted under this same ADR) called
-- `workstream.syncClosed`, whose SQL used to read `archived` as LOST at
-- `state_since` — that branch is gone from `syncClosed` now, so a run closed
-- that way is stuck LOST forever unless something rewrites it here. Recomputed
-- with the SAME rule `syncClosed` uses today (`leadSigned` in
-- `open-deal.ts`: a contract exists and no sibling deal is still open) rather
-- than a bare `NULL`, so a run that also happens to be genuinely WON — a
-- contract signed while its lead sat archived — is left alone, not reopened
-- by mistake.
WITH "archived_runs" AS (
  SELECT DISTINCT "workstream_code" AS "code"
    FROM "sales"."lead"
   WHERE "state" = 'archived' AND "workstream_code" IS NOT NULL
),
"reopen" AS (
  SELECT r."code",
         (EXISTS (SELECT 1 FROM "sales"."contract" c WHERE c."lead_code" = l."code")
          AND NOT EXISTS (
                SELECT 1 FROM "sales"."opportunity" o
                 WHERE o."lead_code" = l."code"
                   AND o."state" <> 'care'
                   AND NOT EXISTS (
                         SELECT 1 FROM "sales"."contract" k WHERE k."opportunity_code" = o."code"
                       )
              )) AS "won",
         (SELECT max(k."signed_at") FROM "sales"."contract" k WHERE k."lead_code" = l."code") AS "signed_at"
    FROM "archived_runs" r
    JOIN "sales"."lead" l ON l."workstream_code" = r."code"
)
UPDATE "sales"."workstream" w
   SET "closed_at" = CASE WHEN re."won" THEN greatest(re."signed_at", w."opened_at") END,
       "close_reason" = CASE WHEN re."won" THEN 'WON' END
  FROM "reopen" re
 WHERE w."code" = re."code"
   AND (w."closed_at", w."close_reason") IS DISTINCT FROM
       (CASE WHEN re."won" THEN greatest(re."signed_at", w."opened_at") END,
        CASE WHEN re."won" THEN 'WON' END);--> statement-breakpoint

-- Every archived lead becomes a parked one - EXCEPT an ownerless one. Release
-- to the pool keeps a terminal lead's own state (`stateAfterOwnerChange`), so
-- `owner_id` can already be NULL here; `nurturing` requires an owner
-- (`lead_open_owner_matches`), so that row would refuse this very UPDATE.
-- `new` is the pool's own state for "no owner" - same equivalence the CHECK
-- enforces - so it is the only state left that both fits an empty `owner_id`
-- and keeps the row live. `state_since` is left as is either way: it already
-- answers "how long has THIS state held", and a row moved here by a migration
-- earns the same clock as one moved by a person pressing a button.
UPDATE "sales"."lead"
   SET "state" = CASE WHEN "owner_id" IS NULL THEN 'new' ELSE 'nurturing' END
 WHERE "state" = 'archived';--> statement-breakpoint

-- No manual stand resync needed: `lead_workstream_stand` (0056) already fires
-- `AFTER UPDATE OF "state"` on this table and re-derives the run's rung from
-- the row the UPDATE above just wrote.

-- The email fence's terminal-state exclusion drops to one state. The OLD
-- predicate EXCLUDED `archived` (and `disqualified`) from the uniqueness
-- check, so an archived lead's email was free to collide with a live one's.
-- Both former archived states (`new`, `nurturing`) are on the FENCED side now,
-- so a collision that was silent before this migration surfaces as a 23505 on
-- the lead UPDATE above - refused, not silently merged. That is a
-- real, if unlikely, way for this migration to fail; the fix is a preflight
-- duplicate-email count before `/ship` runs it, not logic added here for an
-- owner decision that has not been made. A `WHERE` clause cannot be altered in
-- place, so the index is dropped and re-created.
DROP INDEX "sales"."lead_email_live_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "lead_email_live_idx" ON "sales"."lead" USING btree (lower("email")) WHERE "state" <> 'disqualified';--> statement-breakpoint

-- Seven `LeadState` values now, not eight - ADR 0068.
ALTER TABLE "sales"."lead" DROP CONSTRAINT "lead_state_known";--> statement-breakpoint
ALTER TABLE "sales"."lead" ADD CONSTRAINT "lead_state_known" CHECK ("state" IN ('new', 'assigned', 'verifying', 'working', 'nurturing',
                'converted', 'disqualified'));--> statement-breakpoint

-- The OP and HĐ branches are untouched; only the LD list loses a rung. Two
-- constraints so a refused row still names the half it broke, same split 0056
-- made between the pair and its per-kind detail.
ALTER TABLE "sales"."workstream" DROP CONSTRAINT "workstream_stand_key_known";--> statement-breakpoint
ALTER TABLE "sales"."workstream" ADD CONSTRAINT "workstream_stand_key_known" CHECK (
  CASE "stand_kind"
    WHEN 'HĐ' THEN "stand_key" = 'signed'
    WHEN 'OP' THEN "stand_key" IN ('new', 'assigned', 'sample', 'poc', 'quotation')
    WHEN 'LD' THEN "stand_key" IN ('new', 'assigned', 'verifying', 'working', 'nurturing',
                                   'converted', 'disqualified')
    ELSE true
  END
);--> statement-breakpoint

ALTER TABLE "sales"."workstream" DROP CONSTRAINT "workstream_stand_lead_key_known";--> statement-breakpoint
ALTER TABLE "sales"."workstream" ADD CONSTRAINT "workstream_stand_lead_key_known" CHECK (
  "stand_lead_key" IN ('new', 'assigned', 'verifying', 'working', 'nurturing',
                       'converted', 'disqualified')
);--> statement-breakpoint

-- The whole 0061 body again, because a function is replaced whole: only the
-- comment naming a state that no longer exists changes, the logic does not -
-- `lead_rung` was never assigned the literal 'archived' to begin with, so the
-- ELSE branch below now only ever runs for `disqualified`.
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

-- Same fix on the touch-side trigger: this read only ever matched a lead
-- already off the domain (`disqualified` was one of two, now the only one), so
-- dropping the retired value changes nothing it decides, only what it names.
CREATE OR REPLACE FUNCTION "sales"."workstream_stand_bump_touch"()
RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE
  ws text;
BEGIN
  SELECT l.workstream_code INTO ws
    FROM sales.lead l
   WHERE l.code = NEW.subject_code
     AND l.state = 'disqualified';
  IF ws IS NOT NULL THEN PERFORM sales.workstream_stand_sync(ARRAY[ws]); END IF;
  RETURN NULL;
END
$fn$;--> statement-breakpoint

-- ADR 0068 addendum: two mail-failure touch kinds, the MAS worker's own retry
-- exhaustion and the inbound-sync failure it did not have a way to record
-- before. Twenty-six now.
ALTER TABLE "sales"."touch" DROP CONSTRAINT "touch_kind_known";--> statement-breakpoint
ALTER TABLE "sales"."touch" ADD CONSTRAINT "touch_kind_known" CHECK ("kind" IN ('created', 'contacted', 'field-filled', 'handed-over', 'tier-raised',
                     'care-planned', 'exchange-logged', 'first-action', 'verified',
                     'nurtured', 'resumed', 'archived', 'first-meeting',
                     'entered-pipeline', 'stage-changed', 'signed', 'exited',
                     'reopened', 'sample-sent', 'poc-run', 'quotation-sent',
                     'care-entered', 'care-left', 'next-step-done',
                     'mail-failed', 'mail-sync-failed'));--> statement-breakpoint

-- Same addendum: a suppression reason for an address whose mail died after
-- every retry, not a bounce or a complaint the PROVIDER reported and not a
-- person's own request either.
ALTER TABLE "platform"."email_suppression" DROP CONSTRAINT "email_suppression_reason_valid";--> statement-breakpoint
ALTER TABLE "platform"."email_suppression" ADD CONSTRAINT "email_suppression_reason_valid"
  CHECK ("reason" IN ('hard_bounce', 'complaint', 'manual', 'unsubscribe', 'send_failed'));
