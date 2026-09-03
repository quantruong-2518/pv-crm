CREATE SEQUENCE "sales"."account_code_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 201 CACHE 1;--> statement-breakpoint
/* ==========================================================================
   VIẾT TAY · KHỐI CONTACT LÀ IDEMPOTENT — ĐỪNG XOÁ KHI SINH LẠI FILE NÀY
   ==========================================================================
   `sales.contact` và dãy mã của nó ĐÃ SỐNG trên Neon từ 28/08: migration 0018
   tạo và backfill 123 dòng (mọi dòng còn mang `by = 'backfill 0018'`). Nhưng
   file .sql của 0018 KHÔNG CÒN trong cây — nó rụng lúc gỡ va chạm hai migration
   cùng số 0024 trong lượt gộp master vào develop. Snapshot của drizzle vì thế
   không biết bảng đó tồn tại, và bản sinh tự động của file này tạo lại nó lần
   thứ hai.

   Chạy nguyên bản sinh ra thì Postgres từ chối ngay câu đầu ("already exists")
   và cả migration rollback. Còn CẮT HẲN phần contact đi thì một database SẠCH
   dựng từ migration sẽ vĩnh viễn không có bảng này — lỗ hổng mà 0018 để lại
   không bao giờ được vá.

   Nên khối dưới đây làm cả hai: trên Neon nó không làm gì, trên một database
   mới nó dựng đủ bảng, ba khoá ngoại và ba index. Đó cũng là lý do các câu
   contact gom vào MỘT khối thay vì nằm rải như bản sinh — chúng phải cùng một
   điều kiện.

   Hình bên dưới chép ĐÚNG hình đang sống, kể cả tên ràng buộc và
   `lower("email")` của index: đổi một tên là lượt `db:generate` kế tiếp phát ra
   một câu ALTER lên bảng thật mà chẳng để làm gì.
   ========================================================================== */
