-- 0097 - the stored keys the shared admission gate matches a batch on.
--
-- Four doors admit leads and each matched duplicates its own way. The gate
-- reads candidates for a whole batch in ONE query per table, `= ANY($1)` on a
-- normalised key, so the key has to be a stored, indexed column. The folding
-- (diacritics, legal words, phone form, tax-code root) lives in `@pv/engines`
-- and nowhere else: no generated column and no `unaccent`, so Neon and PGlite
-- cannot disagree with the TypeScript that asks.
--
-- Every column is nullable with no default and NOTHING is backfilled here -
-- SQL cannot spell the folding; a TypeScript script fills old rows. Additive:
-- old code keeps writing valid rows (keys NULL) between migrate and deploy.
--
-- NO unique index, deliberately. Stored rows very likely already collide under
-- the new folding ('Công ty ABC' / 'Cong ty ABC'), so it would fail to build.
-- `account_identity_uniq` is untouched; the gate serialises with advisory locks.
--
-- Locks: ADD COLUMN is metadata-only; each CREATE INDEX blocks writes to its
-- table while it scans (the migrator runs in a transaction, so no
-- CONCURRENTLY); the touch CHECK rescans `sales.touch` under ACCESS EXCLUSIVE.
--
-- Hand-written for 0047's reason: `generate`'s baseline is still stuck at 0026.
ALTER TABLE "sales"."account" ADD COLUMN "tax_root" text;--> statement-breakpoint
ALTER TABLE "sales"."account" ADD COLUMN "name_key" text;--> statement-breakpoint
ALTER TABLE "sales"."account" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "sales"."account" ADD CONSTRAINT "account_created_by_actor_id_fk" FOREIGN KEY ("created_by") REFERENCES "platform"."actor"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_tax_root_idx" ON "sales"."account" USING btree ("tax_root");--> statement-breakpoint
CREATE INDEX "account_name_key_idx" ON "sales"."account" USING btree ("name_key");--> statement-breakpoint
ALTER TABLE "sales"."lead" ADD COLUMN "phone_key" text;--> statement-breakpoint
CREATE INDEX "lead_phone_key_idx" ON "sales"."lead" USING btree ("phone_key");--> statement-breakpoint
ALTER TABLE "sales"."contact" ADD COLUMN "phone_key" text;--> statement-breakpoint
CREATE INDEX "contact_phone_key_idx" ON "sales"."contact" USING btree ("phone_key");--> statement-breakpoint

-- Twenty-eight `TouchKind` values: `re-entered` joins - the same customer came
-- through a door again and the gate marked the EXISTING lead instead of
-- writing a second one. Nothing leaves. One constraint fences lead and
-- opportunity touches alike; there is no per-subject list to keep in step.
ALTER TABLE "sales"."touch" DROP CONSTRAINT "touch_kind_known";--> statement-breakpoint
ALTER TABLE "sales"."touch" ADD CONSTRAINT "touch_kind_known" CHECK ("kind" IN ('created', 'contacted', 'field-filled', 'handed-over', 'tier-raised',
                     'care-planned', 'exchange-logged', 'first-action', 'verified',
                     'nurtured', 'resumed', 'archived', 'first-meeting',
                     'entered-pipeline', 'stage-changed', 'signed', 'exited',
                     'reopened', 'sample-sent', 'poc-run', 'demo-held', 'site-visited',
                     'quotation-sent', 'care-left', 'next-step-done',
                     'mail-failed', 'mail-sync-failed', 're-entered'));
