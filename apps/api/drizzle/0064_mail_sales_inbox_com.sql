-- 0064 - the sales inbox is sales@pebblevina.com; 0060 fenced `.co` by mistake.
--
-- Owner decision 28/09: `.co` goes away entirely. Every run - sent or not - is
-- rewritten to `.com` first, so the tightened CHECK below refuses no row. The
-- constraint is dropped before the rewrite because 0060's list does not allow
-- `.com` yet.
--
-- Hand-written for 0047-0063's reason: `generate`'s baseline is stuck at 0026.
ALTER TABLE "platform"."mail_run" DROP CONSTRAINT "mail_run_cc_addresses_known";--> statement-breakpoint
UPDATE "platform"."mail_run"
SET "cc_addresses" = array_replace("cc_addresses", 'sales@pebblevina.co', 'sales@pebblevina.com'),
    "updated_at" = now()
WHERE 'sales@pebblevina.co' = ANY ("cc_addresses");--> statement-breakpoint
ALTER TABLE "platform"."mail_run" ADD CONSTRAINT "mail_run_cc_addresses_known" CHECK ("cc_addresses" <@ ARRAY['contact@pebblevina.com', 'sales@pebblevina.com']::text[]);
