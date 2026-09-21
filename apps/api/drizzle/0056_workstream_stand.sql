-- 0056 - where a journey STANDS becomes two real columns, written by trigger.
--
-- The board on `/sales/workstreams` is one call to the book door per column,
-- filtered by `(stand_kind, stand_key)`, and each column header counts the
-- WHOLE book at that rung. Both are questions for WHERE and GROUP BY, and
-- `liveOf`/`standOf` answered them in JS AFTER paging - so neither could be
-- asked at all. Materializing puts the answer where SQL can reach it.
--
-- The rung definition now lives in `sales.workstream_stand()` and nowhere
-- else: one plpgsql function instead of a TS fold and a hand-written SQL copy
-- of it drifting apart. Precedence is `liveOf`'s, unchanged - an OPEN deal
-- outranks a signature (one deal signed does not finish a second one), a
-- signature outranks the lead.
--
-- FOUR columns, not two, and the other two are for the SCOPED reader: the code
-- of the live object, so the book can ask whether this reader may open it, and
-- the lead's own rung, which is where a card falls back when they may not.
--
-- ONE MORE for `WORKSTREAM_PRIORITY_LADDER`: `stand_due_at` is the deadline of
-- the rung the run stands on, so `overdueBy` becomes one subtraction the book
-- can put in an ORDER BY instead of a fold after paging. The ladder's other
-- two derived rungs are NOT here - reading them would have meant a trigger on
-- `platform.approval` and on `comms.message`, and `platform` may not be made
-- to know a branch, not even in the database where no lint rule looks.
--
-- Hand-written for 0047's reason: `generate`'s baseline is still stuck at 0026.
ALTER TABLE "sales"."workstream" ADD COLUMN "stand_kind" text;--> statement-breakpoint
ALTER TABLE "sales"."workstream" ADD COLUMN "stand_key" text;--> statement-breakpoint
ALTER TABLE "sales"."workstream" ADD COLUMN "stand_code" text;--> statement-breakpoint
ALTER TABLE "sales"."workstream" ADD COLUMN "stand_lead_key" text;--> statement-breakpoint
ALTER TABLE "sales"."workstream" ADD COLUMN "stand_due_at" timestamp with time zone;--> statement-breakpoint

-- THE LADDER PAIRING, IN SQL, AND IT IS A SECOND COPY OF `ladderConfigOf`.
-- `config_entry` carries no phase key, so the only join that holds is ORDINAL
-- POSITION - and with it the same fence: a list whose length does not match
-- the ladder's drops every limit rather than pair one rung's name with another
-- rung's clock. See `apps/api/src/branches/sales/ladder.ts`; the day
-- `config_entry` carries the slug, both copies collapse into one lookup.
CREATE FUNCTION "sales"."ladder_limit_days"(list_name text, rung int, rungs int)
RETURNS int
LANGUAGE sql STABLE AS $fn$
  SELECT c.limit_days
    FROM (SELECT limit_days,
                 row_number() OVER (ORDER BY ord) AS pos,
                 count(*)     OVER ()             AS n
            FROM sales.config_entry
           WHERE list = list_name AND active) c
   WHERE c.pos = rung AND c.n = rungs;
$fn$;--> statement-breakpoint

