-- 0155 - the owner's starting lists (28/10/2026): five categories, high-tech
-- first (Chip, Điện tử, Dược, Ô tô, Cơ khí), each with its industries, also
-- high-tech first. Data only, no schema change.
--
-- A category or industry is created only when no row of that name exists in
-- that place (switched off counts), so a re-run never re-mints what an admin
-- archived. Ids and ords are minted like ConfigRepository.create (0154's rule).
-- An uncategorised industry whose name matches a new one is merged into it, the
-- way the Settings merge does: links move, the old row is switched off.
-- Categories are re-ordered through a +1000 detour so `config_ord_uniq` never
-- sees two rows on one ord. ORDER: after 0154; independent of deploy.
DO $$
DECLARE
	v text;
	seq int;
	pos int;
BEGIN
	FOREACH v IN ARRAY ARRAY['Chip', 'Điện tử', 'Dược', 'Ô tô', 'Cơ khí'] LOOP
		CONTINUE WHEN EXISTS (SELECT 1 FROM "sales"."config_entry"
		                       WHERE "list" = 'CATEGORY' AND lower("name") = lower(v));
		SELECT coalesce(max(CAST(split_part("id", '-', 2) AS int)), 0) + 1, coalesce(max("ord"), 0) + 1
		  INTO seq, pos FROM "sales"."config_entry" WHERE "list" = 'CATEGORY';
		INSERT INTO "sales"."config_entry" ("id", "list", "name", "ord")
		VALUES ('CT-' || lpad(seq::text, greatest(2, length(seq::text)), '0'), 'CATEGORY', v, pos);
	END LOOP;
END;
$$;--> statement-breakpoint

UPDATE "sales"."config_entry" SET "ord" = "ord" + 1000 WHERE "list" = 'CATEGORY';--> statement-breakpoint
UPDATE "sales"."config_entry" c SET "ord" = o."pos"
FROM (
	SELECT "id", row_number() OVER (
		ORDER BY coalesce(array_position(ARRAY['chip', 'điện tử', 'dược', 'ô tô', 'cơ khí'], lower("name")), 100), "ord"
	) AS "pos"
	FROM "sales"."config_entry" WHERE "list" = 'CATEGORY'
) o
WHERE c."id" = o."id";--> statement-breakpoint

DO $$
DECLARE
	r record;
	cat text;
	seq int;
	pos int;
BEGIN
	FOR r IN
		SELECT * FROM (VALUES
			('Chip', 1, 'Thiết kế chip'), ('Chip', 2, 'Chế tạo wafer'), ('Chip', 3, 'Đóng gói kiểm thử'),
			('Chip', 4, 'Thiết bị bán dẫn'), ('Chip', 5, 'Vật liệu bán dẫn'), ('Chip', 6, 'Linh kiện bán dẫn'),
			('Chip', 7, 'Phòng sạch'),
			('Điện tử', 1, 'Lắp ráp PCB'), ('Điện tử', 2, 'Linh kiện điện tử'), ('Điện tử', 3, 'Thiết bị viễn thông'),
			('Điện tử', 4, 'Màn hình hiển thị'), ('Điện tử', 5, 'Pin và lưu trữ'), ('Điện tử', 6, 'Thiết bị IoT'),
			('Điện tử', 7, 'Điện tử tiêu dùng'), ('Điện tử', 8, 'Cáp và đầu nối'),
			('Dược', 1, 'Dược phẩm sinh học'), ('Dược', 2, 'Thiết bị y tế'), ('Dược', 3, 'Nguyên liệu dược'),
			('Dược', 4, 'Thuốc generic'), ('Dược', 5, 'Thực phẩm chức năng'), ('Dược', 6, 'Bao bì dược'),
			('Dược', 7, 'Mỹ phẩm'),
			('Ô tô', 1, 'Xe điện'), ('Ô tô', 2, 'Điện tử ô tô'), ('Ô tô', 3, 'Dây điện ô tô'),
			('Ô tô', 4, 'Phụ tùng ô tô'), ('Ô tô', 5, 'Lắp ráp xe'), ('Ô tô', 6, 'Lốp và cao su'),
			('Ô tô', 7, 'Nội thất ô tô'),
			('Cơ khí', 1, 'Tự động hoá'), ('Cơ khí', 2, 'Máy công nghiệp'), ('Cơ khí', 3, 'Gia công CNC'),
			('Cơ khí', 4, 'Khuôn mẫu'), ('Cơ khí', 5, 'Ép nhựa'), ('Cơ khí', 6, 'Đúc kim loại'),
			('Cơ khí', 7, 'Dập kim loại'), ('Cơ khí', 8, 'Kết cấu thép')
		) AS t("category", "rank", "name")
		ORDER BY array_position(ARRAY['Chip', 'Điện tử', 'Dược', 'Ô tô', 'Cơ khí'], t."category"), t."rank"
	LOOP
		SELECT "id" INTO cat FROM "sales"."config_entry"
		 WHERE "list" = 'CATEGORY' AND lower("name") = lower(r."category")
		 ORDER BY "active" DESC, "ord" LIMIT 1;
		CONTINUE WHEN EXISTS (SELECT 1 FROM "sales"."config_entry"
		                       WHERE "list" = 'INDUSTRY' AND "parent_id" = cat AND lower("name") = lower(r."name"));
		SELECT coalesce(max(CAST(split_part("id", '-', 2) AS int)), 0) + 1, coalesce(max("ord"), 0) + 1
		  INTO seq, pos FROM "sales"."config_entry" WHERE "list" = 'INDUSTRY';
		INSERT INTO "sales"."config_entry" ("id", "list", "name", "ord", "parent_id")
		VALUES ('IN-' || lpad(seq::text, greatest(2, length(seq::text)), '0'), 'INDUSTRY', r."name", pos, cat);
	END LOOP;
END;
$$;--> statement-breakpoint

-- Merge: an active uncategorised industry with the same name as a categorised
-- one gives its links to it (a lead holding both keeps one) and switches off.
INSERT INTO "sales"."lead_industry" ("lead_code", "industry_id")
SELECT li."lead_code", t."id"
FROM "sales"."lead_industry" li
JOIN "sales"."config_entry" s ON s."id" = li."industry_id" AND s."list" = 'INDUSTRY'
JOIN "sales"."config_entry" t ON t."list" = 'INDUSTRY' AND t."parent_id" IS NOT NULL AND t."active"
                              AND lower(t."name") = lower(s."name")
WHERE s."parent_id" IS NULL AND s."active"
ON CONFLICT DO NOTHING;--> statement-breakpoint

DELETE FROM "sales"."lead_industry" li
USING "sales"."config_entry" s
WHERE s."id" = li."industry_id" AND s."list" = 'INDUSTRY' AND s."parent_id" IS NULL AND s."active"
  AND EXISTS (SELECT 1 FROM "sales"."config_entry" t
              WHERE t."list" = 'INDUSTRY' AND t."parent_id" IS NOT NULL AND t."active"
                AND lower(t."name") = lower(s."name"));--> statement-breakpoint

UPDATE "sales"."config_entry" s SET "active" = false
WHERE s."list" = 'INDUSTRY' AND s."parent_id" IS NULL AND s."active"
  AND EXISTS (SELECT 1 FROM "sales"."config_entry" t
              WHERE t."list" = 'INDUSTRY' AND t."parent_id" IS NOT NULL AND t."active"
                AND lower(t."name") = lower(s."name"));
