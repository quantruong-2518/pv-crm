-- 0082 - a director can switch a lead OFF.
--
-- `disabled_at` / `disabled_by` on `sales.lead`, both nullable and paired by a
-- CHECK: off always says by whom. Orthogonal to `state`, so switching back on
-- restores the lead where it stood. Deals and contracts get NO column — they
-- are off exactly when their lead is. The partial index serves the one query
-- that looks for them ("Đã vô hiệu"); every other reader filters IS NULL on a
-- table where that is nearly every row, which needs no index. Additive only.
--
-- `platform.object.disabled_at` is the same decision as the graph sees it:
-- the branch stamps the mirror rows of the lead and of everything hanging
-- off it, and the graph and comms layers treat a stamped row as absent.
--
-- Hand-written for 0047's reason: `generate`'s baseline is still stuck at 0026.
ALTER TABLE "sales"."lead" ADD COLUMN "disabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sales"."lead" ADD COLUMN "disabled_by" text;--> statement-breakpoint
ALTER TABLE "sales"."lead" ADD CONSTRAINT "lead_disabled_by_actor_id_fk" FOREIGN KEY ("disabled_by") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."lead" ADD CONSTRAINT "lead_disabled_pair" CHECK (("disabled_at" IS NULL) = ("disabled_by" IS NULL));--> statement-breakpoint
CREATE INDEX "lead_disabled_idx" ON "sales"."lead" USING btree ("disabled_at") WHERE "disabled_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "platform"."object" ADD COLUMN "disabled_at" timestamp with time zone;
