ALTER TABLE "sales"."campaign" DROP CONSTRAINT "campaign_no_blank";--> statement-breakpoint
ALTER TABLE "sales"."campaign" ADD COLUMN "slogan" text;--> statement-breakpoint
ALTER TABLE "sales"."campaign" ADD COLUMN "thumbnail_url" text;--> statement-breakpoint
ALTER TABLE "sales"."campaign" ADD CONSTRAINT "campaign_no_blank" CHECK ("name" <> '' AND "owner_id" <> '' AND "slogan" <> '' AND "thumbnail_url" <> '');