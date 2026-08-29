CREATE SEQUENCE "sales"."quote_code_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 5001 CACHE 1;--> statement-breakpoint
CREATE TABLE "sales"."quote" (
	"code" text PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"opportunity_code" text NOT NULL,
	"lead_code" text NOT NULL,
	"status" text NOT NULL,
	"sent_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"valid_until" date NOT NULL,
	"currency" text NOT NULL,
	"subtotal" bigint NOT NULL,
	"discount_total" bigint NOT NULL,
	"vat_total" bigint NOT NULL,
	"total" bigint NOT NULL,
	"title" text NOT NULL,
	"note" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quote_opportunity_version_key" UNIQUE("opportunity_code","version"),
	CONSTRAINT "quote_code_status_key" UNIQUE("code","status"),
	CONSTRAINT "quote_status_known" CHECK ("status" IN ('nhap', 'da-gui', 'khach-chot', 'khach-tu-choi', 'thay-the')),
	CONSTRAINT "quote_sent_pair" CHECK (("sent_at" IS NULL) = ("status" = 'nhap'))
);
--> statement-breakpoint
CREATE TABLE "sales"."quote_line" (
	"quote_code" text NOT NULL,
	"line_no" integer NOT NULL,
	"description" text NOT NULL,
	"unit" text,
	"qty" numeric(12, 2) NOT NULL,
	"unit_price" bigint NOT NULL,
	"discount_pct" numeric(5, 2) NOT NULL,
	"vat_pct" numeric(5, 2) NOT NULL,
	"line_total" bigint GENERATED ALWAYS AS (round(round("qty" * "unit_price" * (1 - "discount_pct" / 100)) * (1 + "vat_pct" / 100))) STORED NOT NULL,
	CONSTRAINT "quote_line_pk" PRIMARY KEY("quote_code","line_no"),
	CONSTRAINT "quote_line_qty_positive" CHECK ("qty" > 0),
	CONSTRAINT "quote_line_price_nonneg" CHECK ("unit_price" >= 0),
	CONSTRAINT "quote_line_pct_range" CHECK ("discount_pct" BETWEEN 0 AND 100 AND "vat_pct" BETWEEN 0 AND 100)
);
--> statement-breakpoint
ALTER TABLE "sales"."quote" ADD CONSTRAINT "quote_created_by_actor_id_fk" FOREIGN KEY ("created_by") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."quote" ADD CONSTRAINT "quote_opportunity_fk" FOREIGN KEY ("opportunity_code","lead_code") REFERENCES "sales"."opportunity"("code","lead_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."quote_line" ADD CONSTRAINT "quote_line_quote_code_quote_code_fk" FOREIGN KEY ("quote_code") REFERENCES "sales"."quote"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "quote_one_accepted_idx" ON "sales"."quote" USING btree ("opportunity_code") WHERE "status" = 'khach-chot';--> statement-breakpoint
CREATE INDEX "quote_opportunity_idx" ON "sales"."quote" USING btree ("opportunity_code");