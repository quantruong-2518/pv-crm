-- 0116 - a company's logo link, laid behind its card in the company book.
--
-- Additive only: one nullable column and one CHECK every existing row passes
-- (all NULL). ORDER: migrate BEFORE deploy. https only, because the app is
-- served over https and an http image is blocked as mixed content.
--
-- Hand-written for 0047's reason: `generate`'s baseline is still stuck at 0026.
ALTER TABLE "sales"."account" ADD COLUMN IF NOT EXISTS "logo_url" text;--> statement-breakpoint
ALTER TABLE "sales"."account" DROP CONSTRAINT IF EXISTS "account_logo_url_https";--> statement-breakpoint
ALTER TABLE "sales"."account" ADD CONSTRAINT "account_logo_url_https" CHECK ("logo_url" IS NULL OR ("logo_url" LIKE 'https://%' AND length("logo_url") <= 1000));
