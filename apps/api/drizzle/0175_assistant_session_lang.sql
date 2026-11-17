-- 0175 - `platform.assistant_session.lang`: the language the assistant replies in, one per chat.
-- Picked from the first message and never changed within a chat. Values `vi` | `en` | `ko`;
-- `AssistantLang` in @pv/contracts must carry exactly these - widen both together. List copied
-- by hand. Existing rows become 'vi' through the default: every chat so far was Vietnamese-first.
-- Additive: one NOT NULL column with a constant default (no table rewrite on PG 11+) and one CHECK.
-- ORDER: migrate BEFORE deploy - the new api writes `lang`; the old api never names it.
-- Re-runnable: ADD COLUMN IF NOT EXISTS, DROP ... IF EXISTS before ADD. Hand-written for 0047's
-- reason: `generate`'s baseline is stuck at 0026.
-- The ADD CONSTRAINT scans the table under a lock every session writer queues behind: give up
-- after 10 s instead. Lasts to the migrator's commit (one transaction).
SET LOCAL lock_timeout = '10s';--> statement-breakpoint

ALTER TABLE "platform"."assistant_session" ADD COLUMN IF NOT EXISTS "lang" text DEFAULT 'vi' NOT NULL;--> statement-breakpoint

ALTER TABLE "platform"."assistant_session" DROP CONSTRAINT IF EXISTS "assistant_session_lang_known";--> statement-breakpoint
ALTER TABLE "platform"."assistant_session" ADD CONSTRAINT "assistant_session_lang_known" CHECK ("lang" IN ('vi', 'en', 'ko'));
