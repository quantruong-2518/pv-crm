-- 0065 - group letters, the run copy, the wave release gate, template doors.
--
-- Additive or widening only: every column has a default that describes what
-- the rows on disk already are (a bulk run, a recipient letter, a template
-- serving the three pre-G4 doors), so no row is rewritten and old code keeps
-- writing valid rows until it is deployed away.
--
-- Every enum CHECK is copied by hand from `@pv/contracts` / `mail.contract.ts`:
-- the day one grows, that has to be a migration a person reads.
--
-- Hand-written for 0047-0064's reason: `generate`'s baseline is stuck at 0026.
ALTER TABLE "platform"."mail_run" ADD COLUMN "kind" text DEFAULT 'bulk' NOT NULL;--> statement-breakpoint
ALTER TABLE "platform"."mail_run" ADD COLUMN "bcc_copy_to" text;--> statement-breakpoint
ALTER TABLE "platform"."mail_run" ADD COLUMN "awaits_release" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "platform"."mail_run" ADD COLUMN "released_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "platform"."mail_run" ADD CONSTRAINT "mail_run_kind_known" CHECK ("kind" IN ('bulk', 'group'));--> statement-breakpoint
ALTER TABLE "platform"."mail_run" ADD CONSTRAINT "mail_run_bcc_copy_known" CHECK ("bcc_copy_to" IS NULL OR "bcc_copy_to" = 'sales@pebblevina.com');--> statement-breakpoint
ALTER TABLE "platform"."mail_run" ADD CONSTRAINT "mail_run_release_pair" CHECK ("released_at" IS NULL OR "awaits_release");--> statement-breakpoint
ALTER TABLE "platform"."mail_run" ADD CONSTRAINT "mail_run_group_plain" CHECK ("kind" = 'bulk' OR ("bcc_copy_to" IS NULL AND NOT "awaits_release"));--> statement-breakpoint
CREATE INDEX "mail_run_gate_due_idx" ON "platform"."mail_run" USING btree ("scheduled_at") WHERE "awaits_release" AND "released_at" IS NULL;--> statement-breakpoint

ALTER TABLE "platform"."email_delivery" ADD COLUMN "role" text DEFAULT 'recipient' NOT NULL;--> statement-breakpoint
ALTER TABLE "platform"."email_delivery" ADD CONSTRAINT "email_delivery_role_known" CHECK ("role" IN ('recipient', 'run_copy'));--> statement-breakpoint
ALTER TABLE "platform"."email_delivery" ADD CONSTRAINT "email_delivery_copy_has_run" CHECK ("role" = 'recipient' OR "mail_run_id" IS NOT NULL);--> statement-breakpoint
CREATE UNIQUE INDEX "email_delivery_run_copy_once" ON "platform"."email_delivery" USING btree ("mail_run_id") WHERE "role" = 'run_copy';--> statement-breakpoint
ALTER TABLE "platform"."email_delivery" DROP CONSTRAINT "email_delivery_state_valid";--> statement-breakpoint
ALTER TABLE "platform"."email_delivery" ADD CONSTRAINT "email_delivery_state_valid" CHECK ("state" IN ('pending', 'sending', 'accepted', 'delayed', 'delivered', 'bounced', 'complained', 'suppressed', 'failed_permanent', 'dead', 'withheld'));--> statement-breakpoint

CREATE TABLE "platform"."email_delivery_address" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_id" uuid NOT NULL,
	"role" text NOT NULL,
	"position" integer NOT NULL,
	"address" text NOT NULL,
	"display_name" text,
	"ref" text,
	"outcome" text DEFAULT 'queued' NOT NULL,
	"outcome_reason" text,
	"outcome_at" timestamp with time zone,
	CONSTRAINT "email_delivery_address_once" UNIQUE("delivery_id", "address"),
	CONSTRAINT "email_delivery_address_role_known" CHECK ("role" IN ('to', 'cc')),
	CONSTRAINT "email_delivery_address_position_nonneg" CHECK ("position" >= 0),
	CONSTRAINT "email_delivery_address_normal" CHECK ("address" = lower(btrim("address")) AND "address" <> ''),
	CONSTRAINT "email_delivery_address_outcome_known" CHECK ("outcome" IN ('queued', 'dropped_suppressed', 'bounced', 'complained')),
	CONSTRAINT "email_delivery_address_reason_bounded" CHECK (char_length("outcome_reason") <= 500)
);--> statement-breakpoint
ALTER TABLE "platform"."email_delivery_address" ADD CONSTRAINT "email_delivery_address_delivery_id_email_delivery_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "platform"."email_delivery"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_delivery_address_address_idx" ON "platform"."email_delivery_address" USING btree ("address");--> statement-breakpoint

ALTER TABLE "sales"."mail_template" ADD COLUMN "doors" text[] DEFAULT ARRAY['lead', 'opportunity', 'campaign']::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "sales"."mail_template" ADD CONSTRAINT "mail_template_doors_known" CHECK ("doors" <@ ARRAY['lead', 'opportunity', 'quote', 'contract', 'campaign']::text[] AND cardinality("doors") >= 1);--> statement-breakpoint

CREATE TABLE "sales"."mail_template_default" (
	"door" text PRIMARY KEY NOT NULL,
	"template_code" text NOT NULL,
	"set_by" text NOT NULL,
	"set_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mail_template_default_door_known" CHECK ("door" IN ('lead', 'opportunity', 'quote', 'contract', 'campaign'))
);--> statement-breakpoint
ALTER TABLE "sales"."mail_template_default" ADD CONSTRAINT "mail_template_default_template_code_mail_template_code_fk" FOREIGN KEY ("template_code") REFERENCES "sales"."mail_template"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."mail_template_default" ADD CONSTRAINT "mail_template_default_set_by_actor_id_fk" FOREIGN KEY ("set_by") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mail_template_default_template_idx" ON "sales"."mail_template_default" USING btree ("template_code");
