-- 0087 - who created the lead: `sales.lead.created_by`.
--
-- NULLABLE with no default, on purpose: leads written before this column have
-- no recorded creator and the book prints them blank. No backfill - guessing
-- from `owner_id` would invent a fact. SET NULL with the actor, like the other
-- actor references on this table. Additive only.
ALTER TABLE "sales"."lead" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "sales"."lead" ADD CONSTRAINT "lead_created_by_actor_id_fk" FOREIGN KEY ("created_by") REFERENCES "platform"."actor"("id") ON DELETE set null ON UPDATE no action;
