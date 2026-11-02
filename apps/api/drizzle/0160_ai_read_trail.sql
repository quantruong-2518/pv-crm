-- 0160 - who may read the `ai-read` trail, and the index that keeps it cheap (ADR 0133,
-- question 142, owner's decision of 01/11: kept 12 months, read by director and head-of-sales).
-- Apart from `audit-log.view`: the trail shows what each person looked up, so
-- account-executive stays out. No CHECK to widen: `role_permission.permission` has none (0032).
-- Ships right after 0159; `when` must stay above it or drizzle skips this file silently.
-- `granted_by` stays NULL, like a seeder-planted row: nobody ticked this. No `permission_seed`
-- row, for 0102's reason: the seeder would then skip the key on a fresh database.
-- Safe either way round on its own, though 0159 makes the ship migrate-first. If the old build
-- reboots after this, `forgetUnknown()` drops these two rows; the new build has no seed mark,
-- so it plants them again.
-- Re-runnable: ON CONFLICT DO NOTHING, IF NOT EXISTS.
-- Plain CREATE INDEX: the migrator runs in a transaction, so no CONCURRENTLY (0125).
-- Hand-written for 0047's reason: `generate`'s baseline is stuck at 0026.
-- The index takes a SHARE lock on `audit`, and every guard refusal writes there: give up after
-- 10 s rather than stack writers behind a long reader. Needed here too: 0160 can run alone.
SET LOCAL lock_timeout = '10s';--> statement-breakpoint

INSERT INTO "platform"."role_permission" ("role_id", "permission")
VALUES ('director', 'ai-read.view'), ('head-of-sales', 'ai-read.view')
ON CONFLICT ("role_id", "permission") DO NOTHING;--> statement-breakpoint

-- "Which `ai-read` rows are past 12 months" (the purge) and "the newest `ai-read` rows" (the
-- read door). Partial because the rest of `audit` answers neither and should not pay for it.
CREATE INDEX IF NOT EXISTS "audit_ai_read_at_idx" ON "platform"."audit" USING btree ("at") WHERE "action" = 'ai-read';
