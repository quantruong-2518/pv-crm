-- 0039 - the role the RECEIVER held on the day, frozen into the row.
--
-- The flow vector draws a chain of people and wants a role under each name.
-- Joining `actor` at read time would print the role that person holds TODAY,
-- which is exactly what `by`, `from_name` and `to_name` are copies for: a step
-- from March must keep saying "BD" after the person moved to Sale in July.
--
-- Only the RECEIVING end gets one. The giver's role is not drawn - the vector
-- shows who holds it next, and a giver is already on the chain as the previous
-- step wearing their own `to_role` from the hand-over that gave it to them.
-- One column, not two, until a screen needs the second.
--
-- Nullable for ever: every row written before today has no answer and inventing
-- one is the thing the copies exist to prevent. `stepsOf` prints nothing rather
-- than borrowing.
--
-- The CHECK is safe to validate - it is an implication whose left side is NULL
-- on every existing row, so no row can fail it (trap 2 of
-- `docs/ban-giao-tang-duyet-va-vi-tri.md` §2).
ALTER TABLE "sales"."touch" ADD COLUMN "to_role" text;--> statement-breakpoint
ALTER TABLE "sales"."touch" ADD CONSTRAINT "touch_to_role_needs_an_end" CHECK ("to_role" IS NULL OR "to_actor_id" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "sales"."touch" ADD CONSTRAINT "touch_to_role_known" CHECK ("to_role" IS NULL OR "to_role" IN ('director', 'head-of-sales', 'marketing', 'bd', 'presales', 'sale', 'account-executive'));
