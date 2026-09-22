-- 0062 - a care reason may be SCOPED to one stage (ADR 0064 §5). The list name
-- stays `LOSS_REASON` - its rows are on disk under it - but since 0061 it means
-- "why a deal leaves the board into the care list", and the reason a deal is
-- parked at `new` is not the reason it is parked after a quotation.
--
-- NULL is a real answer, not a missing one: the reason applies at EVERY stage.
-- So there is no backfill - every existing row keeps NULL, which is exactly
-- what it has always meant, and inventing a stage per row would put words in
-- somebody's mouth.
--
-- The fourth per-list attribute column, fenced the way `limit_days` is: one
-- CHECK naming the only list that may carry it, one naming the values it may
-- hold. `StageKey.options` is copied out by hand for `touch_kind_known`'s
-- reason - the day the ladder grows, that has to be a migration a person reads.
--
-- Hand-written for 0047-0061's reason: `generate`'s baseline is stuck at 0026.
ALTER TABLE "sales"."config_entry" ADD COLUMN "stage" text;--> statement-breakpoint

ALTER TABLE "sales"."config_entry" ADD CONSTRAINT "config_stage_only_loss_reason" CHECK (
  "stage" IS NULL OR "list" = 'LOSS_REASON'
);--> statement-breakpoint

ALTER TABLE "sales"."config_entry" ADD CONSTRAINT "config_stage_known" CHECK (
  "stage" IS NULL OR "stage" IN ('new', 'assigned', 'sample', 'poc', 'quotation')
);
