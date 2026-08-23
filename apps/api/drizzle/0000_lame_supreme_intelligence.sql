CREATE SCHEMA "sales";
--> statement-breakpoint
CREATE SCHEMA "platform";
--> statement-breakpoint
CREATE TABLE "sales"."lead" (
	"code" text PRIMARY KEY NOT NULL,
	"company" text NOT NULL,
	"province" text NOT NULL,
	"category" text NOT NULL,
	"tier" text NOT NULL,
	"required_filled" smallint DEFAULT 0 NOT NULL,
	"optional_filled" smallint DEFAULT 0 NOT NULL,
	"owner_id" text,
	"stage" text,
	"deal_code" text,
	"contract_code" text,
	"days_here" integer DEFAULT 0 NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"exit_reason" text,
	"exited_at" timestamp with time zone
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
ALTER TABLE "sales"."lead" ADD CONSTRAINT "lead_owner_id_actor_id_fk" FOREIGN KEY ("owner_id") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."edge" ADD CONSTRAINT "edge_from_code_object_code_fk" FOREIGN KEY ("from_code") REFERENCES "platform"."object"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."edge" ADD CONSTRAINT "edge_to_code_object_code_fk" FOREIGN KEY ("to_code") REFERENCES "platform"."object"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_owner_idx" ON "sales"."lead" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "lead_stage_idx" ON "sales"."lead" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "lead_exit_idx" ON "sales"."lead" USING btree ("exit_reason");--> statement-breakpoint
CREATE INDEX "audit_code_idx" ON "platform"."audit" USING btree ("code");--> statement-breakpoint
CREATE INDEX "audit_actor_idx" ON "platform"."audit" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "edge_from_idx" ON "platform"."edge" USING btree ("from_code");--> statement-breakpoint
CREATE INDEX "edge_to_idx" ON "platform"."edge" USING btree ("to_code");--> statement-breakpoint
CREATE INDEX "object_kind_idx" ON "platform"."object" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "object_branch_idx" ON "platform"."object" USING btree ("branch");