CREATE TABLE "platform"."email_delivery" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_key" text NOT NULL,
	"event_type" text NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"template" text NOT NULL,
	"template_version" integer NOT NULL,
	"recipient" text NOT NULL,
	"state" text NOT NULL,
	"provider" text DEFAULT 'resend' NOT NULL,
	"provider_email_id" text,
	"idempotency_key" text NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"last_error_code" text,
	"last_error_summary" text,
	"accepted_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"campaign_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_delivery_event_key_unique" UNIQUE("event_key"),
	CONSTRAINT "email_delivery_provider_email_id_unique" UNIQUE("provider_email_id"),
	CONSTRAINT "email_delivery_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "email_delivery_state_valid" CHECK ("platform"."email_delivery"."state" IN ('pending', 'sending', 'accepted', 'delayed', 'delivered', 'bounced', 'complained', 'suppressed', 'failed_permanent', 'dead'))
);
--> statement-breakpoint
CREATE TABLE "platform"."email_suppression" (
	"recipient" text PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "platform"."email_webhook_event" (
	"svix_id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"email_id" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "email_delivery_state_idx" ON "platform"."email_delivery" USING btree ("state");--> statement-breakpoint
CREATE INDEX "email_delivery_next_attempt_idx" ON "platform"."email_delivery" USING btree ("next_attempt_at");--> statement-breakpoint
CREATE INDEX "email_delivery_aggregate_idx" ON "platform"."email_delivery" USING btree ("aggregate_id");--> statement-breakpoint
CREATE INDEX "email_delivery_recipient_idx" ON "platform"."email_delivery" USING btree ("recipient");