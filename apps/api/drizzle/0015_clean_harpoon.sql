CREATE TABLE "sales"."source_cost" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" text NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"amount" bigint NOT NULL,
	"spent_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_cost_kind_valid" CHECK ("sales"."source_cost"."kind" IN ('DATA','CHANNEL','CONTENT','EVENT','TOOL')),
	CONSTRAINT "source_cost_amount_nonneg" CHECK ("sales"."source_cost"."amount" >= 0),
	CONSTRAINT "source_cost_label_not_blank" CHECK ("sales"."source_cost"."label" <> '')
);
--> statement-breakpoint
CREATE TABLE "sales"."source_event" (
	"source_id" text PRIMARY KEY NOT NULL,
	"venue" text,
	"registered" integer,
	"checked_in" integer,
	"held_on" date,
	CONSTRAINT "source_event_registered_nonneg" CHECK ("sales"."source_event"."registered" IS NULL OR "sales"."source_event"."registered" >= 0),
	CONSTRAINT "source_event_checked_in_nonneg" CHECK ("sales"."source_event"."checked_in" IS NULL OR "sales"."source_event"."checked_in" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sales"."source_follower" (
	"source_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_follower_source_id_actor_id_pk" PRIMARY KEY("source_id","actor_id")
);
--> statement-breakpoint
ALTER TABLE "sales"."campaign" ADD COLUMN "source_id" text;--> statement-breakpoint
ALTER TABLE "sales"."campaign_run" ADD COLUMN "expected" integer;--> statement-breakpoint
ALTER TABLE "sales"."source_cost" ADD CONSTRAINT "source_cost_source_id_config_entry_id_fk" FOREIGN KEY ("source_id") REFERENCES "sales"."config_entry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."source_event" ADD CONSTRAINT "source_event_source_id_config_entry_id_fk" FOREIGN KEY ("source_id") REFERENCES "sales"."config_entry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."source_follower" ADD CONSTRAINT "source_follower_source_id_config_entry_id_fk" FOREIGN KEY ("source_id") REFERENCES "sales"."config_entry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."source_follower" ADD CONSTRAINT "source_follower_actor_id_actor_id_fk" FOREIGN KEY ("actor_id") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "source_cost_source_idx" ON "sales"."source_cost" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "source_cost_spent_idx" ON "sales"."source_cost" USING btree ("spent_on");--> statement-breakpoint
CREATE INDEX "source_follower_actor_idx" ON "sales"."source_follower" USING btree ("actor_id");--> statement-breakpoint
ALTER TABLE "sales"."campaign" ADD CONSTRAINT "campaign_source_id_config_entry_id_fk" FOREIGN KEY ("source_id") REFERENCES "sales"."config_entry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."campaign_run" ADD CONSTRAINT "campaign_run_expected_nonneg" CHECK ("sales"."campaign_run"."expected" IS NULL OR "sales"."campaign_run"."expected" >= 0);