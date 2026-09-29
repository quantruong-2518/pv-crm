-- 0070 - ADR 0070 owner decision B: a live lead sharing an email with another
-- live lead is imported/recorded, not refused. The unique fence becomes a
-- plain index - same `lower(email)` shape, so every existing reader still
-- finds "the leads at this mailbox" the same way, only without the refusal.
--
-- A `WHERE` clause cannot be altered in place (same note 0067 left on this
-- same index), so it is dropped and re-created rather than altered.
DROP INDEX "sales"."lead_email_live_idx";--> statement-breakpoint
CREATE INDEX "lead_email_idx" ON "sales"."lead" USING btree (lower("email"));
