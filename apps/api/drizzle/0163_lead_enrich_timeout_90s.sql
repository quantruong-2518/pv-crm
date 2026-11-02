-- 0163 - `lead-enrich` route timeout 60 s -> 90 s (the `ai_route_timeout_range` ceiling): the
-- background fill's web-search call hit 504 DEADLINE_EXCEEDED at 60 s (ADR 0131). Only a
-- route still on 0157's 60 s moves, so a value an admin set by hand stays. Re-runnable.
SET LOCAL lock_timeout = '10s';--> statement-breakpoint
UPDATE "platform"."ai_route" SET "timeout_ms" = 90000
WHERE "task" = 'lead-enrich' AND "timeout_ms" = 60000;
