-- 0125 - review indexes: six that answer a named query, two dropped as duplicates.
--
-- ADD  lead_account_idx            admission gate, account book, account profile
--      contract_opportunity_idx    dealOpen/dealWon/dealLost, lockDeal
--      contract_owner_idx          own-only scopes of the contract book
--      debrief_thread_idx          bool_and(cancelled) per thread; debrief_open_unique is partial
--      meeting_upcoming_idx        upcomingOf, polled every 60 s by /meetings/today
--      mail_run_gmail_send_idx     gmailAddressesUsed (sender + send-time window)
-- DROP edge_from_idx               duplicates the leading column of the PK (from_code, to_code, kind)
--      mail_event_delivery_idx     duplicates the leading column of mail_event_once (delivery_id, kind, at)
--
-- Plain CREATE INDEX: the migrator runs in a transaction, so no CONCURRENTLY.
-- Re-runnable: IF [NOT] EXISTS throughout. Safe either order against the app (no column changes).
-- Hand-written for 0047's reason: `generate`'s baseline is still stuck at 0026.
CREATE INDEX IF NOT EXISTS "lead_account_idx" ON "sales"."lead" USING btree ("account_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contract_opportunity_idx" ON "sales"."contract" USING btree ("opportunity_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contract_owner_idx" ON "sales"."contract" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "debrief_thread_idx" ON "comms"."debrief" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meeting_upcoming_idx" ON "sales"."meeting" USING btree ("at") WHERE "held_at" IS NULL AND "cancelled_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mail_run_gmail_send_idx" ON "platform"."mail_run" USING btree ("created_by",COALESCE("scheduled_at", "created_at")) WHERE "transport" = 'gmail';--> statement-breakpoint
DROP INDEX IF EXISTS "platform"."edge_from_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "platform"."mail_event_delivery_idx";
