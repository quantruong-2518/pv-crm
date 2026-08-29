CREATE SEQUENCE "sales"."contact_code_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 2001 CACHE 1;--> statement-breakpoint
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
--> statement-breakpoint
ALTER TABLE "sales"."contact" ADD CONSTRAINT "contact_code_object_code_fk" FOREIGN KEY ("code") REFERENCES "platform"."object"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."contact" ADD CONSTRAINT "contact_lead_code_lead_code_fk" FOREIGN KEY ("lead_code") REFERENCES "sales"."lead"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."contact" ADD CONSTRAINT "contact_created_by_actor_id_fk" FOREIGN KEY ("created_by") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contact_lead_idx" ON "sales"."contact" USING btree ("lead_code");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_primary_idx" ON "sales"."contact" USING btree ("lead_code") WHERE "is_primary";--> statement-breakpoint
CREATE INDEX "contact_email_idx" ON "sales"."contact" USING btree (lower("email"));--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- BACKFILL — mỗi lead đang có sinh đúng MỘT contact, và nó là primary
-- ---------------------------------------------------------------------------
-- Viết tay, không do drizzle-kit sinh. Không có nó thì bảng ra đời rỗng trong
-- khi 5 cột trên `sales.lead` vẫn giữ toàn bộ dữ liệu thật — tức bảng mới là
-- một cái vỏ, và mọi màn đọc nó sẽ thấy trống ở đúng chỗ hôm qua có người.
--
-- MÃ SINH BẰNG `row_number()`, KHÔNG BẰNG `nextval`
-- Hai câu INSERT dưới đây phải cho ra CÙNG một mã cho cùng một lead: câu đầu
-- ghi dòng gương `platform.object`, câu sau ghi dòng nghiệp vụ có FK trỏ vào
-- đó. `nextval` thì hai câu ra hai dãy số khác nhau và câu thứ hai chết vì vi
-- phạm khoá ngoại. `row_number() OVER (ORDER BY code)` là tất định trên cùng
-- một ảnh chụp giao dịch, nên hai câu khớp nhau mà không cần bảng tạm — và
-- không cần bảng tạm nghĩa là file này không chứa `DROP`, đúng luật vận hành
-- đang chạy cho `db:migrate`.
--
-- Dải `CT-1001…` chừa chỗ cho `CT-0391` mà kịch bản đóng băng đã đặt sẵn vào
-- `platform.object`, và `contact_code_seq` bắt đầu từ 2001 nên contact GHI MỚI
-- không bao giờ đụng dải backfill này.
--
-- Lead ĐÃ RƠI cũng được một dòng. Người liên hệ là một sự thật lịch sử; bỏ họ
-- lại thì `platform.email_suppression` — vốn khoá theo địa chỉ — có thể đang
-- chặn một hộp thư mà không sổ nào còn trả lời được "của ai".
INSERT INTO "platform"."object" ("code", "kind", "branch", "label")
SELECT
	'CT-' || lpad((1000 + row_number() OVER (ORDER BY l."code"))::text, 4, '0'),
	'CT',
	'Sales',
	l."contact_name"
FROM "sales"."lead" l;--> statement-breakpoint

INSERT INTO "sales"."contact" (
	"code", "lead_code", "name", "title", "email", "phone", "channel",
	"is_primary", "by", "created_at", "updated_at"
)
SELECT
	'CT-' || lpad((1000 + row_number() OVER (ORDER BY l."code"))::text, 4, '0'),
	l."code",
	l."contact_name",
	l."contact_title",
	l."email",
	l."phone",
	l."contact_channel",
	true,
	'backfill 0018',
	l."created_at",
	l."created_at"
FROM "sales"."lead" l;
