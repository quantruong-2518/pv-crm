-- 0057 - a lead's origin gets a second level, and campaigns an end date.
--
-- Level 1 stays `lead.motion` (six, closed). Level 2 is `sales.lead_origin`, a
-- catalogue users extend. Names are normalised to `key` by `originKey()` in
-- `@pv/contracts`; this file only stores keys already in that form and makes
-- them UNIQUE. Aliases map synonyms onto a row; `lead_origin_motion` says under
-- which motions an origin is offered (LinkedIn is both INBOUND and OUTBOUND).
--
-- `motion_policy` gains display columns (label, ord, active) and one rule
-- (`requires_campaign`, true for EVENT). Its six rows were planted by 0036, so
-- they are UPDATEd here, not inserted.
--
-- Backfill of `lead.origin_id` covers only what `source_kind` already proves:
-- APOLLO -> Apollo, LANDING_PAGE -> Website. Everything else stays NULL rather
-- than guessed. The lead trigger from 0056 fires on state/tier/workstream_code
-- only, so this UPDATE does not wake it.
--
-- Hand-written for 0047's reason: `generate`'s baseline is still stuck at 0026.
CREATE SEQUENCE "sales"."lead_origin_code_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "sales"."lead_origin" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"key" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"merged_into" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_origin_key_unique" UNIQUE("key"),
	CONSTRAINT "lead_origin_no_blank" CHECK ("name" <> ''),
	CONSTRAINT "lead_origin_key_shape" CHECK ("key" ~ '^[a-z0-9]+$'),
	CONSTRAINT "lead_origin_not_self_merged" CHECK ("merged_into" <> "id"),
	CONSTRAINT "lead_origin_merged_inactive" CHECK ("merged_into" IS NULL OR "active" = false)
);
--> statement-breakpoint
CREATE TABLE "sales"."lead_origin_alias" (
	"key" text PRIMARY KEY NOT NULL,
	"origin_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_origin_alias_key_shape" CHECK ("key" ~ '^[a-z0-9]+$')
);
--> statement-breakpoint
CREATE TABLE "sales"."lead_origin_motion" (
	"origin_id" text NOT NULL,
	"motion" text NOT NULL,
	CONSTRAINT "lead_origin_motion_origin_id_motion_pk" PRIMARY KEY("origin_id","motion"),
	CONSTRAINT "lead_origin_motion_motion_known" CHECK ("motion" IN ('INBOUND', 'OUTBOUND', 'EVENT', 'REFERRAL', 'PARTNER', 'RECYCLE'))
);
--> statement-breakpoint
ALTER TABLE "sales"."lead_origin" ADD CONSTRAINT "lead_origin_merged_into_lead_origin_id_fk" FOREIGN KEY ("merged_into") REFERENCES "sales"."lead_origin"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."lead_origin" ADD CONSTRAINT "lead_origin_created_by_actor_id_fk" FOREIGN KEY ("created_by") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."lead_origin_alias" ADD CONSTRAINT "lead_origin_alias_origin_id_lead_origin_id_fk" FOREIGN KEY ("origin_id") REFERENCES "sales"."lead_origin"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."lead_origin_motion" ADD CONSTRAINT "lead_origin_motion_origin_id_lead_origin_id_fk" FOREIGN KEY ("origin_id") REFERENCES "sales"."lead_origin"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "sales"."lead" ADD COLUMN "origin_id" text;--> statement-breakpoint
ALTER TABLE "sales"."lead" ADD COLUMN "origin_raw" text;--> statement-breakpoint
ALTER TABLE "sales"."lead" ADD CONSTRAINT "lead_origin_id_lead_origin_id_fk" FOREIGN KEY ("origin_id") REFERENCES "sales"."lead_origin"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_origin_idx" ON "sales"."lead" USING btree ("origin_id");--> statement-breakpoint
ALTER TABLE "sales"."lead" DROP CONSTRAINT "lead_no_blank";--> statement-breakpoint
ALTER TABLE "sales"."lead" ADD CONSTRAINT "lead_no_blank" CHECK ("company" <> '' AND "legal_name" <> '' AND "tax_code" <> '' AND "address" <> '' AND "province" <> '' AND "main_product" <> '' AND "contact_name" <> '' AND "contact_title" <> '' AND "email" <> '' AND "phone" <> '' AND "contact_channel" <> '' AND "contact_channel_url" <> '' AND "pain" <> '' AND "current_stack" <> '' AND "decision_maker" <> '' AND "approver" <> '' AND "campaign_id" <> '' AND "origin_raw" <> '');--> statement-breakpoint

