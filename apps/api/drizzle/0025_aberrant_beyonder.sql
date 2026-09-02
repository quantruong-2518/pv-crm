CREATE TABLE "sales"."contract_condition" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_code" text NOT NULL,
	"installment_no" integer NOT NULL,
	"side" text NOT NULL,
	"what" text NOT NULL,
	"due" timestamp with time zone NOT NULL,
	"done_at" timestamp with time zone,
	"who" text NOT NULL,
	CONSTRAINT "contract_condition_side_known" CHECK ("side" IN ('ta', 'khách'))
);
--> statement-breakpoint
CREATE TABLE "sales"."contract_document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_code" text NOT NULL,
	"installment_no" integer NOT NULL,
	"name" text NOT NULL,
	"state" text NOT NULL,
	"hint" text NOT NULL,
	CONSTRAINT "contract_document_state_known" CHECK ("state" IN ('đủ', 'chờ-ký', 'chưa-có'))
);
--> statement-breakpoint
CREATE TABLE "sales"."contract_installment" (
	"contract_code" text NOT NULL,
	"no" integer NOT NULL,
	"label" text NOT NULL,
	"share" integer NOT NULL,
	"amount" bigint NOT NULL,
	"due" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	CONSTRAINT "contract_installment_pk" PRIMARY KEY("contract_code","no"),
	CONSTRAINT "contract_installment_no_positive" CHECK ("no" > 0),
	CONSTRAINT "contract_installment_share_range" CHECK ("share" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE TABLE "sales"."contract_note" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_code" text NOT NULL,
	"installment_no" integer NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"who" text NOT NULL,
	"text" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales"."contract_record" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_code" text NOT NULL,
	"installment_no" integer NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"channel" text NOT NULL,
	"what" text NOT NULL,
	"detail" text NOT NULL,
	"state" text NOT NULL,
	CONSTRAINT "contract_record_channel_known" CHECK ("channel" IN ('email', 'zalo-oa', 'trong-app', 'gọi')),
	CONSTRAINT "contract_record_state_known" CHECK ("state" IN ('xong', 'chờ-trả-lời', 'đã-xếp', 'chưa-tới'))
);
--> statement-breakpoint
ALTER TABLE "sales"."contract_condition" ADD CONSTRAINT "contract_condition_installment_fk" FOREIGN KEY ("contract_code","installment_no") REFERENCES "sales"."contract_installment"("contract_code","no") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."contract_document" ADD CONSTRAINT "contract_document_installment_fk" FOREIGN KEY ("contract_code","installment_no") REFERENCES "sales"."contract_installment"("contract_code","no") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."contract_installment" ADD CONSTRAINT "contract_installment_contract_code_contract_code_fk" FOREIGN KEY ("contract_code") REFERENCES "sales"."contract"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."contract_note" ADD CONSTRAINT "contract_note_installment_fk" FOREIGN KEY ("contract_code","installment_no") REFERENCES "sales"."contract_installment"("contract_code","no") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."contract_record" ADD CONSTRAINT "contract_record_installment_fk" FOREIGN KEY ("contract_code","installment_no") REFERENCES "sales"."contract_installment"("contract_code","no") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contract_condition_installment_idx" ON "sales"."contract_condition" USING btree ("contract_code","installment_no");--> statement-breakpoint
CREATE INDEX "contract_document_installment_idx" ON "sales"."contract_document" USING btree ("contract_code","installment_no");--> statement-breakpoint
CREATE INDEX "contract_note_installment_idx" ON "sales"."contract_note" USING btree ("contract_code","installment_no","at");--> statement-breakpoint
CREATE INDEX "contract_record_installment_idx" ON "sales"."contract_record" USING btree ("contract_code","installment_no","at");