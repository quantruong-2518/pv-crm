-- 0154 - Category (nhóm ngành) and industry (ngành) become config lists. A new
-- list INDUSTRY hangs on a CATEGORY through `config_entry.parent_id` (NULL =
-- uncategorised); `lead.category_id` / `account.category_id` point at CATEGORY
-- rows; `sales.lead_industry` links a lead to its industries. The four CATEGORY
-- rows are ensured (production may lack the seed), slugs become ids, and every
-- lead tag becomes an uncategorised INDUSTRY row, one per lower(btrim(tag)),
-- spelled as first seen (lead created_at, code, position). Ids are minted as
-- `ConfigRepository.create` does: prefix-<max number of the list + 1>, ord max + 1.
--
-- Additive: `lead.category`, `account.category`, `lead.industries` and their
-- CHECKs stay for the old api, which never writes the new columns; the
-- `*_legacy_*_sync` triggers at the end copy its writes across until deploy, and
-- go with the old columns in the follow-up migration. ORDER: migrate BEFORE deploy. Re-runnable: IF NOT EXISTS, DROP ... IF EXISTS before ADD,
-- NOT EXISTS guards (no ON CONFLICT on config_entry: 0111's 55000). Hand-written
-- for 0047's reason: `generate`'s baseline is stuck at 0026.
ALTER TABLE "sales"."config_entry" ADD COLUMN IF NOT EXISTS "parent_id" text;--> statement-breakpoint
ALTER TABLE "sales"."config_entry" ADD COLUMN IF NOT EXISTS "parent_list" text GENERATED ALWAYS AS (CASE WHEN "parent_id" IS NULL THEN NULL ELSE 'CATEGORY' END) STORED;--> statement-breakpoint
ALTER TABLE "sales"."config_entry" DROP CONSTRAINT IF EXISTS "config_parent_fk";--> statement-breakpoint
ALTER TABLE "sales"."config_entry" ADD CONSTRAINT "config_parent_fk" FOREIGN KEY ("parent_id","parent_list") REFERENCES "sales"."config_entry"("id","list") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."config_entry" DROP CONSTRAINT IF EXISTS "config_parent_only_industry";--> statement-breakpoint
ALTER TABLE "sales"."config_entry" ADD CONSTRAINT "config_parent_only_industry" CHECK ("parent_id" IS NULL OR "list" = 'INDUSTRY');--> statement-breakpoint
-- Same key for every existing row (parent_id is NULL on all of them); INDUSTRY
-- names become unique per CATEGORY.
DROP INDEX IF EXISTS "sales"."config_name_live";--> statement-breakpoint
CREATE UNIQUE INDEX "config_name_live" ON "sales"."config_entry" USING btree ("list",coalesce("criterion_id", "parent_id", ''),lower("name")) WHERE "active";--> statement-breakpoint

ALTER TABLE "sales"."lead" ADD COLUMN IF NOT EXISTS "category_id" text;--> statement-breakpoint
ALTER TABLE "sales"."lead" ADD COLUMN IF NOT EXISTS "category_list" text GENERATED ALWAYS AS (CASE WHEN "category_id" IS NULL THEN NULL ELSE 'CATEGORY' END) STORED;--> statement-breakpoint
ALTER TABLE "sales"."lead" DROP CONSTRAINT IF EXISTS "lead_category_fk";--> statement-breakpoint
ALTER TABLE "sales"."lead" ADD CONSTRAINT "lead_category_fk" FOREIGN KEY ("category_id","category_list") REFERENCES "sales"."config_entry"("id","list") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- "Leads of category X": the lead book filter and the config usage count.
CREATE INDEX IF NOT EXISTS "lead_category_id_idx" ON "sales"."lead" USING btree ("category_id");--> statement-breakpoint
ALTER TABLE "sales"."account" ADD COLUMN IF NOT EXISTS "category_id" text;--> statement-breakpoint
ALTER TABLE "sales"."account" ADD COLUMN IF NOT EXISTS "category_list" text GENERATED ALWAYS AS (CASE WHEN "category_id" IS NULL THEN NULL ELSE 'CATEGORY' END) STORED;--> statement-breakpoint
ALTER TABLE "sales"."account" DROP CONSTRAINT IF EXISTS "account_category_fk";--> statement-breakpoint
ALTER TABLE "sales"."account" ADD CONSTRAINT "account_category_fk" FOREIGN KEY ("category_id","category_list") REFERENCES "sales"."config_entry"("id","list") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- "Companies of category X": the account book filter and its facet.
CREATE INDEX IF NOT EXISTS "account_category_id_idx" ON "sales"."account" USING btree ("category_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "sales"."lead_industry" (
	"lead_code" text NOT NULL,
	"industry_id" text NOT NULL,
	"industry_list" text DEFAULT 'INDUSTRY' NOT NULL,
	CONSTRAINT "lead_industry_pk" PRIMARY KEY("lead_code","industry_id"),
	CONSTRAINT "lead_industry_list" CHECK ("industry_list" = 'INDUSTRY')
);--> statement-breakpoint
ALTER TABLE "sales"."lead_industry" DROP CONSTRAINT IF EXISTS "lead_industry_lead_code_lead_code_fk";--> statement-breakpoint
ALTER TABLE "sales"."lead_industry" ADD CONSTRAINT "lead_industry_lead_code_lead_code_fk" FOREIGN KEY ("lead_code") REFERENCES "sales"."lead"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."lead_industry" DROP CONSTRAINT IF EXISTS "lead_industry_config_fk";--> statement-breakpoint
ALTER TABLE "sales"."lead_industry" ADD CONSTRAINT "lead_industry_config_fk" FOREIGN KEY ("industry_id","industry_list") REFERENCES "sales"."config_entry"("id","list") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- "Leads of industry X": the book filter, the report rows, the merge's relink.
CREATE INDEX IF NOT EXISTS "lead_industry_industry_idx" ON "sales"."lead_industry" USING btree ("industry_id");--> statement-breakpoint
-- Joins the `pv_change` map (0126) as 'lead', like `lead_label`.
DROP TRIGGER IF EXISTS "pv_change_write" ON "sales"."lead_industry";--> statement-breakpoint
CREATE TRIGGER "pv_change_write" AFTER INSERT OR DELETE ON "sales"."lead_industry" FOR EACH ROW EXECUTE FUNCTION "platform"."notify_entity_change"('lead');--> statement-breakpoint
DROP TRIGGER IF EXISTS "pv_change_update" ON "sales"."lead_industry";--> statement-breakpoint
CREATE TRIGGER "pv_change_update" AFTER UPDATE ON "sales"."lead_industry" FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION "platform"."notify_entity_change"('lead');--> statement-breakpoint

-- One row at a time: each id and ord reads the max the previous insert left.
-- Any row of that name counts, switched off too, so a re-run never re-mints a
-- category an admin archived; owner unknown.
DO $$
DECLARE
	v text;
	seq int;
	pos int;
BEGIN
	FOREACH v IN ARRAY ARRAY['Chip', 'Cơ khí', 'Ô tô', 'Dược'] LOOP
		CONTINUE WHEN EXISTS (SELECT 1 FROM "sales"."config_entry"
		                       WHERE "list" = 'CATEGORY' AND lower("name") = lower(v));
		SELECT coalesce(max(CAST(split_part("id", '-', 2) AS int)), 0) + 1, coalesce(max("ord"), 0) + 1
		  INTO seq, pos FROM "sales"."config_entry" WHERE "list" = 'CATEGORY';
		INSERT INTO "sales"."config_entry" ("id", "list", "name", "ord")
		VALUES ('CT-' || lpad(seq::text, greatest(2, length(seq::text)), '0'), 'CATEGORY', v, pos);
	END LOOP;
END;
$$;--> statement-breakpoint

UPDATE "sales"."lead" l SET "category_id" = c."id"
  FROM "sales"."config_entry" c
 WHERE l."category_id" IS NULL AND c."list" = 'CATEGORY' AND c."active"
   AND lower(c."name") = lower(CASE l."category" WHEN 'chip' THEN 'Chip' WHEN 'mechanical' THEN 'Cơ khí'
                                                 WHEN 'automotive' THEN 'Ô tô' WHEN 'pharma' THEN 'Dược' END);--> statement-breakpoint
UPDATE "sales"."account" a SET "category_id" = c."id"
  FROM "sales"."config_entry" c
 WHERE a."category_id" IS NULL AND c."list" = 'CATEGORY' AND c."active"
   AND lower(c."name") = lower(CASE a."category" WHEN 'chip' THEN 'Chip' WHEN 'mechanical' THEN 'Cơ khí'
                                                 WHEN 'automotive' THEN 'Ô tô' WHEN 'pharma' THEN 'Dược' END);--> statement-breakpoint

-- Disabled leads too: their tags are still facts about the company. A tag that
-- already names an industry (any category, on or off) gets no second row.
WITH "tag" AS (
	SELECT DISTINCT ON (lower(btrim(t."tag"))) btrim(t."tag") AS "name", lower(btrim(t."tag")) AS "key",
	       l."created_at", l."code", t."pos"
	  FROM "sales"."lead" l CROSS JOIN LATERAL unnest(l."industries") WITH ORDINALITY AS t("tag", "pos")
	 ORDER BY lower(btrim(t."tag")), l."created_at", l."code", t."pos"
), "fresh" AS (
	SELECT g."name", row_number() OVER (ORDER BY g."created_at", g."code", g."pos") AS "n"
	  FROM "tag" g
	 WHERE NOT EXISTS (SELECT 1 FROM "sales"."config_entry" c
	                    WHERE c."list" = 'INDUSTRY' AND lower(c."name") = g."key")
), "top" AS (
	SELECT coalesce(max(CAST(split_part("id", '-', 2) AS int)), 0) AS "seq", coalesce(max("ord"), 0) AS "ord"
	  FROM "sales"."config_entry" WHERE "list" = 'INDUSTRY'
)
INSERT INTO "sales"."config_entry" ("id", "list", "name", "ord")
SELECT 'IN-' || lpad(CAST(t."seq" + f."n" AS text), greatest(2, length(CAST(t."seq" + f."n" AS text))), '0'),
       'INDUSTRY', f."name", t."ord" + f."n"
  FROM "fresh" f CROSS JOIN "top" t;--> statement-breakpoint

-- One link per (lead, tag); an uncategorised row wins a name shared across
-- categories. Only leads with no link yet, so a re-run never undoes an edit.
INSERT INTO "sales"."lead_industry" ("lead_code", "industry_id")
SELECT DISTINCT ON (l."code", lower(btrim(t."tag"))) l."code", c."id"
  FROM "sales"."lead" l CROSS JOIN LATERAL unnest(l."industries") AS t("tag")
  JOIN "sales"."config_entry" c
    ON c."list" = 'INDUSTRY' AND c."active" AND lower(c."name") = lower(btrim(t."tag"))
 WHERE NOT EXISTS (SELECT 1 FROM "sales"."lead_industry" li WHERE li."lead_code" = l."code")
 ORDER BY l."code", lower(btrim(t."tag")), c."parent_id" NULLS FIRST, c."id"
ON CONFLICT DO NOTHING;--> statement-breakpoint

-- The migrate -> deploy window: the old api still writes the slug and the tags.
-- BEFORE for the category (it sets a column of the same row: no second UPDATE,
-- no second change event); AFTER for the tags (the links need the lead row).
-- The new api never writes the old columns, so these never fire after deploy.
-- Dropped with the old columns in the follow-up migration.
CREATE OR REPLACE FUNCTION "sales"."legacy_category_sync"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	NEW."category_id" := (SELECT c."id" FROM "sales"."config_entry" c
	                       WHERE c."list" = 'CATEGORY' AND c."active"
	                         AND lower(c."name") = lower(CASE NEW."category" WHEN 'chip' THEN 'Chip' WHEN 'mechanical' THEN 'Cơ khí'
	                                                                         WHEN 'automotive' THEN 'Ô tô' WHEN 'pharma' THEN 'Dược' END)
	                       ORDER BY c."id" LIMIT 1);
	RETURN NEW;
END;
$$;--> statement-breakpoint
-- The tags become the lead's whole link set: a live INDUSTRY by name, an
-- uncategorised one first (the backfill's pick); a new uncategorised row only
-- when no row of that name exists at all. Lock (61001, 15) is
-- `ConfigRepository.create`'s for INDUSTRY (`LOCK_SPACE`, list index), so ids
-- minted here and by an approval never collide.
CREATE OR REPLACE FUNCTION "sales"."lead_legacy_industry_sync"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
	t text;
	k text;
	hit text;
	seq int;
	pos int;
BEGIN
	DELETE FROM "sales"."lead_industry" WHERE "lead_code" = NEW."code";
	FOREACH t IN ARRAY NEW."industries" LOOP
		k := lower(btrim(t));
		CONTINUE WHEN k = '';
		SELECT c."id" INTO hit FROM "sales"."config_entry" c
		 WHERE c."list" = 'INDUSTRY' AND c."active" AND lower(c."name") = k
		 ORDER BY c."parent_id" NULLS FIRST, c."id" LIMIT 1;
		IF hit IS NULL AND NOT EXISTS (SELECT 1 FROM "sales"."config_entry" c
		                                WHERE c."list" = 'INDUSTRY' AND lower(c."name") = k) THEN
			PERFORM pg_advisory_xact_lock(61001, 15);
			SELECT coalesce(max(CAST(split_part("id", '-', 2) AS int)), 0) + 1, coalesce(max("ord"), 0) + 1
			  INTO seq, pos FROM "sales"."config_entry" WHERE "list" = 'INDUSTRY';
			hit := 'IN-' || lpad(seq::text, greatest(2, length(seq::text)), '0');
			INSERT INTO "sales"."config_entry" ("id", "list", "name", "ord") VALUES (hit, 'INDUSTRY', btrim(t), pos);
		END IF;
		IF hit IS NOT NULL THEN
			INSERT INTO "sales"."lead_industry" ("lead_code", "industry_id") VALUES (NEW."code", hit) ON CONFLICT DO NOTHING;
		END IF;
	END LOOP;
	RETURN NULL;
END;
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS "lead_legacy_category_sync_insert" ON "sales"."lead";--> statement-breakpoint
CREATE TRIGGER "lead_legacy_category_sync_insert" BEFORE INSERT ON "sales"."lead" FOR EACH ROW
	WHEN (NEW."category" IS NOT NULL AND NEW."category_id" IS NULL) EXECUTE FUNCTION "sales"."legacy_category_sync"();--> statement-breakpoint
DROP TRIGGER IF EXISTS "lead_legacy_category_sync_update" ON "sales"."lead";--> statement-breakpoint
CREATE TRIGGER "lead_legacy_category_sync_update" BEFORE UPDATE OF "category" ON "sales"."lead" FOR EACH ROW
	WHEN (OLD."category" IS DISTINCT FROM NEW."category") EXECUTE FUNCTION "sales"."legacy_category_sync"();--> statement-breakpoint
DROP TRIGGER IF EXISTS "account_legacy_category_sync_insert" ON "sales"."account";--> statement-breakpoint
CREATE TRIGGER "account_legacy_category_sync_insert" BEFORE INSERT ON "sales"."account" FOR EACH ROW
	WHEN (NEW."category" IS NOT NULL AND NEW."category_id" IS NULL) EXECUTE FUNCTION "sales"."legacy_category_sync"();--> statement-breakpoint
DROP TRIGGER IF EXISTS "account_legacy_category_sync_update" ON "sales"."account";--> statement-breakpoint
CREATE TRIGGER "account_legacy_category_sync_update" BEFORE UPDATE OF "category" ON "sales"."account" FOR EACH ROW
	WHEN (OLD."category" IS DISTINCT FROM NEW."category") EXECUTE FUNCTION "sales"."legacy_category_sync"();--> statement-breakpoint
DROP TRIGGER IF EXISTS "lead_legacy_industry_sync_insert" ON "sales"."lead";--> statement-breakpoint
CREATE TRIGGER "lead_legacy_industry_sync_insert" AFTER INSERT ON "sales"."lead" FOR EACH ROW
	WHEN (cardinality(NEW."industries") > 0) EXECUTE FUNCTION "sales"."lead_legacy_industry_sync"();--> statement-breakpoint
DROP TRIGGER IF EXISTS "lead_legacy_industry_sync_update" ON "sales"."lead";--> statement-breakpoint
CREATE TRIGGER "lead_legacy_industry_sync_update" AFTER UPDATE OF "industries" ON "sales"."lead" FOR EACH ROW
	WHEN (OLD."industries" IS DISTINCT FROM NEW."industries") EXECUTE FUNCTION "sales"."lead_legacy_industry_sync"();
