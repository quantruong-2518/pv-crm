CREATE TABLE "sales"."config_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"list" text NOT NULL,
	"name" text NOT NULL,
	"ord" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"limit_days" integer,
	"owner_id" text,
	"kind" text,
	CONSTRAINT "config_id_list" UNIQUE("id","list"),
	-- VÁ TAY, KHÔNG PHẢI DO drizzle-kit SINH RA. Giữ nguyên khi sinh lại file này.
	-- `DEFERRABLE INITIALLY DEFERRED` là điều kiện để kéo thả đổi thứ tự chạy
	-- được: một hoán vị là nhiều UPDATE trong một transaction, và giữa chừng
	-- chắc chắn có hai dòng cùng `ord`. Kiểm ngay thì thao tác hợp lệ nhất của
	-- màn Cấu hình luôn hỏng; hoãn tới COMMIT thì Postgres chỉ nhìn trạng thái
	-- cuối. drizzle-orm 0.38 không có chỗ nào khai từ khoá này, nên nó phải nằm
	-- ở đây — xem ghi chú dài ở `config.schema.ts`, mục `config_ord_uniq`.
	CONSTRAINT "config_ord_uniq" UNIQUE("list","ord") DEFERRABLE INITIALLY DEFERRED,
	CONSTRAINT "config_name_not_blank" CHECK ("name" <> ''),
	CONSTRAINT "config_limit_only_stage" CHECK (("list" = 'STAGE') = ("limit_days" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "sales"."config_entry" ADD CONSTRAINT "config_entry_owner_id_actor_id_fk" FOREIGN KEY ("owner_id") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "config_name_live" ON "sales"."config_entry" USING btree ("list",lower("name")) WHERE "active";