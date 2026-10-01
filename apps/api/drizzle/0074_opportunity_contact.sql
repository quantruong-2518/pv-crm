-- 0074 - the customer-side people attached to a deal at create:
-- `sales.opportunity_contact`, one row per (deal, contact), with the part the
-- person plays (`role`, NULL = nobody has said) and which one is primary.
--
-- No backfill, and no "at least one contact per deal" fence: deals opened before
-- this table have no rows and stay valid. The create door enforces the minimum.
-- `contact_code` gets a real foreign key - `sales.contact.code` is its own
-- primary key, so every contact has the row the key needs.
--
-- The role CHECK is copied out by hand: the day a fourth role exists
-- (`OpportunityContactRole` in `@pv/contracts`) is a migration somebody reads.
-- Hand-written for the reason 0047-0073 give: drizzle-kit's baseline snapshot
-- is still stuck at 0026.
CREATE TABLE "sales"."opportunity_contact" (
	"opportunity_code" text NOT NULL,
	"contact_code" text NOT NULL,
	"role" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	CONSTRAINT "opportunity_contact_pk" PRIMARY KEY("opportunity_code","contact_code"),
	CONSTRAINT "opportunity_contact_role_known" CHECK ("role" IS NULL OR "role" IN ('decision-maker', 'user', 'influencer'))
);--> statement-breakpoint
ALTER TABLE "sales"."opportunity_contact" ADD CONSTRAINT "opportunity_contact_opportunity_code_opportunity_code_fk" FOREIGN KEY ("opportunity_code") REFERENCES "sales"."opportunity"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."opportunity_contact" ADD CONSTRAINT "opportunity_contact_contact_code_contact_code_fk" FOREIGN KEY ("contact_code") REFERENCES "sales"."contact"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "opportunity_contact_contact_idx" ON "sales"."opportunity_contact" USING btree ("contact_code");--> statement-breakpoint
CREATE UNIQUE INDEX "opportunity_contact_one_primary_idx" ON "sales"."opportunity_contact" USING btree ("opportunity_code") WHERE "is_primary";
