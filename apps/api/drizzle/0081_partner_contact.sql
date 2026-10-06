-- 0081 - a referrer may BE a contact already in the book.
--
-- `partner.contact_code` is nullable: referrers typed by name keep NULL. The
-- partial UNIQUE gives one contact at most one ref code, so picking the same
-- contact twice returns the same `REF-…`. ON DELETE SET NULL because leads go
-- on naming the code after the contact row is gone. Additive only.
--
-- Hand-written for 0047's reason: `generate`'s baseline is still stuck at 0026.
ALTER TABLE "sales"."partner" ADD COLUMN "contact_code" text;--> statement-breakpoint
ALTER TABLE "sales"."partner" ADD CONSTRAINT "partner_contact_code_contact_code_fk" FOREIGN KEY ("contact_code") REFERENCES "sales"."contact"("code") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "partner_contact_unique" ON "sales"."partner" USING btree ("contact_code") WHERE "contact_code" IS NOT NULL;
