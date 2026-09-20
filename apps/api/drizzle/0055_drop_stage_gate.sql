-- 0055 - the stage gate goes, tables and all (ADR 0060). Not the idea's fault:
--
-- The four criteria that ever existed all sat on `discovery`, so a gate reading
-- "are the stages behind this deal cleared" only ever refused one rung of five;
-- the other four columns were a door with nothing written on it.
--
-- And the refusal printed on the OPPORTUNITY screen while the only place a box
-- could be ticked was the WORKSTREAM screen — a locked door with the key in
-- another room. Whoever hit it had no move to make from where they stood.
--
-- The ticks go down with the tables; the project owner accepted that loss,
-- which on every database holding any is seed data. Child first, since
-- `opportunity_criterion_tick` carries the FK into `stage_criterion`.
-- Hand-written for 0047's reason: `generate`'s baseline is still stuck at 0026.
DROP TABLE "sales"."opportunity_criterion_tick";--> statement-breakpoint
DROP TABLE "sales"."stage_criterion";
