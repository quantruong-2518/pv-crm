-- 0033 - a hand-over names both of its ends, in columns rather than in prose.
--
-- `sales.touch` already carried `giao` rows: the door writes one every time
-- `PATCH /sales/leads/:code/owner` moves the column. What it could not carry
-- was WHO, as data - `by` is whoever pressed the button, and a head of sales
-- moving a lead between two Sales is neither the giver nor the taker. The only
-- record of the two ends was the Vietnamese sentence in `note`.
--
-- ONE ROW PER HAND-OVER, NOT TWO
-- Two rows (one "lost", one "received") would count a single event twice in
-- every touch count, would share one `at` - Postgres freezes `now()` per
-- transaction, so nothing orders them - and would break on the two commonest
-- moves anyway: claiming out of the common pool has no giver, releasing back
-- into it has no taker. So: one row, four columns, either end optionally
-- absent, and absent MEANS the common pool.
--
-- The names are copies taken at write time, like `by` and for the same reason:
-- joining `actor` on read would make every past step adopt the person's
-- current name. The ids ride along so a screen can say "this step is you".
--
-- `vao-so` may carry `to_*` as well - a lead imported with an owner is born
-- held, and its first holder is a fact worth writing down rather than inferring
-- from `lead.owner_id`, which only knows who holds it today. Exactly where
-- `to_tier` already sits for a lead that entered the book already graded.
--
-- Nothing is backfilled. Rows written before today keep their sentence and
-- carry no ends, which is the truth about them: the pair was never recorded,
-- and parsing names back out of Vietnamese prose would invent history.
--
-- WHICH IS WHY THE RULE COMES IN TWO CONSTRAINTS, NOT ONE
-- The shape rules below hold for every row that has ever existed - a legacy
-- `giao` row has all four columns NULL and passes all of them. "A `giao` row
-- names at least one end" does NOT: `setOwner` has been writing end-less
-- `giao` rows since 29/08, so validating that rule against the table would
-- abort this migration on every database where somebody has ever pressed
-- "Giao". `NOT VALID` is exactly the right instrument - Postgres enforces it
-- on every INSERT and UPDATE from now on and leaves the old rows alone, which
-- is the same sentence the paragraph above makes about backfilling.
ALTER TABLE "sales"."touch" ADD COLUMN "from_actor_id" text;--> statement-breakpoint
ALTER TABLE "sales"."touch" ADD COLUMN "from_name" text;--> statement-breakpoint
ALTER TABLE "sales"."touch" ADD COLUMN "to_actor_id" text;--> statement-breakpoint
ALTER TABLE "sales"."touch" ADD COLUMN "to_name" text;--> statement-breakpoint
ALTER TABLE "sales"."touch" ADD CONSTRAINT "touch_from_actor_id_actor_id_fk" FOREIGN KEY ("from_actor_id") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."touch" ADD CONSTRAINT "touch_to_actor_id_actor_id_fk" FOREIGN KEY ("to_actor_id") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."touch" ADD CONSTRAINT "touch_hand_over_sides" CHECK (("from_actor_id" IS NULL) = ("from_name" IS NULL)
          AND ("to_actor_id" IS NULL) = ("to_name" IS NULL)
          AND ("from_actor_id" IS NULL OR "kind" = 'giao')
          AND ("to_actor_id" IS NULL OR "kind" IN ('giao', 'vao-so')));--> statement-breakpoint
ALTER TABLE "sales"."touch" ADD CONSTRAINT "touch_giao_names_an_end" CHECK ("kind" <> 'giao' OR "from_actor_id" IS NOT NULL OR "to_actor_id" IS NOT NULL) NOT VALID;
