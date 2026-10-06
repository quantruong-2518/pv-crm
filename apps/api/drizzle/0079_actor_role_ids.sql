-- 0079 - an actor holds MANY roles: `role_id text` becomes `role_ids text[]`.
-- Existing rows keep their single role as a one-element array; an empty table
-- passes through the same statements. Hand-written for the reason 0047-0078
-- give: drizzle-kit's baseline snapshot is stuck at 0026. The CHECK text is
-- copied by hand from platform.schema.ts; the role list mirrors `RoleId`.
ALTER TABLE "platform"."actor" ADD COLUMN "role_ids" text[];--> statement-breakpoint
UPDATE "platform"."actor" SET "role_ids" = ARRAY["role_id"];--> statement-breakpoint
ALTER TABLE "platform"."actor" ALTER COLUMN "role_ids" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "platform"."actor" ADD CONSTRAINT "actor_role_ids_not_empty" CHECK (cardinality("role_ids") >= 1);--> statement-breakpoint
ALTER TABLE "platform"."actor" ADD CONSTRAINT "actor_role_ids_known" CHECK ("role_ids" <@ ARRAY['director', 'head-of-sales', 'marketing', 'bd', 'presales', 'sale', 'account-executive']::text[]);--> statement-breakpoint
ALTER TABLE "platform"."actor" DROP COLUMN "role_id";
