CREATE TABLE "sales"."lead_intake" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lead_code" text,
	"status" text NOT NULL,
	"landing_page" text NOT NULL,
	"ip_hash" text NOT NULL,
	"origin" text,
	"referrer" text,
	"user_agent" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"utm_content" text,
	"utm_term" text,
	CONSTRAINT "lead_intake_status_valid" CHECK ("sales"."lead_intake"."status" IN ('accepted', 'duplicate', 'honeypot'))
);
--> statement-breakpoint
CREATE TABLE "sales"."lead_intake_rate" (
	"key_hash" text PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"minute_started_at" timestamp with time zone NOT NULL,
	"minute_count" integer NOT NULL,
	"day_started_at" timestamp with time zone NOT NULL,
	"day_count" integer NOT NULL,
	"blocked_until" timestamp with time zone,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "lead_intake_rate_counts_positive" CHECK ("sales"."lead_intake_rate"."minute_count" > 0 AND "sales"."lead_intake_rate"."day_count" > 0)
);
--> statement-breakpoint
ALTER TABLE "sales"."lead_intake" ADD CONSTRAINT "lead_intake_lead_code_lead_code_fk" FOREIGN KEY ("lead_code") REFERENCES "sales"."lead"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_intake_received_idx" ON "sales"."lead_intake" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "lead_intake_lead_idx" ON "sales"."lead_intake" USING btree ("lead_code");--> statement-breakpoint
CREATE INDEX "lead_intake_page_idx" ON "sales"."lead_intake" USING btree ("landing_page");--> statement-breakpoint
CREATE INDEX "lead_intake_rate_updated_idx" ON "sales"."lead_intake_rate" USING btree ("updated_at");