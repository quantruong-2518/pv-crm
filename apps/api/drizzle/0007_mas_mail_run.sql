CREATE SEQUENCE "sales"."campaign_code_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "sales"."campaign" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"owner_id" text,
	"state" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_code_shape" CHECK ("sales"."campaign"."code" ~ '^CP-[0-9]{4}$'),
	CONSTRAINT "campaign_state_valid" CHECK ("sales"."campaign"."state" IN ('DRAFT', 'RUNNING', 'STOPPED', 'DONE')),
	CONSTRAINT "campaign_no_blank" CHECK ("name" <> '' AND "owner_id" <> '')
);
--> statement-breakpoint
CREATE TABLE "sales"."campaign_member" (
	"campaign_code" text NOT NULL,
	"lead_code" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"state" text DEFAULT 'ACTIVE' NOT NULL,
	CONSTRAINT "campaign_member_campaign_code_lead_code_pk" PRIMARY KEY("campaign_code","lead_code"),
	CONSTRAINT "campaign_member_state_valid" CHECK ("sales"."campaign_member"."state" IN ('ACTIVE', 'REMOVED'))
);
--> statement-breakpoint
CREATE TABLE "sales"."campaign_run" (
	"campaign_code" text NOT NULL,
	"mail_run_id" uuid NOT NULL,
	"wave_no" integer NOT NULL,
	CONSTRAINT "campaign_run_campaign_code_wave_no_pk" PRIMARY KEY("campaign_code","wave_no"),
	CONSTRAINT "campaign_run_mail_run_id_unique" UNIQUE("mail_run_id"),
	CONSTRAINT "campaign_run_wave_positive" CHECK ("sales"."campaign_run"."wave_no" > 0)
);
--> statement-breakpoint
CREATE TABLE "sales"."mail_template" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"cta_label" text,
	"cta_url" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mail_template_cta_pair" CHECK (("sales"."mail_template"."cta_label" IS NULL) = ("sales"."mail_template"."cta_url" IS NULL)),
	CONSTRAINT "mail_template_no_blank" CHECK ("name" <> '' AND "subject" <> '' AND "body" <> '' AND "cta_label" <> '' AND "cta_url" <> '')
);
--> statement-breakpoint
CREATE TABLE "platform"."mail_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"template_code" text,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"cta_label" text,
	"cta_url" text,
	"from_address" text NOT NULL,
	"reply_to" text,
	"state" text NOT NULL,
	"scheduled_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"audience_count" integer DEFAULT 0 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mail_run_state_valid" CHECK ("platform"."mail_run"."state" IN ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'CANCELLED')),
	CONSTRAINT "mail_run_cta_pair" CHECK (("platform"."mail_run"."cta_label" IS NULL) = ("platform"."mail_run"."cta_url" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "platform"."mail_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"url" text,
	"svix_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mail_event_once" UNIQUE("delivery_id","kind","at"),
	CONSTRAINT "mail_event_kind_valid" CHECK ("platform"."mail_event"."kind" IN ('OPEN', 'CLICK', 'UNSUBSCRIBE')),
	CONSTRAINT "mail_event_url_matches_kind" CHECK (("platform"."mail_event"."kind" = 'CLICK') = ("platform"."mail_event"."url" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "platform"."email_delivery" RENAME COLUMN "campaign_run_id" TO "mail_run_id";--> statement-breakpoint
ALTER TABLE "platform"."email_delivery" ADD COLUMN "merge" jsonb;--> statement-breakpoint
ALTER TABLE "sales"."campaign_member" ADD CONSTRAINT "campaign_member_campaign_code_campaign_code_fk" FOREIGN KEY ("campaign_code") REFERENCES "sales"."campaign"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."campaign_member" ADD CONSTRAINT "campaign_member_lead_code_lead_code_fk" FOREIGN KEY ("lead_code") REFERENCES "sales"."lead"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."campaign_run" ADD CONSTRAINT "campaign_run_campaign_code_campaign_code_fk" FOREIGN KEY ("campaign_code") REFERENCES "sales"."campaign"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."campaign_run" ADD CONSTRAINT "campaign_run_mail_run_id_mail_run_id_fk" FOREIGN KEY ("mail_run_id") REFERENCES "platform"."mail_run"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."mail_event" ADD CONSTRAINT "mail_event_delivery_id_email_delivery_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "platform"."email_delivery"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_owner_idx" ON "sales"."campaign" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "campaign_member_lead_idx" ON "sales"."campaign_member" USING btree ("lead_code");--> statement-breakpoint
CREATE INDEX "mail_run_due_idx" ON "platform"."mail_run" USING btree ("state","scheduled_at");--> statement-breakpoint
CREATE INDEX "mail_event_delivery_idx" ON "platform"."mail_event" USING btree ("delivery_id");--> statement-breakpoint
CREATE INDEX "mail_event_kind_idx" ON "platform"."mail_event" USING btree ("kind");--> statement-breakpoint
ALTER TABLE "platform"."email_delivery" ADD CONSTRAINT "email_delivery_mail_run_id_mail_run_id_fk" FOREIGN KEY ("mail_run_id") REFERENCES "platform"."mail_run"("id") ON DELETE no action ON UPDATE no action;