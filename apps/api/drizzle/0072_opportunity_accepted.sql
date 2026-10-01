-- 0072 - ADR 0071: `new` -> `assigned` ("Nhận PIC") becomes an explicit
-- accept by a head of sales or director, recorded on the deal. Two nullable
-- columns and a pair CHECK; no CHECK ties them to `stage`, because deals that
-- reached `assigned` before this rule have no accept to show.
--
-- Hand-written for 0047-0071's reason: `generate`'s baseline is stuck at 0026.
ALTER TABLE "sales"."opportunity" ADD COLUMN "accepted_by_id" text;--> statement-breakpoint
ALTER TABLE "sales"."opportunity" ADD COLUMN "accepted_at" timestamp with time zone;--> statement-breakpoint
-- Named the way drizzle names it, so a future `generate` sees no drift. The
-- accept door writes the session's own actor, which always has this row.
ALTER TABLE "sales"."opportunity" ADD CONSTRAINT "opportunity_accepted_by_id_actor_id_fk" FOREIGN KEY ("accepted_by_id") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- Backfill, before the CHECK so it never sees a half-written pair. A deal
-- past `new` (on the board, or stopped past it) or signed is credited to the
-- head of sales standing on it, else the director standing on it - lowest
-- actor id within a tier, so a rerun picks the same person - dated by its
-- latest move into `assigned`, else its own creation. Neither among the
-- owners: stays NULL, rather than credit someone who never stood on the deal.
UPDATE "sales"."opportunity" o
   SET "accepted_by_id" = h."actor_id",
       "accepted_at" = COALESCE(
         (SELECT max(e."at") FROM "sales"."opportunity_stage_event" e
           WHERE e."opportunity_code" = o."code" AND e."to_stage" = 'assigned'),
         o."created_at")
  FROM (
    SELECT DISTINCT ON (ow."opportunity_code") ow."opportunity_code", ow."actor_id"
      FROM "sales"."opportunity_owner" ow
      JOIN "platform"."actor" a ON a."id" = ow."actor_id"
     WHERE a."role_id" IN ('head-of-sales', 'director')
     ORDER BY ow."opportunity_code", a."role_id" = 'director', ow."actor_id"
  ) h
 WHERE h."opportunity_code" = o."code"
   AND o."accepted_by_id" IS NULL
   AND (COALESCE(o."stage", o."stopped_at_stage") IN ('assigned', 'sample', 'poc', 'quotation')
        OR EXISTS (SELECT 1 FROM "sales"."contract" k WHERE k."opportunity_code" = o."code"));--> statement-breakpoint

-- A name with no date cannot be ordered, a date with no name cannot be credited.
ALTER TABLE "sales"."opportunity" ADD CONSTRAINT "opportunity_accepted_pair" CHECK (
  ("accepted_by_id" IS NULL) = ("accepted_at" IS NULL)
);
