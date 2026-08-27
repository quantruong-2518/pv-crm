CREATE TABLE "platform"."mail_gate" (
	"key" text PRIMARY KEY NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"window_count" integer NOT NULL,
	"parked_until" timestamp with time zone,
	"parked_reason" text,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "mail_gate_count_positive" CHECK ("platform"."mail_gate"."window_count" > 0)
);
--> statement-breakpoint
CREATE INDEX "mail_gate_parked_idx" ON "platform"."mail_gate" USING btree ("parked_until");