ALTER TABLE "sales"."motion_policy" ADD COLUMN "label" text;--> statement-breakpoint
ALTER TABLE "sales"."motion_policy" ADD COLUMN "ord" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sales"."motion_policy" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "sales"."motion_policy" ADD COLUMN "requires_campaign" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sales"."motion_policy" ADD CONSTRAINT "motion_policy_label_no_blank" CHECK ("label" <> '');--> statement-breakpoint
UPDATE "sales"."motion_policy" SET "ord" = CASE "motion"
	WHEN 'INBOUND' THEN 1 WHEN 'OUTBOUND' THEN 2 WHEN 'EVENT' THEN 3
	WHEN 'REFERRAL' THEN 4 WHEN 'PARTNER' THEN 5 WHEN 'RECYCLE' THEN 6 END;--> statement-breakpoint
UPDATE "sales"."motion_policy" SET "requires_campaign" = true WHERE "motion" = 'EVENT';--> statement-breakpoint

ALTER TABLE "sales"."campaign" ADD COLUMN "ends_on" date;--> statement-breakpoint

-- Seed catalogue. Keys are what `originKey()` returns for each name; ids are
-- in listing order, LinkedIn once (INBOUND) and linked to OUTBOUND below.
INSERT INTO "sales"."lead_origin" ("id", "name", "key") VALUES
	('LO-0001', 'Website', 'website'),
	('LO-0002', 'Google', 'google'),
	('LO-0003', 'Facebook', 'facebook'),
	('LO-0004', 'Zalo OA', 'zalooa'),
	('LO-0005', 'LinkedIn', 'linkedin'),
	('LO-0006', 'Hotline', 'hotline'),
	('LO-0007', 'Email đến', 'emailden'),
	('LO-0008', 'Apollo', 'apollo'),
	('LO-0009', 'Email lạnh', 'emaillanh'),
	('LO-0010', 'Gọi lạnh', 'goilanh'),
	('LO-0011', 'Gặp trực tiếp', 'gaptructiep'),
	('LO-0012', 'Danh sách mua', 'danhsachmua'),
	('LO-0013', 'Triển lãm', 'trienlam'),
	('LO-0014', 'Hội thảo', 'hoithao'),
	('LO-0015', 'Webinar', 'webinar'),
	('LO-0016', 'Khách cũ', 'khachcu'),
	('LO-0017', 'Nhân viên', 'nhanvien'),
	('LO-0018', 'Người quen', 'nguoiquen'),
	('LO-0019', 'Đại lý', 'daily'),
	('LO-0020', 'Đối tác tích hợp', 'doitactichhop'),
	('LO-0021', 'Lead cũ', 'leadcu'),
	('LO-0022', 'Khách đã rời', 'khachdaroi');--> statement-breakpoint
SELECT setval('"sales"."lead_origin_code_seq"', 22);--> statement-breakpoint
INSERT INTO "sales"."lead_origin_motion" ("origin_id", "motion") VALUES
	('LO-0001', 'INBOUND'), ('LO-0002', 'INBOUND'), ('LO-0003', 'INBOUND'),
	('LO-0004', 'INBOUND'), ('LO-0005', 'INBOUND'), ('LO-0006', 'INBOUND'),
	('LO-0007', 'INBOUND'),
	('LO-0008', 'OUTBOUND'), ('LO-0005', 'OUTBOUND'), ('LO-0009', 'OUTBOUND'),
	('LO-0010', 'OUTBOUND'), ('LO-0011', 'OUTBOUND'), ('LO-0012', 'OUTBOUND'),
	('LO-0013', 'EVENT'), ('LO-0014', 'EVENT'), ('LO-0015', 'EVENT'),
	('LO-0016', 'REFERRAL'), ('LO-0017', 'REFERRAL'), ('LO-0018', 'REFERRAL'),
	('LO-0019', 'PARTNER'), ('LO-0020', 'PARTNER'),
	('LO-0021', 'RECYCLE'), ('LO-0022', 'RECYCLE');--> statement-breakpoint
INSERT INTO "sales"."lead_origin_alias" ("key", "origin_id") VALUES
	('fb', 'LO-0003'),
	('zalo', 'LO-0004'),
	('web', 'LO-0001'), ('landing', 'LO-0001'), ('landingpage', 'LO-0001'),
	('gg', 'LO-0002'), ('googleads', 'LO-0002');--> statement-breakpoint

UPDATE "sales"."lead" SET "origin_id" = 'LO-0008' WHERE "source_kind" = 'APOLLO';--> statement-breakpoint
UPDATE "sales"."lead" SET "origin_id" = 'LO-0001' WHERE "source_kind" = 'LANDING_PAGE';
