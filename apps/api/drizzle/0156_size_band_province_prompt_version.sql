-- 0156 - `platform.ai_call.prompt_version` (`id@version` of the prompt a call used);
-- `size_band` on `sales.lead` and `sales.account`, backfilled from `headcount`, and
-- counted by slot 3 of `lead.required_filled`; the province backfill to the post-2025
-- 34 units on both tables (the only province columns); `lead.ai_fill` key `headcount`
-- renamed `sizeBand`.
--
-- Additive: `headcount` stays for the old api. The `*_legacy_size_province_sync`
-- triggers turn its writes (headcount, raw province) into the new form until deploy;
-- they, both `legacy_*` functions and `headcount` drop in the follow-up migration.
-- Folding uses `sales.fold` (0088), not `unaccent`: PGlite does not ship it.
-- Backfill UPDATEs fire 0126's change push per touched row; updated_at is left alone.
-- ORDER: migrate BEFORE deploy. Re-runnable: IF NOT EXISTS, DROP ... IF EXISTS before
-- ADD, guarded DO block, UPDATEs touch only rows they change. Hand-written for 0047's reason.
-- Each ALTER below waits for an exclusive lock that every writer then queues behind:
-- give up after 10 s instead. Lasts to the migrator's commit (one transaction).
SET LOCAL lock_timeout = '10s';--> statement-breakpoint
ALTER TABLE "platform"."ai_call" ADD COLUMN IF NOT EXISTS "prompt_version" text;--> statement-breakpoint
ALTER TABLE "platform"."ai_call" DROP CONSTRAINT IF EXISTS "ai_call_prompt_version_shape";--> statement-breakpoint
ALTER TABLE "platform"."ai_call" ADD CONSTRAINT "ai_call_prompt_version_shape" CHECK ("prompt_version" IS NULL OR "prompt_version" ~ '^\S+@\S+$');--> statement-breakpoint

-- A fill is now two calls at medium thinking: more output room, a longer wait and
-- twice the calls per press. 30 s, not more, while the fill blocks the screen (until
-- the A-2 background tray). Only a route still on 0153's seed values moves.
UPDATE "platform"."ai_route"
SET "max_tokens_out" = 8192, "timeout_ms" = 30000, "daily_calls_per_user" = 200
WHERE "task" = 'lead-enrich' AND "max_tokens_out" = 4096 AND "timeout_ms" = 25000
  AND "daily_calls_per_user" = 100;--> statement-breakpoint

-- `LeadSizeBand`, copied by hand from the contract: a new band is a migration a person reads.
ALTER TABLE "sales"."lead" ADD COLUMN IF NOT EXISTS "size_band" text;--> statement-breakpoint
ALTER TABLE "sales"."lead" DROP CONSTRAINT IF EXISTS "lead_size_band_known";--> statement-breakpoint
ALTER TABLE "sales"."lead" ADD CONSTRAINT "lead_size_band_known" CHECK ("size_band" IN ('lt50', '50-200', '200-500', '500-1000', 'gt1000'));--> statement-breakpoint
ALTER TABLE "sales"."account" ADD COLUMN IF NOT EXISTS "size_band" text;--> statement-breakpoint
ALTER TABLE "sales"."account" DROP CONSTRAINT IF EXISTS "account_size_band_known";--> statement-breakpoint
ALTER TABLE "sales"."account" ADD CONSTRAINT "account_size_band_known" CHECK ("size_band" IN ('lt50', '50-200', '200-500', '500-1000', 'gt1000'));--> statement-breakpoint

-- Each band includes its lower bound and excludes its upper: 200 is '200-500',
-- 1000 is 'gt1000'.
CREATE OR REPLACE FUNCTION "sales"."legacy_size_band"(n integer) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $fn$
  SELECT CASE WHEN n IS NULL THEN NULL WHEN n < 50 THEN 'lt50' WHEN n < 200 THEN '50-200'
    WHEN n < 500 THEN '200-500' WHEN n < 1000 THEN '500-1000' ELSE 'gt1000' END
$fn$;--> statement-breakpoint