CREATE FUNCTION "sales"."workstream_stand"(ws_code text)
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
    -- where `resume` would put it back: no tier means it never passed
    -- verification. The one copy of `stateByTier`'s clause in SQL.
    lead_rung := CASE WHEN anchor.tier IS NULL THEN 'verifying' ELSE 'working' END;
  ELSIF anchor.state = ANY (backbone) THEN
    lead_rung := anchor.state;
  ELSE
    -- Off the backbone (`disqualified`, `archived`): the furthest rung its
    -- trail PROVES it reached, never the one it was heading for. Rung `new`
    -- needs no row - every lead has a creation date - so the walk floors at 0.
    SELECT max(CASE
                 WHEN t.kind = 'entered-pipeline' THEN 4
                 WHEN t.kind = 'verified' THEN 3
                 WHEN t.kind = 'first-action' THEN 2
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

-- Re-derive the five for a handful of runs. The LATERAL is an INNER join on
-- purpose: a run the function answers nothing for keeps what it has, so no
-- write door can ever be refused over a column this trigger left empty.
CREATE FUNCTION "sales"."workstream_stand_sync"(ws_codes text[])
RETURNS void
LANGUAGE sql AS $fn$
  UPDATE sales.workstream w
     SET stand_kind = v.kind, stand_key = v.key,
         stand_code = v.code, stand_lead_key = v.lead_key,
         stand_due_at = v.due_at
    FROM (SELECT w2.code AS ws, s.*
            FROM sales.workstream w2
            JOIN LATERAL sales.workstream_stand(w2.code) s ON true
           WHERE w2.code = ANY (ws_codes)) v
   WHERE w.code = v.ws
     AND (w.stand_kind, w.stand_key, w.stand_code, w.stand_lead_key, w.stand_due_at)
         IS DISTINCT FROM (v.kind, v.key, v.code, v.lead_key, v.due_at);
$fn$;--> statement-breakpoint

-- Backfill, before the NOT NULL. A run with no anchor lead falls back to the
-- pair the column DEFAULTs write - the rung its lead will land on - and to no
-- code at all, because there is no object to name yet.
UPDATE "sales"."workstream" w
   SET "stand_kind" = COALESCE(v.kind, 'LD'),
       "stand_key" = COALESCE(v.key, 'new'),
       "stand_code" = v.code,
       "stand_lead_key" = COALESCE(v.lead_key, 'new'),
       "stand_due_at" = v.due_at
  FROM (SELECT w2.code AS ws, s.*
          FROM "sales"."workstream" w2
          LEFT JOIN LATERAL "sales"."workstream_stand"(w2.code) s ON true) v
 WHERE w.code = v.ws;--> statement-breakpoint

-- The DEFAULT is what lets `insertOpened` stay a three-column INSERT: a run is
-- born before its lead exists, and `('LD','new')` is the only truthful pair at
-- that instant. The lead's own trigger corrects it in the same transaction.
ALTER TABLE "sales"."workstream" ALTER COLUMN "stand_kind" SET DEFAULT 'LD';--> statement-breakpoint
ALTER TABLE "sales"."workstream" ALTER COLUMN "stand_key" SET DEFAULT 'new';--> statement-breakpoint
ALTER TABLE "sales"."workstream" ALTER COLUMN "stand_lead_key" SET DEFAULT 'new';--> statement-breakpoint
ALTER TABLE "sales"."workstream" ALTER COLUMN "stand_kind" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sales"."workstream" ALTER COLUMN "stand_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sales"."workstream" ALTER COLUMN "stand_lead_key" SET NOT NULL;--> statement-breakpoint

-- Each fence polices ONE thing: an unknown kind falls to `ELSE true` here and
-- is refused by the constraint above, so a bad row names the column it broke.
-- Both lists copied out by hand rather than generated, for 0046/0052/0054's
-- reason. `LD`/`OP`/`HĐ` are `WorkstreamStandKind` VERBATIM, Vietnamese and
-- all: law 2 says a stored key is English, and the project owner took the debt
-- knowingly rather than have two spellings of one concept.
ALTER TABLE "sales"."workstream" ADD CONSTRAINT "workstream_stand_kind_known" CHECK ("stand_kind" IN ('LD', 'OP', 'HĐ'));--> statement-breakpoint
ALTER TABLE "sales"."workstream" ADD CONSTRAINT "workstream_stand_key_known" CHECK (
  CASE "stand_kind"
    WHEN 'HĐ' THEN "stand_key" = 'signed'
    WHEN 'OP' THEN "stand_key" IN ('new', 'discovery', 'demo-done', 'quoted', 'awaiting-signature')
    WHEN 'LD' THEN "stand_key" IN ('new', 'assigned', 'verifying', 'working', 'nurturing',
                                   'converted', 'disqualified', 'archived')
    ELSE true
  END
);--> statement-breakpoint

-- The same eight values, because this column is a `LeadState` whatever the run
-- stands on. The function only ever emits the five backbone rungs; the domain
-- is the contract's, so a future rung needs no migration to be READ, only to
-- be written.
ALTER TABLE "sales"."workstream" ADD CONSTRAINT "workstream_stand_lead_key_known" CHECK (
  "stand_lead_key" IN ('new', 'assigned', 'verifying', 'working', 'nurturing',
                       'converted', 'disqualified', 'archived')
);--> statement-breakpoint

-- NOT NULL AT COMMIT, which a column-level NOT NULL cannot express here: a run
-- is INSERTed one statement before the lead that gives it an object, and there
-- is no truthful code to invent in between. Deferred, this refuses exactly the
-- rows a NOT NULL would, at the one moment the answer exists. Postgres has no
-- deferrable CHECK, so it is a constraint TRIGGER - same SQLSTATE (23502).
-- The WHEN keeps a run that is already standing somewhere from queueing an
-- event at all, which is every write to this table but the intake one.
CREATE FUNCTION "sales"."workstream_stand_code_present"()
RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  -- RE-READ, never trust NEW: a constraint trigger's WHEN is evaluated at the
  -- statement, so the row queued here is the intake insert - the one the lead
  -- fills one statement later. NEW still holds the empty version of it.
  IF EXISTS (SELECT 1 FROM sales.workstream w
              WHERE w.code = NEW.code AND w.stand_code IS NULL) THEN
    RAISE EXCEPTION 'workstream % would commit with no stand_code', NEW.code
      USING ERRCODE = 'not_null_violation';
  END IF;
  RETURN NULL;
END
$fn$;--> statement-breakpoint

CREATE CONSTRAINT TRIGGER "workstream_stand_code_present"
AFTER INSERT OR UPDATE ON "sales"."workstream"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW WHEN (NEW."stand_code" IS NULL)
EXECUTE FUNCTION "sales"."workstream_stand_code_present"();--> statement-breakpoint

-- "Which OPEN runs stand at this rung, and how many are there in the whole
-- book" - one board column, paged and counted. Partial because the board never
-- shows a finished run; `status=closed` pays a scan, and that is the cheaper
-- side of the trade on every insert.
--
-- The `ownOnly` reader gets NO index of their own, on purpose: their column is
-- a CASE over "may this reader open `stand_code`", which is a different answer
-- per reader and so cannot be a b-tree. It filters after this one narrows.
CREATE INDEX "workstream_stand_idx" ON "sales"."workstream" ("stand_kind", "stand_key") WHERE "closed_at" IS NULL;--> statement-breakpoint

-- One bump for the three tables that carry `workstream_code`. Both ends on an
-- UPDATE: moving a deal to another run changes where BOTH runs stand.
CREATE FUNCTION "sales"."workstream_stand_bump"()
RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE
  codes text[] := '{}';
BEGIN
  IF TG_OP <> 'INSERT' THEN codes := codes || (to_jsonb(OLD) ->> 'workstream_code'); END IF;
  IF TG_OP <> 'DELETE' THEN codes := codes || (to_jsonb(NEW) ->> 'workstream_code'); END IF;
  PERFORM sales.workstream_stand_sync(codes);
  RETURN NULL;
END
$fn$;--> statement-breakpoint

-- The trail leg: a touch names a lead, and the lead names the run. A touch can
-- only MOVE the answer while the lead is off the backbone - every other state
-- reads the rung off `lead.state`, where the lead's own trigger already wrote
-- it. So the hot path is one primary-key lookup and, for all but a handful of
-- leads, no stand computation at all: 0.065 ms against 0.64 ms measured.
CREATE FUNCTION "sales"."workstream_stand_bump_touch"()
RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE
  ws text;
BEGIN
  SELECT l.workstream_code INTO ws
    FROM sales.lead l
   WHERE l.code = NEW.subject_code
     AND l.state IN ('disqualified', 'archived');
  IF ws IS NOT NULL THEN PERFORM sales.workstream_stand_sync(ARRAY[ws]); END IF;
  RETURN NULL;
END
$fn$;--> statement-breakpoint

CREATE TRIGGER "lead_workstream_stand"
AFTER INSERT OR DELETE OR UPDATE OF "state", "tier", "workstream_code" ON "sales"."lead"
FOR EACH ROW EXECUTE FUNCTION "sales"."workstream_stand_bump"();--> statement-breakpoint

CREATE TRIGGER "opportunity_workstream_stand"
AFTER INSERT OR DELETE OR UPDATE OF "stage", "workstream_code" ON "sales"."opportunity"
FOR EACH ROW EXECUTE FUNCTION "sales"."workstream_stand_bump"();--> statement-breakpoint

-- `signed_at` is in the list because `workstream_stand()` picks the NEWEST
-- signature by it: re-dating one contract can move `stand_code` to another.
CREATE TRIGGER "contract_workstream_stand"
AFTER INSERT OR DELETE OR UPDATE OF "workstream_code", "signed_at" ON "sales"."contract"
FOR EACH ROW EXECUTE FUNCTION "sales"."workstream_stand_bump"();--> statement-breakpoint

-- Only the five kinds a rung is read off (`RUNG_HIT`), and the WHEN keeps the
-- other eleven from ever entering the function - `sales.touch` is the most
-- written table of the branch.
CREATE TRIGGER "touch_workstream_stand"
AFTER INSERT ON "sales"."touch"
FOR EACH ROW
WHEN (NEW."subject_kind" = 'lead'
      AND NEW."kind" IN ('created', 'handed-over', 'first-action', 'verified', 'entered-pipeline'))
EXECUTE FUNCTION "sales"."workstream_stand_bump_touch"();--> statement-breakpoint

-- THE LADDER EDIT, AND IT RESYNCS THE WHOLE BOOK. It has to: the pairing is by
-- ORDINAL POSITION, so moving one rung's `ord`, disabling it, or adding a sixth
-- shifts every other rung's clock - and a fence that drops all limits when the
-- count stops matching flips for every run at once.
CREATE FUNCTION "sales"."workstream_stand_ladder_bump"()
RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  PERFORM sales.workstream_stand_sync(ARRAY(SELECT code FROM sales.workstream));
  RETURN NULL;
END
$fn$;--> statement-breakpoint

-- Renaming a rung moves no clock, and that is the edit this screen makes most
-- often - so the UPDATE arm names the three columns that can.
CREATE TRIGGER "config_entry_ladder_stand_update"
AFTER UPDATE ON "sales"."config_entry"
FOR EACH ROW
WHEN (NEW."list" IN ('STAGE', 'TIER')
      AND (OLD."limit_days", OLD."ord", OLD."active")
          IS DISTINCT FROM (NEW."limit_days", NEW."ord", NEW."active"))
EXECUTE FUNCTION "sales"."workstream_stand_ladder_bump"();--> statement-breakpoint

CREATE TRIGGER "config_entry_ladder_stand_insert"
AFTER INSERT ON "sales"."config_entry"
FOR EACH ROW WHEN (NEW."list" IN ('STAGE', 'TIER'))
EXECUTE FUNCTION "sales"."workstream_stand_ladder_bump"();--> statement-breakpoint

CREATE TRIGGER "config_entry_ladder_stand_delete"
AFTER DELETE ON "sales"."config_entry"
FOR EACH ROW WHEN (OLD."list" IN ('STAGE', 'TIER'))
EXECUTE FUNCTION "sales"."workstream_stand_ladder_bump"();
