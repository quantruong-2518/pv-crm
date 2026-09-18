-- 0052 - a lead gets one stored lifecycle state (ADR 0058), replacing `stage`
-- read as the lead's status. `stage_since` is renamed `state_since`, not
-- re-added, so every open lead keeps the clock it already had.
--
-- Backfill, first rule wins: `exit_reason` set -> `disqualified` (since =
-- `exited_at`); any opportunity -> `converted` (since = its first deal's
-- `created_at`); no owner -> `new`; any touch beyond `created` / `handed-over`,
-- by ANY actor -> `verifying` (work done stays with the lead across a
-- hand-over); else `assigned`. Nobody lands in `working`:
-- that needs a PIC's explicit verification, and an imported `tier` is not one.
-- Logged calls and Quick MAS left no touch before this migration, so leads
-- worked only that way backfill as `assigned`.
-- The `platform.object` mirror of every lead is re-stamped with the new state.
--
-- The email index is re-keyed from `exit_reason IS NULL` to the state; after
-- the backfill both predicates select the same rows, so it cannot fail here.
-- Hand-written for the reason `0047`-`0051` give: `drizzle-kit generate`'s
-- baseline snapshot is still stuck at `0026`.
ALTER TABLE "sales"."lead" ADD COLUMN "state" text;--> statement-breakpoint
ALTER TABLE "sales"."lead" RENAME COLUMN "stage_since" TO "state_since";--> statement-breakpoint
UPDATE "sales"."lead" AS l
SET "state" = b.state, "state_since" = b.since
FROM (
  SELECT x.code,
         CASE
           WHEN x.exit_reason IS NOT NULL THEN 'disqualified'
           WHEN o.first_deal_at IS NOT NULL THEN 'converted'
           WHEN x.owner_id IS NULL THEN 'new'
           WHEN EXISTS (
             SELECT 1 FROM "sales"."touch" t
             WHERE t.subject_code = x.code
               AND t.kind NOT IN ('created', 'handed-over')
           ) THEN 'verifying'
           ELSE 'assigned'
         END AS state,
         CASE
           WHEN x.exit_reason IS NOT NULL THEN x.exited_at
           WHEN o.first_deal_at IS NOT NULL THEN o.first_deal_at
           ELSE x.state_since
         END AS since
  FROM "sales"."lead" x
  LEFT JOIN LATERAL (
    SELECT min(op.created_at) AS first_deal_at
    FROM "sales"."opportunity" op
    WHERE op.lead_code = x.code
  ) o ON true
) b
WHERE b.code = l.code;--> statement-breakpoint
ALTER TABLE "sales"."lead" ALTER COLUMN "state" SET DEFAULT 'new';--> statement-breakpoint
ALTER TABLE "sales"."lead" ALTER COLUMN "state" SET NOT NULL;--> statement-breakpoint
UPDATE "platform"."object" AS o
SET "state" = l.state
FROM "sales"."lead" l
WHERE o.code = l.code;--> statement-breakpoint
ALTER TABLE "sales"."lead" DROP CONSTRAINT "lead_exit_no_stage";--> statement-breakpoint
DROP INDEX "sales"."lead_stage_idx";--> statement-breakpoint
ALTER TABLE "sales"."lead" DROP COLUMN "stage";--> statement-breakpoint
DROP INDEX "sales"."lead_email_live_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "lead_email_live_idx" ON "sales"."lead" USING btree (lower("email")) WHERE "state" NOT IN ('disqualified', 'archived');--> statement-breakpoint
CREATE INDEX "lead_state_idx" ON "sales"."lead" USING btree ("state");--> statement-breakpoint
ALTER TABLE "sales"."lead" ADD CONSTRAINT "lead_state_known" CHECK ("state" IN ('new', 'assigned', 'verifying', 'working', 'nurturing',
                      'converted', 'disqualified', 'archived'));--> statement-breakpoint
ALTER TABLE "sales"."lead" ADD CONSTRAINT "lead_disqualified_has_reason" CHECK (("state" = 'disqualified') = ("exit_reason" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "sales"."lead" ADD CONSTRAINT "lead_working_has_tier" CHECK ("state" <> 'working' OR "tier" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "sales"."lead" ADD CONSTRAINT "lead_open_owner_matches" CHECK ("state" NOT IN ('new', 'assigned', 'verifying', 'working', 'nurturing')
          OR (("state" = 'new') = ("owner_id" IS NULL)));--> statement-breakpoint
ALTER TABLE "sales"."touch" DROP CONSTRAINT "touch_kind_known";--> statement-breakpoint
ALTER TABLE "sales"."touch" ADD CONSTRAINT "touch_kind_known" CHECK ("kind" IN ('created', 'contacted', 'field-filled', 'handed-over', 'tier-raised', 'verified',
                     'nurtured', 'resumed', 'archived', 'first-meeting', 'entered-pipeline',
                     'stage-changed', 'signed', 'exited', 'reopened'));--> statement-breakpoint
ALTER TABLE "sales"."touch" DROP CONSTRAINT "touch_tier_raised_has_tier";--> statement-breakpoint
ALTER TABLE "sales"."touch" ADD CONSTRAINT "touch_tier_raised_has_tier" CHECK ("kind" NOT IN ('tier-raised', 'verified') OR "to_tier" IS NOT NULL);