-- Mirrors `normaliseProvince` in @pv/contracts (geo.ts); change both together. Fold,
-- drop a leading "tinh" / "thanh pho" / "tp" / "t." then every non [a-z0-9], and look the
-- key up in the 34 new names plus `PROVINCE_ALIASES`. No match keeps the trimmed text as
-- typed, prefix included. Blank is NULL here (the house rule), where the contract gives ''.
-- NFC first so decomposed input reaches the folding; the trim set is JS `trim()`'s.
CREATE OR REPLACE FUNCTION "sales"."legacy_normalise_province"(p text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $fn$
  SELECT nullif(coalesce((SELECT "name" FROM (VALUES
  ('hanoi', 'Hà Nội'), ('hn', 'Hà Nội'), ('hue', 'Huế'), ('thuathienhue', 'Huế'),
  ('laichau', 'Lai Châu'), ('dienbien', 'Điện Biên'), ('sonla', 'Sơn La'),
  ('langson', 'Lạng Sơn'), ('quangninh', 'Quảng Ninh'), ('thanhhoa', 'Thanh Hóa'),
  ('nghean', 'Nghệ An'), ('hatinh', 'Hà Tĩnh'), ('caobang', 'Cao Bằng'),
  ('tuyenquang', 'Tuyên Quang'), ('hagiang', 'Tuyên Quang'),
  ('laocai', 'Lào Cai'), ('yenbai', 'Lào Cai'),
  ('thainguyen', 'Thái Nguyên'), ('backan', 'Thái Nguyên'), ('baccan', 'Thái Nguyên'),
  ('phutho', 'Phú Thọ'), ('vinhphuc', 'Phú Thọ'), ('hoabinh', 'Phú Thọ'),
  ('bacninh', 'Bắc Ninh'), ('bacgiang', 'Bắc Ninh'),
  ('hungyen', 'Hưng Yên'), ('thaibinh', 'Hưng Yên'),
  ('haiphong', 'Hải Phòng'), ('haiduong', 'Hải Phòng'),
  ('ninhbinh', 'Ninh Bình'), ('hanam', 'Ninh Bình'), ('namdinh', 'Ninh Bình'),
  ('quangtri', 'Quảng Trị'), ('quangbinh', 'Quảng Trị'),
  ('danang', 'Đà Nẵng'), ('quangnam', 'Đà Nẵng'),
  ('quangngai', 'Quảng Ngãi'), ('kontum', 'Quảng Ngãi'),
  ('gialai', 'Gia Lai'), ('binhdinh', 'Gia Lai'),
  ('khanhhoa', 'Khánh Hòa'), ('ninhthuan', 'Khánh Hòa'),
  ('lamdong', 'Lâm Đồng'), ('daknong', 'Lâm Đồng'), ('binhthuan', 'Lâm Đồng'),
  ('daklak', 'Đắk Lắk'), ('phuyen', 'Đắk Lắk'),
  ('hochiminh', 'Hồ Chí Minh'), ('hochiminhcity', 'Hồ Chí Minh'), ('hcm', 'Hồ Chí Minh'),
  ('saigon', 'Hồ Chí Minh'), ('binhduong', 'Hồ Chí Minh'), ('bariavungtau', 'Hồ Chí Minh'),
  ('vungtau', 'Hồ Chí Minh'), ('brvt', 'Hồ Chí Minh'),
  ('dongnai', 'Đồng Nai'), ('binhphuoc', 'Đồng Nai'),
  ('tayninh', 'Tây Ninh'), ('longan', 'Tây Ninh'),
  ('cantho', 'Cần Thơ'), ('soctrang', 'Cần Thơ'), ('haugiang', 'Cần Thơ'),
  ('vinhlong', 'Vĩnh Long'), ('bentre', 'Vĩnh Long'), ('travinh', 'Vĩnh Long'),
  ('dongthap', 'Đồng Tháp'), ('tiengiang', 'Đồng Tháp'),
  ('camau', 'Cà Mau'), ('baclieu', 'Cà Mau'),
  ('angiang', 'An Giang'), ('kiengiang', 'An Giang')
  ) AS "map"("k", "name") WHERE "k" = regexp_replace(regexp_replace(
    sales.fold(t), '^(tinh|thanh\s*pho|tp|t\.)[\s.]*', ''), '[^a-z0-9]', '', 'g')),
    t), '')
  FROM (SELECT btrim(normalize(p, NFC), E' \t\n\u000B\f\r\u00A0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF') AS t) AS s
$fn$;--> statement-breakpoint

-- A band already set is never overwritten.
UPDATE "sales"."lead" SET "size_band" = "sales"."legacy_size_band"("headcount")
  WHERE "size_band" IS NULL AND "headcount" IS NOT NULL;--> statement-breakpoint
UPDATE "sales"."account" SET "size_band" = "sales"."legacy_size_band"("headcount")
  WHERE "size_band" IS NULL AND "headcount" IS NOT NULL;--> statement-breakpoint
UPDATE "sales"."lead" SET "province" = "sales"."legacy_normalise_province"("province")
  WHERE "province" IS DISTINCT FROM "sales"."legacy_normalise_province"("province");--> statement-breakpoint
UPDATE "sales"."account" SET "province" = "sales"."legacy_normalise_province"("province")
  WHERE "province" IS DISTINCT FROM "sales"."legacy_normalise_province"("province");--> statement-breakpoint

-- The AI mark follows its field; a `sizeBand` mark already present wins.
UPDATE "sales"."lead"
  SET "ai_fill" = jsonb_build_object('sizeBand', "ai_fill" -> 'headcount') || ("ai_fill" - 'headcount')
  WHERE "ai_fill" -> 'headcount' IS NOT NULL;--> statement-breakpoint

-- Slot 3 reads `size_band` or `plants` (`SLOT_FIELDS.scale` in @pv/engines, same
-- change): the backfill above and the sync trigger below put a band wherever a headcount
-- is, so no row's count moves. Drop and re-add rather than SET EXPRESSION, which needs
-- Postgres 17. Nothing depends on the column but its own NOT NULL; the guard makes a
-- re-run skip the table rewrite.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
             WHERE d.adrelid = '"sales"."lead"'::regclass AND a.attname = 'required_filled'
               AND pg_get_expr(d.adbin, d.adrelid) LIKE '%size_band%'
               AND pg_get_expr(d.adbin, d.adrelid) NOT LIKE '%headcount%') THEN
    RETURN;
  END IF;
  ALTER TABLE "sales"."lead" DROP COLUMN IF EXISTS "required_filled";
  ALTER TABLE "sales"."lead" ADD COLUMN "required_filled" smallint NOT NULL GENERATED ALWAYS AS (((
        ("legal_name" IS NOT NULL OR "tax_code" IS NOT NULL OR "address" IS NOT NULL)::int
      + ("main_product" IS NOT NULL)::int
      + ("size_band" IS NOT NULL OR "plants" IS NOT NULL)::int
      + ("contact_title" IS NOT NULL)::int
      + ("phone" IS NOT NULL OR "contact_channel" IS NOT NULL)::int
      + ("pain" IS NOT NULL)::int
      )::smallint)) STORED;
