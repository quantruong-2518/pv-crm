-- 0042 - `sales.opportunity.code` and `sales.contract.code` stop being mirror
-- rows by DISCIPLINE and become mirror rows by FENCE.
--
-- Both already have a `platform.object` row written beside them by
-- `ObjectMirror`, and have had since the day each table shipped. What neither
-- had is a constraint saying so, which is why `sales.touch.subject_code` carries
-- no foreign key and says so in its docblock: a fence built on somebody else's
-- discipline is a write refused for a reason the writer cannot fix.
--
-- `comms.link.object_code` in the next migration is the writer that makes this
-- due. It points at `platform.object` for real, so every code it may hold has to
-- be guaranteed present - and turn 0 wrote that guarantee down as a restriction
-- (`comms.identity` may not point at an `OP-` or `HD-` code) precisely because
-- this debt was still open. This migration closes it; the restriction lifts in
-- `link.service`, not here.
--
-- WHY THE COUNT RUNS FIRST AND CHANGES NOTHING. Neon holds real data and no code
-- path can prove every historical row has a mirror - the four write paths do
-- today (§19.1), but history is not a code path. The `RAISE NOTICE` below prints
-- the debt into the migration log before anything is altered, so an operator
-- reading a failed `VALIDATE` further down already has the number that explains
-- it. It is deliberately not a `RAISE EXCEPTION`: a count is information, and
-- the two steps below are the ones allowed to refuse.
--
-- WHY `VALIDATE` IS IN A FILE OF ITS OWN, NOT TWO STATEMENTS DOWN (§19.4).
-- `NOT VALID` fences every FUTURE write immediately, without scanning the table
-- and without taking the lock a full check needs. `VALIDATE CONSTRAINT` is the
-- separate pass over the past, and it lives in `0044`.
--
-- Two statements in ONE file would not have bought the split at all, and that
-- correction is worth writing down because the first draft of this file got it
-- wrong: `drizzle-kit migrate` wraps each migration file in a transaction, so a
-- failing `VALIDATE` would roll the `ADD` back with it and the fence would not
-- be up for anything. The only way a failed check over history can leave the
-- fence standing for new rows is for the two to commit separately.
--
-- ONE PRECONDITION, ALREADY MET, NAMED HERE SO IT IS NOT RE-DISCOVERED:
-- `OpportunityService.sign()` used to write the contract row BEFORE its own
-- mirror row, and Postgres checks foreign keys per STATEMENT rather than at
-- commit, so that order would have started failing the moment the fence below
-- went up - inside a transaction that looked correct. Fixed 15/09, before this
-- file was written.
DO $$
DECLARE
	opportunity_orphans bigint;
	contract_orphans bigint;
BEGIN
	SELECT count(*) INTO opportunity_orphans
	FROM "sales"."opportunity" o
	WHERE NOT EXISTS (SELECT 1 FROM "platform"."object" p WHERE p."code" = o."code");

	SELECT count(*) INTO contract_orphans
	FROM "sales"."contract" c
	WHERE NOT EXISTS (SELECT 1 FROM "platform"."object" p WHERE p."code" = c."code");

	RAISE NOTICE 'mirror-row debt before 0042: opportunity rows with no platform.object row = %, contract rows with no platform.object row = %', opportunity_orphans, contract_orphans;
END $$;
--> statement-breakpoint
ALTER TABLE "sales"."opportunity" ADD CONSTRAINT "opportunity_code_object_code_fk" FOREIGN KEY ("code") REFERENCES "platform"."object"("code") ON DELETE no action ON UPDATE no action NOT VALID;
--> statement-breakpoint
ALTER TABLE "sales"."contract" ADD CONSTRAINT "contract_code_object_code_fk" FOREIGN KEY ("code") REFERENCES "platform"."object"("code") ON DELETE no action ON UPDATE no action NOT VALID;
