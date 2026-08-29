CREATE TABLE "sales"."meeting" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_code" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"title" text NOT NULL,
	"link" text,
	"transcript" text,
	"by" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meeting_no_blank" CHECK ("title" <> '' AND "by" <> '' AND "lead_code" <> ''),
	CONSTRAINT "meeting_link_la_web" CHECK ("link" IS NULL OR "link" ~ '^https?://')
);
--> statement-breakpoint
CREATE TABLE "sales"."meeting_attendee" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"side" text NOT NULL,
	"actor_id" text,
	"name" text NOT NULL,
	"role" text,
	CONSTRAINT "meeting_attendee_side_known" CHECK ("side" IN ('host', 'guest')),
	CONSTRAINT "meeting_attendee_host_co_actor" CHECK ("side" <> 'host' OR "actor_id" IS NOT NULL),
	CONSTRAINT "meeting_attendee_no_blank" CHECK ("name" <> '')
);
--> statement-breakpoint
ALTER TABLE "sales"."meeting" ADD CONSTRAINT "meeting_lead_code_lead_code_fk" FOREIGN KEY ("lead_code") REFERENCES "sales"."lead"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."meeting" ADD CONSTRAINT "meeting_created_by_actor_id_fk" FOREIGN KEY ("created_by") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."meeting_attendee" ADD CONSTRAINT "meeting_attendee_meeting_id_meeting_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "sales"."meeting"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."meeting_attendee" ADD CONSTRAINT "meeting_attendee_actor_id_actor_id_fk" FOREIGN KEY ("actor_id") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meeting_lead_idx" ON "sales"."meeting" USING btree ("lead_code","at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "meeting_attendee_meeting_idx" ON "sales"."meeting_attendee" USING btree ("meeting_id");