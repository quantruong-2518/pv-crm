-- Bồi cột cho sổ cơ hội, để cửa `POST /sales/ops` chở đủ 14 ô của phiếu đổi.
--
-- SỬA TAY sau khi drizzle-kit sinh, và đây là ba chỗ đã sửa:
--
--  1. `state` và `name` sinh ra dạng `ADD COLUMN ... NOT NULL`, câu đó VỠ trên
--     một bảng đã có dòng — Postgres không biết điền gì vào các dòng cũ. Tách
--     làm ba bước: thêm cột trống, nạp lại từ dữ liệu đã có, rồi mới khoá.
--  2. Hai CHECK dời xuống SAU phần nạp. Khai trước thì chúng kiểm những dòng
--     còn đang trống và migration chết ngay câu đầu.
--  3. Thêm phần chuyển `owner_id` sang bảng nối. Cột bị bỏ ở migration kế
--     tiếp; chuyển dữ liệu phải xong TRƯỚC lúc đó, không phải sau.
--
-- Không có bước nào bịa dữ liệu: `state` suy từ `stage`/`lost_reason` đã có,
-- `name` lấy tên khách từ chính lead sinh ra đơn.

CREATE SEQUENCE "sales"."opportunity_code_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 5001 CACHE 1;--> statement-breakpoint
CREATE TABLE "sales"."opportunity_owner" (
	"opportunity_code" text NOT NULL,
	"actor_id" text NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "opportunity_owner_pk" PRIMARY KEY("opportunity_code","actor_id","role"),
	CONSTRAINT "opportunity_owner_role_known" CHECK ("role" IN ('SALE', 'BD'))
);
--> statement-breakpoint
ALTER TABLE "sales"."opportunity_owner" ADD CONSTRAINT "opportunity_owner_opportunity_code_opportunity_code_fk" FOREIGN KEY ("opportunity_code") REFERENCES "sales"."opportunity"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."opportunity_owner" ADD CONSTRAINT "opportunity_owner_actor_id_actor_id_fk" FOREIGN KEY ("actor_id") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "opportunity_owner_actor_idx" ON "sales"."opportunity_owner" USING btree ("actor_id");--> statement-breakpoint

-- Người giữ đơn cũ → vai SALE trên bảng nối. Chỉ dựng được vai này: cột cũ chở
-- đúng một người và không nói người đó chốt hay mở cửa, mà mặc định của một
-- cột tên `owner_id` trên sổ cơ hội là người chốt.
INSERT INTO "sales"."opportunity_owner" ("opportunity_code", "actor_id", "role")
SELECT "code", "owner_id", 'SALE' FROM "sales"."opportunity" WHERE "owner_id" IS NOT NULL
ON CONFLICT DO NOTHING;--> statement-breakpoint

DROP INDEX "sales"."opportunity_owner_idx";--> statement-breakpoint
ALTER TABLE "sales"."opportunity" ADD COLUMN "state" text;--> statement-breakpoint
ALTER TABLE "sales"."opportunity" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "sales"."opportunity" ADD COLUMN "account_code" text;--> statement-breakpoint
ALTER TABLE "sales"."opportunity" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "sales"."opportunity" ADD COLUMN "attachments" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "sales"."opportunity" ADD COLUMN "lost_note" text;--> statement-breakpoint

-- `state` suy ngược từ cột đơn đang đứng. Chiều này KHÔNG phải hàm nói chung
-- ('moi' · 'tim-hieu' · 'da-demo' đều về 'pending'), nên nó chỉ đúng ở đây —
-- một lần, trên dữ liệu đã đóng băng. Từ nay `state` là thứ được ghi, `stage`
-- đi theo nó lúc tạo rồi rời ra được khi ai đó kéo đơn sang cột khác.
UPDATE "sales"."opportunity" SET "state" = CASE
    WHEN "lost_reason" IS NOT NULL   THEN 'close-lost'
    WHEN "stage" = 'da-bao-gia'      THEN 'gui-quotation'
    WHEN "stage" = 'cho-ky'          THEN 'nego'
    WHEN "stage" IS NULL             THEN 'nego'
    ELSE                                  'pending'
  END
WHERE "state" IS NULL;--> statement-breakpoint

-- Tên đơn = tên khách của lead sinh ra nó. `lead_code` là NOT NULL và có khoá
-- ngoại, nên không dòng nào trượt khỏi phép nối này.
UPDATE "sales"."opportunity" o SET "name" = l."company"
  FROM "sales"."lead" l WHERE l."code" = o."lead_code" AND o."name" IS NULL;--> statement-breakpoint

ALTER TABLE "sales"."opportunity" ALTER COLUMN "state" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sales"."opportunity" ALTER COLUMN "name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sales"."opportunity" ADD CONSTRAINT "opportunity_lost_state_closed" CHECK ("state" <> 'close-lost' OR "closed_at" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "sales"."opportunity" ADD CONSTRAINT "opportunity_state_known" CHECK ("state" IN ('gui-quotation', 'nego', 'close-lost', 'pending'));
