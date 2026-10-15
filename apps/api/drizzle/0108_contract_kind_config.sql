-- 0108 - contract kind becomes an edited config list: `CONTRACT_KIND`, prefix
-- CK, in `sales.config_entry`. `contract.kind` and `quotation.kind` stop being
-- 'licence' | 'deployment' | 'training' under a copied-out CHECK and hold the
-- CK id instead, under a real composite foreign key (`lead.campaign_list`'s
-- trick: a generated key half, so a NULL kind passes and a kind that names
-- a row of another list is refused). Config rows are never deleted, so the key
-- cannot refuse a legitimate write.
-- `sales.config_entry` needs no DDL: no constraint enumerates `list` or the
-- id shape (0104 said the same).
-- ORDER: migrate BEFORE the deploy. In the gap the old build still writes
-- 'licence': the key refuses it on a contract or quotation (23503) but cannot
-- see an approval payload, so run DATA 3 again once AFTER the deploy.
-- The DDL is not re-runnable; the data statements are, and change nothing the
-- second time. Hand-written for 0047's reason.

-- DATA 1 of 3 - the fourteen starting kinds. CK-01..03 are the three that were
-- hard-coded, so the UPDATEs below are a pure rename. Only if the list is
-- empty, 0069's guard: a database that already holds rows is left alone.
INSERT INTO "sales"."config_entry" ("id", "list", "name", "ord")
SELECT v."id", 'CONTRACT_KIND', v."name", v."ord"
  FROM (VALUES
    ('CK-01', 'Bản quyền', 1),
    ('CK-02', 'Triển khai', 2),
    ('CK-03', 'Đào tạo', 3),
    ('CK-04', 'Bảo trì và hỗ trợ', 4),
    ('CK-05', 'Mua bán, cung cấp', 5),
    ('CK-06', 'Dịch vụ', 6),
    ('CK-07', 'Đại lý, phân phối', 7),
    ('CK-08', 'Hợp đồng khung', 8),
    ('CK-09', 'Hợp đồng nguyên tắc', 9),
    ('CK-10', 'Thỏa thuận bảo mật (NDA)', 10),
    ('CK-11', 'Biên bản ghi nhớ (MOU)', 11),
    ('CK-12', 'Thư ý định (LOI/LOC)', 12),
    ('CK-13', 'Phụ lục hợp đồng', 13),
    ('CK-14', 'Đơn hàng (PO)', 14)
  ) AS v("id", "name", "ord")
 WHERE NOT EXISTS (SELECT 1 FROM "sales"."config_entry" WHERE "list" = 'CONTRACT_KIND');--> statement-breakpoint

-- The two copied-out lists go BEFORE the rewrite: 'CK-01' is not in them.
ALTER TABLE "sales"."contract" DROP CONSTRAINT "contract_kind_known";--> statement-breakpoint
ALTER TABLE "sales"."quotation" DROP CONSTRAINT "quotation_kind_known";--> statement-breakpoint

-- DATA 2 of 3 - the rows that hold a kind. Same mapping in every statement.
UPDATE "sales"."contract"
   SET "kind" = CASE "kind" WHEN 'licence' THEN 'CK-01' WHEN 'deployment' THEN 'CK-02' ELSE 'CK-03' END
 WHERE "kind" IN ('licence', 'deployment', 'training');--> statement-breakpoint
UPDATE "sales"."quotation"
   SET "kind" = CASE "kind" WHEN 'licence' THEN 'CK-01' WHEN 'deployment' THEN 'CK-02' ELSE 'CK-03' END
 WHERE "kind" IN ('licence', 'deployment', 'training');--> statement-breakpoint

-- DATA 3 of 3 - a sign request not yet answered carries the kind in its jsonb
-- payload, and approving it re-parses `ContractSignProposal`. Every
-- `contract-sign` row is rewritten, decided ones too: the profile and the
-- inbox read them back through the same schema.
UPDATE "platform"."approval"
   SET "payload" = jsonb_set(
         "payload", '{sign,kind}',
         to_jsonb(CASE "payload" #>> '{sign,kind}'
                    WHEN 'licence' THEN 'CK-01'
                    WHEN 'deployment' THEN 'CK-02'
                    ELSE 'CK-03' END))
 WHERE "kind" = 'contract-sign'
   AND "payload" #>> '{sign,kind}' IN ('licence', 'deployment', 'training');--> statement-breakpoint

-- The key. `kind_list` is STORED, so both tables are rewritten once; each
-- is small. Added AFTER the rewrite, or it would refuse it.
ALTER TABLE "sales"."contract" ADD COLUMN "kind_list" text GENERATED ALWAYS AS (CASE WHEN "kind" IS NULL THEN NULL ELSE 'CONTRACT_KIND' END) STORED;--> statement-breakpoint
ALTER TABLE "sales"."contract" ADD CONSTRAINT "contract_kind_fk" FOREIGN KEY ("kind","kind_list") REFERENCES "sales"."config_entry"("id","list") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."quotation" ADD COLUMN "kind_list" text GENERATED ALWAYS AS (CASE WHEN "kind" IS NULL THEN NULL ELSE 'CONTRACT_KIND' END) STORED;--> statement-breakpoint
ALTER TABLE "sales"."quotation" ADD CONSTRAINT "quotation_kind_fk" FOREIGN KEY ("kind","kind_list") REFERENCES "sales"."config_entry"("id","list") ON DELETE no action ON UPDATE no action;
