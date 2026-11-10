-- 0165 - `platform.assistant_tool_call.reveals_content`: whether the call handed
-- permission-gated text (a comm summary, ADR 0147) to the model. The table keeps no output
-- column, so this flag is the only trace; a stored answer may quote that text, and a later
-- re-read (chat reload, admin report list) hides it from a reader without the permission.
-- Backfill is conservative on purpose: every ok `get_history` call since the tool shipped
-- is marked, because after the fact we cannot tell which of them carried a visible summary.
-- Additive: one NOT NULL column with a constant default (no table rewrite on Postgres 11+).
-- ORDER: migrate BEFORE deploy - the new api writes the column; the old api never names it.
-- Re-runnable: IF NOT EXISTS, and the UPDATE touches only rows it changes. Hand-written for
-- 0047's reason: `generate`'s baseline is stuck at 0026.
-- The ALTER waits for an exclusive lock that every writer then queues behind: give up
-- after 10 s instead. Lasts to the migrator's commit (one transaction).
SET LOCAL lock_timeout = '10s';--> statement-breakpoint
ALTER TABLE "platform"."assistant_tool_call" ADD COLUMN IF NOT EXISTS "reveals_content" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "platform"."assistant_tool_call" SET "reveals_content" = true
  WHERE "name" = 'get_history' AND "outcome" = 'ok' AND "reveals_content" = false;
