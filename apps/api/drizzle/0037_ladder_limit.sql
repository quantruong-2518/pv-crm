-- 0037 - the per-phase clock belongs to a LADDER, not to Sales.
--
-- `config_limit_only_stage` said `("list" = 'STAGE') = ("limit_days" IS NOT
-- NULL)`: only the Sales funnel may carry a clock, and every one of its columns
-- must. The rule is right and its subject was wrong. Luật 2 of
-- `docs/tam-nhin-pipeline-toan-he.md` §2 is about every pipeline: a phase with
-- no clock is a phase people park in, whether it belongs to Sales, Supply or
-- Factory.
--
-- So the constraint now names a SET, and the set has one member today because
-- one ladder exists. This is deliberately NOT a behaviour change - the same
-- rows pass and the same rows fail. What changes is what has to happen when
-- Supply brings a ladder: one value here and one in `LADDER_LISTS`
-- (`@pv/contracts`), instead of a hunt for the three places that spelled
-- `'STAGE'` - the CHECK, the service's field guard, and the screen.
ALTER TABLE "sales"."config_entry" DROP CONSTRAINT "config_limit_only_stage";--> statement-breakpoint
ALTER TABLE "sales"."config_entry" ADD CONSTRAINT "config_limit_only_ladder" CHECK (("list" IN ('STAGE')) = ("limit_days" IS NOT NULL));
