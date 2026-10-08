-- 0088 - global search: `sales.search_recent`, `sales.fold`, and the trigram indexes.
--
-- `fold` is the SQL twin of `text.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/gi, "d")
-- .toLowerCase()` in header-search.tsx, spelled as a translate() table because
-- `unaccent` is not IMMUTABLE and an index expression must be. Both strings are the 134
-- precomposed Vietnamese letters (60 toned vowels + 6 untoned ă â ê ô ơ ư + đ, both cases)
-- and must stay equal in length. Text stored already decomposed (NFD) is not folded.
--
-- The trigram block is guarded: PGlite ships pg_trgm only as a constructor extension, which
-- the client drizzle-kit builds does not load, so an unguarded CREATE EXTENSION fails
-- locally. On Neon it is available and the block runs. Additive only.
CREATE TABLE "sales"."search_recent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text NOT NULL,
	"q" text NOT NULL,
	"kinds" text[],
	"picked_kind" text,
	"picked_code" text,
	"result_count" integer NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "search_recent_picked_kind_known" CHECK ("picked_kind" IS NULL OR "picked_kind" IN ('lead', 'account', 'contact', 'opportunity', 'campaign', 'contract')),
	CONSTRAINT "search_recent_pick_is_whole" CHECK (("picked_kind" IS NULL) = ("picked_code" IS NULL)),
	CONSTRAINT "search_recent_count_nonneg" CHECK ("result_count" >= 0)
);--> statement-breakpoint
ALTER TABLE "sales"."search_recent" ADD CONSTRAINT "search_recent_actor_id_actor_id_fk" FOREIGN KEY ("actor_id") REFERENCES "platform"."actor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "search_recent_actor_at_idx" ON "sales"."search_recent" USING btree ("actor_id","at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "search_recent_pick_uq" ON "sales"."search_recent" USING btree ("actor_id","picked_kind","picked_code") WHERE "picked_code" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "search_recent_query_uq" ON "sales"."search_recent" USING btree ("actor_id","q") WHERE "picked_code" IS NULL;--> statement-breakpoint
CREATE OR REPLACE FUNCTION sales.fold(t text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $fn$
  SELECT lower(translate(t,
    'àáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵăâêôơưđÀÁẢÃẠẰẮẲẴẶẦẤẨẪẬÈÉẺẼẸỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌỒỐỔỖỘỜỚỞỠỢÙÚỦŨỤỪỨỬỮỰỲÝỶỸỴĂÂÊÔƠƯĐ',
    'aaaaaaaaaaaaaaaeeeeeeeeeeiiiiiooooooooooooooouuuuuuuuuuyyyyyaaeooudaaaaaaaaaaaaaaaeeeeeeeeeeiiiiiooooooooooooooouuuuuuuuuuyyyyyaaeooud'))
$fn$;--> statement-breakpoint
DO $$
DECLARE
  ext_schema text;
  spec text[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_trgm') THEN
    RETURN;
  END IF;
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  -- The operator class lives in the extension's schema, wherever that is; qualify it.
  SELECT n.nspname INTO ext_schema FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'pg_trgm';
  FOREACH spec SLICE 1 IN ARRAY ARRAY[
    ['lead', 'company'], ['lead', 'legal_name'], ['lead', 'tax_code'], ['lead', 'code'],
    ['account', 'name'], ['account', 'legal_name'], ['account', 'tax_code'], ['account', 'code'],
    ['contact', 'name'], ['contact', 'email'], ['contact', 'phone'],
    ['opportunity', 'name'], ['opportunity', 'code'],
    ['campaign', 'name'], ['campaign', 'code'], ['contract', 'code']
  ] LOOP
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON sales.%I USING gin (sales.fold(%I) %I.gin_trgm_ops)',
      spec[1] || '_' || spec[2] || '_fold_trgm', spec[1], spec[2], ext_schema);
  END LOOP;
END $$;
