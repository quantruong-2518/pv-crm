-- 0145 - CONTRACT half of removing the lead state `verifying` (ADR 0123), run
-- only once the build that never writes `verifying` is live. Re-moves any
-- `verifying` the old build wrote between 0144 and the deploy, then drops it
-- from every CHECK. Re-runnable: IF EXISTS on DDL, data guarded by its WHERE.

ALTER TABLE "sales"."lead" DROP CONSTRAINT IF EXISTS "lead_state_known";--> statement-breakpoint
ALTER TABLE "sales"."lead" DROP CONSTRAINT IF EXISTS "lead_open_owner_matches";--> statement-breakpoint
ALTER TABLE "sales"."workstream" DROP CONSTRAINT IF EXISTS "workstream_stand_key_known";--> statement-breakpoint
ALTER TABLE "sales"."workstream" DROP CONSTRAINT IF EXISTS "workstream_stand_lead_key_known";--> statement-breakpoint
ALTER TABLE "sales"."step_template" DROP CONSTRAINT IF EXISTS "step_template_state_known";--> statement-breakpoint
ALTER TABLE "sales"."state_rule" DROP CONSTRAINT IF EXISTS "state_rule_state_known";--> statement-breakpoint

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
