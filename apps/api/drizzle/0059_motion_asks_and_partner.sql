-- 0059 - each motion says WHAT the lead form asks for next, and referrers get a
-- catalogue of their own.
--
-- `motion_policy.asks` replaces 0057's boolean `requires_campaign`: one of three
-- answers, not yes/no. EVENT was the only `true`; it maps to CAMPAIGN together
-- with RECYCLE (a re-mailed list is a campaign too). REFERRAL/PARTNER ask for a
-- referrer, INBOUND/OUTBOUND for an origin. The six rows exist since 0036, so
-- the column is added nullable, backfilled, then made NOT NULL - no DEFAULT,
-- because a seventh motion must state its answer, not inherit one.
--
-- `sales.partner` is the referrer catalogue behind `lead.partner_code`. Each
-- partner hangs under one `lead_origin` (level 2), and campaigns may now name
-- one too. `lead_no_blank` is NOT re-created: like `origin_id`, `partner_code`
-- is an FK, and '' can never match a `REF-` code. No partners are seeded.
-- `requires_campaign` is NOT dropped here (expand/contract): code deployed before
-- this still reads it; a later migration drops it once the new code is live.
-- Hand-written for 0047-0058's reason: `generate`'s baseline is stuck at 0026.
ALTER TABLE "sales"."motion_policy" ADD COLUMN "asks" text;--> statement-breakpoint
UPDATE "sales"."motion_policy" SET "asks" = CASE "motion"
	WHEN 'INBOUND' THEN 'ORIGIN' WHEN 'OUTBOUND' THEN 'ORIGIN'
	WHEN 'EVENT' THEN 'CAMPAIGN' WHEN 'RECYCLE' THEN 'CAMPAIGN'
	WHEN 'REFERRAL' THEN 'REFERRER' WHEN 'PARTNER' THEN 'REFERRER' END;--> statement-breakpoint
ALTER TABLE "sales"."motion_policy" ALTER COLUMN "asks" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sales"."motion_policy" ADD CONSTRAINT "motion_policy_asks_known" CHECK ("asks" IN ('ORIGIN', 'CAMPAIGN', 'REFERRER'));--> statement-breakpoint

CREATE SEQUENCE "sales"."partner_code_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "sales"."partner" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"origin_id" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partner_code_shape" CHECK ("code" ~ '^REF-[0-9]{4,}$'),
	CONSTRAINT "partner_no_blank" CHECK ("name" <> '')
);
--> statement-breakpoint
ALTER TABLE "sales"."partner" ADD CONSTRAINT "partner_origin_id_lead_origin_id_fk" FOREIGN KEY ("origin_id") REFERENCES "sales"."lead_origin"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."partner" ADD CONSTRAINT "partner_created_by_actor_id_fk" FOREIGN KEY ("created_by") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "partner_origin_idx" ON "sales"."partner" USING btree ("origin_id");--> statement-breakpoint

ALTER TABLE "sales"."lead" ADD COLUMN "partner_code" text;--> statement-breakpoint
ALTER TABLE "sales"."lead" ADD CONSTRAINT "lead_partner_code_partner_code_fk" FOREIGN KEY ("partner_code") REFERENCES "sales"."partner"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_partner_idx" ON "sales"."lead" USING btree ("partner_code");--> statement-breakpoint

ALTER TABLE "sales"."campaign" ADD COLUMN "origin_id" text;--> statement-breakpoint
ALTER TABLE "sales"."campaign" ADD CONSTRAINT "campaign_origin_id_lead_origin_id_fk" FOREIGN KEY ("origin_id") REFERENCES "sales"."lead_origin"("id") ON DELETE no action ON UPDATE no action;
