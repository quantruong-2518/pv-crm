-- 0105 - the hourly purge of read bell lines no longer scans the whole table.
--
-- Serves `DELETE ... WHERE read_at < $1`. Partial: unread rows are never
-- purged, and `<` already rejects NULL, so the planner can use it.
-- Plain CREATE INDEX (the migrator runs in a transaction); hand-written for 0047's reason.
CREATE INDEX IF NOT EXISTS "notification_read_purge_idx" ON "platform"."notification" USING btree ("read_at") WHERE "read_at" IS NOT NULL;
