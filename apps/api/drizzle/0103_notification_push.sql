-- 0103 - Postgres announces every change to the bell's ledger.
--
-- A trigger rather than a `pg_notify` call in application code: NOTIFY inside a
-- transaction is delivered only on COMMIT, so a rolled-back fact rings nobody,
-- and a trigger cannot be forgotten by a future writer (API, worker, sweeper).
-- The payload is the recipient id and nothing else: the listener sends a bare
-- signal and the browser re-reads through the permission-checked endpoints.
--
-- Row-level AFTER INSERT does not fire for a row `ON CONFLICT DO NOTHING` skips.
-- UPDATE is limited to `read_at` (and to a real change of it) so a person's
-- other tabs drop the unread badge. No DELETE trigger: the only delete is the
-- purge of rows already read, and nobody needs to hear it.
--
-- Hand-written for 0047's reason: `generate`'s baseline is still stuck at 0026.
-- Stamped one day after 0102, which is the last one applied.
CREATE FUNCTION "platform"."notification_push"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
	PERFORM pg_notify('pv_notification', NEW."recipient_id");
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "notification_push_insert"
AFTER INSERT ON "platform"."notification"
FOR EACH ROW EXECUTE FUNCTION "platform"."notification_push"();--> statement-breakpoint
CREATE TRIGGER "notification_push_read"
AFTER UPDATE OF "read_at" ON "platform"."notification"
FOR EACH ROW WHEN (OLD."read_at" IS DISTINCT FROM NEW."read_at")
EXECUTE FUNCTION "platform"."notification_push"();
