-- 0051 - at most ONE live reset ticket per account, enforced by the database.
-- `AuthRepository.invalidatePendingResetTickets` + INSERT is two statements
-- with no transaction and no lock, so two near-simultaneous `forgot-password`
-- requests for one account both see zero live tickets and both insert. The
-- partial unique index makes the second INSERT fail with `23505` instead;
-- catching that is the service's job, not this file's.
--
-- Partial on two predicates: a spent ticket (`used_at` set) must not block the
-- next request, and `invite` tickets share this table with a seven-day life -
-- they are deliberately outside the fence.
--
-- The UPDATE runs FIRST because the index cannot be created over data that
-- already violates it, and production may well carry duplicates written by the
-- race this index closes. It keeps the NEWEST live reset ticket per actor and
-- marks the rest used - `used_at` already means "spent OR superseded", the
-- same write the application does when it issues a replacement, so this is a
-- backfill of an intent the flow already had, not a new state.
--
-- Hand-written for the reason `0047`-`0050` give: `drizzle-kit generate`'s
-- baseline snapshot is still stuck at `0026`.
UPDATE "platform"."password_reset" AS p
SET "used_at" = now()
WHERE "purpose" = 'reset'
  AND "used_at" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "platform"."password_reset" AS newer
    WHERE newer."actor_id" = p."actor_id"
      AND newer."purpose" = 'reset'
      AND newer."used_at" IS NULL
      AND (newer."issued_at", newer."id") > (p."issued_at", p."id")
  );--> statement-breakpoint
CREATE UNIQUE INDEX "password_reset_one_live_reset_uq" ON "platform"."password_reset" USING btree ("actor_id") WHERE "purpose" = 'reset' AND "used_at" IS NULL;