END
$$;--> statement-breakpoint

-- Old-api writes between migrate and deploy: a headcount sets the band unless the same
-- write set one; a province is normalised. Inert for the new api, which writes both in
-- the new form. Dropped with `headcount` in the follow-up migration.
CREATE OR REPLACE FUNCTION "sales"."legacy_size_province_sync"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."headcount" IS NOT NULL AND (TG_OP = 'INSERT' AND NEW."size_band" IS NULL
     OR TG_OP = 'UPDATE' AND NEW."headcount" IS DISTINCT FROM OLD."headcount"
        AND NEW."size_band" IS NOT DISTINCT FROM OLD."size_band") THEN
    NEW."size_band" := "sales"."legacy_size_band"(NEW."headcount");
  END IF;
  NEW."province" := "sales"."legacy_normalise_province"(NEW."province");
  RETURN NEW;
END;
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS "lead_legacy_size_province_sync" ON "sales"."lead";--> statement-breakpoint
CREATE TRIGGER "lead_legacy_size_province_sync" BEFORE INSERT OR UPDATE OF "headcount", "province" ON "sales"."lead"
	FOR EACH ROW EXECUTE FUNCTION "sales"."legacy_size_province_sync"();--> statement-breakpoint
DROP TRIGGER IF EXISTS "account_legacy_size_province_sync" ON "sales"."account";--> statement-breakpoint
CREATE TRIGGER "account_legacy_size_province_sync" BEFORE INSERT OR UPDATE OF "headcount", "province" ON "sales"."account"
	FOR EACH ROW EXECUTE FUNCTION "sales"."legacy_size_province_sync"();
