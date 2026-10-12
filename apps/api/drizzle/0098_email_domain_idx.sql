-- 0098 - the admission gate finds leads and contacts by email DOMAIN.
--
-- Two people at one company share a domain long before anybody writes down a
-- tax code, so the gate reads `split_part(lower(email), '@', 2) = ANY($1)` for
-- a whole batch at once. Postgres only uses an expression index when the query
-- spells the SAME expression, so the text below and the repository's must
-- agree token for token - change one, change both.
--
-- An expression index rather than a stored `email_domain` column: the domain
-- is derivable in plain SQL, identically on Neon and PGlite, so there is no
-- writer to teach and no backfill. Plain btree, not unique - a shared domain
-- is a candidate for a person to judge, and gmail.com is shared by everybody.
--
-- Locks: each CREATE INDEX blocks writes to its table while it scans (the
-- migrator runs in a transaction, so no CONCURRENTLY).
--
-- Hand-written for 0047's reason: `generate`'s baseline is still stuck at 0026.
CREATE INDEX "lead_email_domain_idx" ON "sales"."lead" USING btree (split_part(lower("email"), '@', 2));--> statement-breakpoint
CREATE INDEX "contact_email_domain_idx" ON "sales"."contact" USING btree (split_part(lower("email"), '@', 2));
