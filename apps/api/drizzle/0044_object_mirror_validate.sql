-- 0044 - the pass over the past that `0042` deliberately left undone.
--
-- `0042` put the two foreign keys up as `NOT VALID`: every write from that
-- moment on is fenced, and nothing was scanned. This file is the scan.
--
-- IT IS A SEPARATE FILE BECAUSE A SEPARATE FILE IS A SEPARATE TRANSACTION.
-- `drizzle-kit migrate` wraps one file in one transaction, so a `VALIDATE` that
-- fails here rolls back only itself - the fences from `0042` stay up, and the
-- product keeps refusing new orphans while somebody goes and cleans the old
-- ones. Put the two together and a dirty row from 2026 would take the fence
-- down with it.
--
-- IF THIS FILE FAILS, THAT IS INFORMATION, NOT A DISASTER. It means rows exist
-- whose code has no `platform.object` mirror row - the count printed by the
-- `DO` block at the top of `0042` says how many. Fix those rows, then run this
-- file again; it is idempotent, because validating an already-valid constraint
-- is a no-op.
ALTER TABLE "sales"."opportunity" VALIDATE CONSTRAINT "opportunity_code_object_code_fk";
--> statement-breakpoint
ALTER TABLE "sales"."contract" VALIDATE CONSTRAINT "contract_code_object_code_fk";
