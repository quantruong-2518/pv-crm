CREATE SCHEMA "sales";
--> statement-breakpoint
CREATE SCHEMA "platform";
--> statement-breakpoint
CREATE TABLE "sales"."contract" (
	"code" text PRIMARY KEY NOT NULL,
	"opportunity_code" text NOT NULL,
	"lead_code" text NOT NULL,
	"amount" bigint,
	"currency" text,
	"signed_at" timestamp with time zone NOT NULL,
	"owner_id" text,
	CONSTRAINT "contract_money_pair" CHECK (("amount" IS NULL) = ("currency" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "sales"."lead" (
	"code" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"company" text NOT NULL,
	"legal_name" text,
	"tax_code" text,
	"address" text,
	"province" text,
	"category" text,
	"main_product" text,
	"headcount" integer,
	"plants" integer,
	"contact_name" text NOT NULL,
	"contact_title" text,
	"email" text NOT NULL,
	"phone" text,
	"contact_channel" text,
	"pain" text,
	"current_stack" text,
	"decision_maker" text,
	"approver" text,
	"budget" bigint,
	"currency" text,
	"deadline" date,
	"owner_id" text,
	"bd_owner_id" text,
	"marketing_owner_id" text,
	"tier" text,
	"stage" text,
	"stage_since" timestamp with time zone DEFAULT now() NOT NULL,
	"intake_channel" text,
	"source" text,
	"score" integer DEFAULT 0 NOT NULL,
	"last_touch_at" timestamp with time zone,
	"required_filled" smallint GENERATED ALWAYS AS (((
        ("legal_name" IS NOT NULL OR "tax_code" IS NOT NULL OR "address" IS NOT NULL)::int
      + ("main_product" IS NOT NULL)::int
      + ("headcount" IS NOT NULL OR "plants" IS NOT NULL)::int
      + ("contact_title" IS NOT NULL)::int
      + ("phone" IS NOT NULL OR "contact_channel" IS NOT NULL)::int
      + ("pain" IS NOT NULL)::int
      )::smallint)) STORED NOT NULL,
	"optional_filled" smallint GENERATED ALWAYS AS (((
        ("current_stack" IS NOT NULL)::int
      + ("decision_maker" IS NOT NULL OR "approver" IS NOT NULL)::int
      + ("budget" IS NOT NULL)::int
      + ("deadline" IS NOT NULL)::int
      )::smallint)) STORED NOT NULL,
	"exit_reason" text,
	"exited_at" timestamp with time zone,
	CONSTRAINT "lead_money_pair" CHECK (("budget" IS NULL) = ("currency" IS NULL)),
	CONSTRAINT "lead_exit_pair" CHECK (("exit_reason" IS NULL) = ("exited_at" IS NULL)),
	CONSTRAINT "lead_exit_no_stage" CHECK ("exit_reason" IS NULL OR "stage" IS NULL),
	CONSTRAINT "lead_no_blank" CHECK ("company" <> '' AND "legal_name" <> '' AND "tax_code" <> '' AND "address" <> '' AND "province" <> '' AND "main_product" <> '' AND "contact_name" <> '' AND "contact_title" <> '' AND "email" <> '' AND "phone" <> '' AND "pain" <> '' AND "current_stack" <> '' AND "decision_maker" <> '' AND "approver" <> '' AND "source" <> '')
);
--> statement-breakpoint
CREATE TABLE "sales"."opportunity" (
	"code" text PRIMARY KEY NOT NULL,
	"lead_code" text NOT NULL,
	"stage" text,
	"amount" bigint,
	"currency" text,
	"expected_close" date,
	"owner_id" text,
	"closed_at" timestamp with time zone,
	"lost_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opportunity_code_lead_key" UNIQUE("code","lead_code"),
	CONSTRAINT "opportunity_money_pair" CHECK (("amount" IS NULL) = ("currency" IS NULL)),
	CONSTRAINT "opportunity_lost_closed" CHECK ("lost_reason" IS NULL OR "closed_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "platform"."actor" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"role_id" text NOT NULL,
	"branches" text[] DEFAULT '{}' NOT NULL,
	"own_only" boolean DEFAULT false NOT NULL,
	CONSTRAINT "actor_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "platform"."audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"code" text,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "platform"."edge" (
	"from_code" text NOT NULL,
	"to_code" text NOT NULL,
	"kind" text NOT NULL,
	CONSTRAINT "edge_from_code_to_code_kind_pk" PRIMARY KEY("from_code","to_code","kind")
);
--> statement-breakpoint
CREATE TABLE "platform"."object" (
	"code" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"branch" text NOT NULL,
	"label" text NOT NULL,
	"owner" text,
	"state" text,
	"amount" bigint
);
--> statement-breakpoint
ALTER TABLE "sales"."contract" ADD CONSTRAINT "contract_owner_id_actor_id_fk" FOREIGN KEY ("owner_id") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."contract" ADD CONSTRAINT "contract_opportunity_fk" FOREIGN KEY ("opportunity_code","lead_code") REFERENCES "sales"."opportunity"("code","lead_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."lead" ADD CONSTRAINT "lead_owner_id_actor_id_fk" FOREIGN KEY ("owner_id") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."lead" ADD CONSTRAINT "lead_bd_owner_id_actor_id_fk" FOREIGN KEY ("bd_owner_id") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."lead" ADD CONSTRAINT "lead_marketing_owner_id_actor_id_fk" FOREIGN KEY ("marketing_owner_id") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."opportunity" ADD CONSTRAINT "opportunity_lead_code_lead_code_fk" FOREIGN KEY ("lead_code") REFERENCES "sales"."lead"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."opportunity" ADD CONSTRAINT "opportunity_owner_id_actor_id_fk" FOREIGN KEY ("owner_id") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."edge" ADD CONSTRAINT "edge_from_code_object_code_fk" FOREIGN KEY ("from_code") REFERENCES "platform"."object"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."edge" ADD CONSTRAINT "edge_to_code_object_code_fk" FOREIGN KEY ("to_code") REFERENCES "platform"."object"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contract_lead_idx" ON "sales"."contract" USING btree ("lead_code");--> statement-breakpoint
CREATE INDEX "lead_owner_idx" ON "sales"."lead" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "lead_stage_idx" ON "sales"."lead" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "lead_exit_idx" ON "sales"."lead" USING btree ("exit_reason");--> statement-breakpoint
CREATE INDEX "lead_source_idx" ON "sales"."lead" USING btree ("source");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_email_live_idx" ON "sales"."lead" USING btree ("email") WHERE "exit_reason" IS NULL;--> statement-breakpoint
CREATE INDEX "opportunity_lead_idx" ON "sales"."opportunity" USING btree ("lead_code");--> statement-breakpoint
CREATE INDEX "opportunity_owner_idx" ON "sales"."opportunity" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "audit_code_idx" ON "platform"."audit" USING btree ("code");--> statement-breakpoint
CREATE INDEX "audit_actor_idx" ON "platform"."audit" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "edge_from_idx" ON "platform"."edge" USING btree ("from_code");--> statement-breakpoint
CREATE INDEX "edge_to_idx" ON "platform"."edge" USING btree ("to_code");--> statement-breakpoint
CREATE INDEX "object_kind_idx" ON "platform"."object" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "object_branch_idx" ON "platform"."object" USING btree ("branch");