CREATE TABLE "platform"."mail_reply" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_id" uuid NOT NULL,
	"from_address" text NOT NULL,
	"subject" text,
	"received_at" timestamp with time zone NOT NULL,
	"provider_email_id" text NOT NULL,
	"svix_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mail_reply_provider_email_id_unique" UNIQUE("provider_email_id")
);
--> statement-breakpoint
ALTER TABLE "platform"."mail_reply" ADD CONSTRAINT "mail_reply_delivery_id_email_delivery_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "platform"."email_delivery"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mail_reply_delivery_idx" ON "platform"."mail_reply" USING btree ("delivery_id");