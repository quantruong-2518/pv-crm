CREATE SEQUENCE "sales"."contract_code_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 5001 CACHE 1;--> statement-breakpoint
CREATE TABLE "sales"."touch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"subject_code" text NOT NULL,
	"subject_kind" text NOT NULL,
	"kind" text NOT NULL,
	"to_tier" text,
	"actor_id" text,
	"by" text NOT NULL,
	"note" text NOT NULL,
	CONSTRAINT "touch_subject_kind_known" CHECK ("subject_kind" IN ('lead', 'opportunity')),
	CONSTRAINT "touch_kind_known" CHECK ("kind" IN ('vao-so', 'cham', 'dien-o', 'giao', 'len-bac', 'gap-lan-dau',
                     'vao-pipeline', 'doi-cot', 'ky', 'ra-khoi-luong')),
	CONSTRAINT "touch_to_tier_known" CHECK ("to_tier" IS NULL OR "to_tier" IN ('dau-moi', 'mql', 'sql')),
	CONSTRAINT "touch_len_bac_co_bac" CHECK ("kind" <> 'len-bac' OR "to_tier" IS NOT NULL),
	CONSTRAINT "touch_no_blank" CHECK ("by" <> '' AND "note" <> '' AND "subject_code" <> '')
);
--> statement-breakpoint
ALTER TABLE "sales"."touch" ADD CONSTRAINT "touch_actor_id_actor_id_fk" FOREIGN KEY ("actor_id") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "touch_subject_idx" ON "sales"."touch" USING btree ("subject_code","at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "touch_actor_idx" ON "sales"."touch" USING btree ("actor_id");