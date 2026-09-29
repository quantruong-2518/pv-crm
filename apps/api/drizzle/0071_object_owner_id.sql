-- 0071 - `platform.object` gets an id-shaped owner beside the name-shaped
-- one (debt #2 on `platform.actor.name`'s docblock). Nullable, `ON DELETE SET
-- NULL`: `owner` is a display name copied at write time, and this migration
-- can only trust a match back to `platform.actor` where it is unambiguous.
--
-- Hand-written for 0047-0070's reason: `generate`'s baseline is stuck at 0026.
ALTER TABLE "platform"."object" ADD COLUMN "owner_id" text
  REFERENCES "platform"."actor"("id") ON DELETE SET NULL;--> statement-breakpoint

-- LD: the branch table already forces a real, FK-clean `owner_id` (or NULL),
-- so this backfill cannot introduce a value `platform.actor` does not have.
UPDATE "platform"."object" o
   SET "owner_id" = l."owner_id"
  FROM "sales"."lead" l
 WHERE o."code" = l."code" AND o."kind" = 'LD' AND l."owner_id" IS NOT NULL;--> statement-breakpoint

-- HĐ: same guarantee, from `sales.contract.owner_id`.
UPDATE "platform"."object" o
   SET "owner_id" = c."owner_id"
  FROM "sales"."contract" c
 WHERE o."code" = c."code" AND o."kind" = 'HĐ' AND c."owner_id" IS NOT NULL;--> statement-breakpoint

-- Every other kind has no branch column to trust, only the copied `owner`
-- name - so match it back to `platform.actor` ONLY where exactly one actor
-- holds that name. Two staff sharing a display name is not hypothetical, and
-- guessing between them would assign someone else's object to them.
-- Ambiguous or unmatched stays NULL - fail closed, the same call the
-- column's own docblock makes.
UPDATE "platform"."object" o
   SET "owner_id" = a."id"
  FROM (
    SELECT "name", min("id") AS "id", count(*) AS "n"
      FROM "platform"."actor"
     GROUP BY "name"
  ) a
 WHERE o."kind" NOT IN ('LD', 'HĐ')
   AND o."owner" IS NOT NULL
   AND o."owner" = a."name"
   AND a."n" = 1;