DO $$
BEGIN
  IF to_regclass('sales.contact') IS NULL THEN
    CREATE SEQUENCE IF NOT EXISTS "sales"."contact_code_seq"
      INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1001 CACHE 1;

    CREATE TABLE "sales"."contact" (
      "code" text PRIMARY KEY NOT NULL,
      "lead_code" text NOT NULL,
      "name" text NOT NULL,
      "title" text,
      "email" text,
      "phone" text,
      "channel" text,
      "is_primary" boolean DEFAULT false NOT NULL,
      "note" text,
      "by" text NOT NULL,
      "created_by" text,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT "contact_no_blank" CHECK ("lead_code" <> '' AND "name" <> '' AND "by" <> '' AND "title" <> '' AND "email" <> '' AND "phone" <> '' AND "channel" <> '' AND "note" <> ''),
      CONSTRAINT "contact_channel_known" CHECK ("channel" IS NULL OR "channel" IN ('email', 'zalo-oa', 'telegram', 'in-app', 'linkedin', 'facebook', 'website'))
    );

    ALTER TABLE "sales"."contact" ADD CONSTRAINT "contact_code_object_code_fk" FOREIGN KEY ("code") REFERENCES "platform"."object"("code") ON DELETE no action ON UPDATE no action;
    ALTER TABLE "sales"."contact" ADD CONSTRAINT "contact_lead_code_lead_code_fk" FOREIGN KEY ("lead_code") REFERENCES "sales"."lead"("code") ON DELETE no action ON UPDATE no action;
    ALTER TABLE "sales"."contact" ADD CONSTRAINT "contact_created_by_actor_id_fk" FOREIGN KEY ("created_by") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;

    CREATE INDEX "contact_lead_idx" ON "sales"."contact" USING btree ("lead_code");
    CREATE INDEX "contact_email_idx" ON "sales"."contact" USING btree (lower("email"));
    CREATE UNIQUE INDEX "contact_primary_idx" ON "sales"."contact" USING btree ("lead_code") WHERE "is_primary";
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE "sales"."account" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"legal_name" text,
	"tax_code" text,
	"address" text,
	"province" text,
	"category" text,
	"headcount" integer,
	"plants" integer,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_name_not_blank" CHECK ("name" <> '')
);
--> statement-breakpoint
CREATE TABLE "sales"."opportunity_product" (
	"opportunity_code" text NOT NULL,
	"product_id" text NOT NULL,
	"list" text DEFAULT 'PRODUCT' NOT NULL,
	CONSTRAINT "opportunity_product_pk" PRIMARY KEY("opportunity_code","product_id"),
	CONSTRAINT "opportunity_product_list" CHECK ("list" = 'PRODUCT')
);
--> statement-breakpoint
CREATE TABLE "sales"."opportunity_stage_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_code" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"from_stage" text,
	"to_stage" text,
	"days_in_from" integer,
	"by_id" text NOT NULL,
	"by" text NOT NULL,
	"note" text,
	CONSTRAINT "opportunity_stage_event_moved" CHECK ("from_stage" IS DISTINCT FROM "to_stage"),
	CONSTRAINT "opportunity_stage_event_clock" CHECK (("from_stage" IS NULL) = ("days_in_from" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "sales"."lead" ADD COLUMN "account_code" text;--> statement-breakpoint
ALTER TABLE "sales"."opportunity" ADD COLUMN "probability" integer;--> statement-breakpoint
ALTER TABLE "sales"."account" ADD CONSTRAINT "account_code_object_code_fk" FOREIGN KEY ("code") REFERENCES "platform"."object"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."opportunity_product" ADD CONSTRAINT "opportunity_product_opportunity_code_opportunity_code_fk" FOREIGN KEY ("opportunity_code") REFERENCES "sales"."opportunity"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."opportunity_product" ADD CONSTRAINT "opportunity_product_config_fk" FOREIGN KEY ("product_id","list") REFERENCES "sales"."config_entry"("id","list") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."opportunity_stage_event" ADD CONSTRAINT "opportunity_stage_event_opportunity_code_opportunity_code_fk" FOREIGN KEY ("opportunity_code") REFERENCES "sales"."opportunity"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."opportunity_stage_event" ADD CONSTRAINT "opportunity_stage_event_by_id_actor_id_fk" FOREIGN KEY ("by_id") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_identity_uniq" ON "sales"."account" USING btree (coalesce(nullif(btrim("tax_code"), ''), lower(btrim("name"))));--> statement-breakpoint
CREATE INDEX "account_province_idx" ON "sales"."account" USING btree ("province");--> statement-breakpoint
CREATE INDEX "account_category_idx" ON "sales"."account" USING btree ("category");--> statement-breakpoint
CREATE INDEX "opportunity_product_product_idx" ON "sales"."opportunity_product" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "opportunity_stage_event_idx" ON "sales"."opportunity_stage_event" USING btree ("opportunity_code","at");--> statement-breakpoint
/* ==========================================================================
   VIẾT TAY · BACKFILL — ĐỨNG ĐÚNG CHỖ NÀY, ĐỪNG DỜI
   ==========================================================================
   `drizzle-kit` chỉ sinh phần HÌNH. Bốn câu dưới đây là phần DỮ LIỆU, và chúng
   phải nằm SAU bảng `sales.account` cùng index định danh, và TRƯỚC hai khoá
   ngoại ngay dưới.

   Đảo thứ tự đó là migration chết trên Neon: `opportunity.account_code` là cột
   đã có từ trước, nên thêm khoá ngoại cho nó trước khi mọi giá trị trong cột
   trỏ vào một dòng có thật sẽ bị Postgres từ chối.

   Số đã đo trên chính Neon trước khi chạy: 125 lead → 124 công ty (đúng một
   cặp trùng), 0 đơn mồ côi lead, chưa có mã `LR-` nào trong `config_entry`.
   Dãy mã bắt đầu ở 201 nên lô này nhận `AC-0201`…`AC-0324`, không đụng
   `AC-0142` mà kịch bản DAS Vina đã seed.

   Sinh lại file này bằng `pnpm db:generate` thì phải chép lại khối này vào —
   cùng khoản nợ mà `config_ord_uniq` (DEFERRABLE) đã ghi ở `config.schema.ts`.

   Không có `DROP` nào ở đây trừ đúng một bảng TẠM do chính khối này dựng lên ba
   câu trước đó: luật vận hành cấm `DROP` vì nó nói về dữ liệu nghiệp vụ, và một
   bảng tạm sống được ba câu lệnh thì không phải thứ đó.
   ========================================================================== */
CREATE TEMP TABLE "_account_backfill" AS
SELECT
  'AC-' || lpad(nextval('sales.account_code_seq')::text, 4, '0') AS code,
  x.identity, x.company, x.legal_name, x.tax_code, x.address, x.province,
  x.category, x.headcount, x.plants
FROM (
  /* MỘT dòng cho mỗi công ty, chọn theo ĐÚNG luật mà `account_identity_uniq`
     ép: mã số thuế nếu có, không thì tên viết thường. `DISTINCT ON` giữ lại
     lead VÀO SỔ SỚM NHẤT của mỗi công ty — bản khai đầu tiên thường là bản có
     người ngồi điền, còn bản sau là bản import vội. */
  SELECT DISTINCT ON (coalesce(nullif(btrim(tax_code), ''), lower(btrim(company))))
         coalesce(nullif(btrim(tax_code), ''), lower(btrim(company))) AS identity,
         company, legal_name, tax_code, address, province, category, headcount, plants
  FROM sales.lead
  ORDER BY 1, created_at, code
) x;--> statement-breakpoint
/* Dòng gương TRƯỚC dòng nghiệp vụ — `account.code` khoá ngoại về
   `platform.object(code)`, đúng thứ tự mà `AccountService.create` giữ. */
INSERT INTO platform.object (code, kind, branch, label, state)
SELECT code, 'AC', 'Sales', company, 'tiềm năng' FROM "_account_backfill";--> statement-breakpoint
INSERT INTO sales.account
  (code, name, legal_name, tax_code, address, province, category, headcount, plants)
SELECT code, company, legal_name, tax_code, address, province, category, headcount, plants
FROM "_account_backfill";--> statement-breakpoint
UPDATE sales.lead l
   SET account_code = b.code
  FROM "_account_backfill" b
 WHERE b.identity = coalesce(nullif(btrim(l.tax_code), ''), lower(btrim(l.company)));--> statement-breakpoint
/* Đơn lấy công ty của LEAD nó mọc ra, ghi đè bất cứ thứ gì đang nằm trong cột.
   Ghi đè là đúng chứ không phải mất dữ liệu: cột này chưa từng có cửa nào ghi
   vào (`OpportunityCreate.accountCode` luôn vắng vì lead chưa có công ty), và
   kể từ đây nó là BẢN SAO của `lead.account_code` chứ không phải ý kiến thứ
   hai — xem `AccountRepository.syncDealsOfLead`. */
UPDATE sales.opportunity o
   SET account_code = l.account_code
  FROM sales.lead l
 WHERE l.code = o.lead_code;--> statement-breakpoint
DROP TABLE "_account_backfill";--> statement-breakpoint
/* Bảy lý do THUA ĐƠN, chuyển từ hằng số trong `fixtures/das-vina.ts` thành
   hàng của `config_entry` — đúng việc mà bảng đó sinh ra: từ vựng nghiệp vụ
   thôi là code, thành dữ liệu người nhập.

   `name` giữ NGUYÊN VĂN bảy chuỗi đang có, không sửa một dấu: cột
   `sales.opportunity.lost_reason` sẽ chứa chính những chuỗi này, và phép đếm
   `usage.LOSS_REASON` nối hai bên bằng `lower(name)`. Đổi một chữ ở đây là một
   danh mục có 0 lượt dùng đứng cạnh một lý do thật không ai đếm được.

   Danh mục `PRODUCT` cố tình KHÔNG được seed. Bảy lý do trên là từ vựng đã
   chốt của phòng; còn công ty bán gì thì không dòng nào trong cơ sở dữ liệu
   nói ra, và bịa ra một danh sách sản phẩm là bịa dữ liệu nghiệp vụ. Phòng
   kinh doanh tự nhập ở màn `/sales/config`. */
INSERT INTO sales.config_entry (id, list, name, ord, active) VALUES
  ('LR-01', 'LOSS_REASON', 'Giá cao hơn đối thủ', 1, true),
  ('LR-02', 'LOSS_REASON', 'Khách chọn đối thủ khác', 2, true),
  ('LR-03', 'LOSS_REASON', 'Không đủ ngân sách năm nay', 3, true),
  ('LR-04', 'LOSS_REASON', 'Dự án hoãn vô thời hạn', 4, true),
  ('LR-05', 'LOSS_REASON', 'Thiếu tính năng khách cần', 5, true),
  ('LR-06', 'LOSS_REASON', 'Thời gian triển khai không kịp', 6, true),
  ('LR-07', 'LOSS_REASON', 'Mất người ủng hộ bên trong', 7, true);--> statement-breakpoint
ALTER TABLE "sales"."lead" ADD CONSTRAINT "lead_account_code_account_code_fk" FOREIGN KEY ("account_code") REFERENCES "sales"."account"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."opportunity" ADD CONSTRAINT "opportunity_account_code_account_code_fk" FOREIGN KEY ("account_code") REFERENCES "sales"."account"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."opportunity" ADD CONSTRAINT "opportunity_probability_range" CHECK ("probability" BETWEEN 0 AND 100);
