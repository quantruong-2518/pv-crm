-- 0170 - `sales.contract_credit` (ADR 0155): who shares the KPI credit of a contract, in
-- basis points. One row per (contract, person). share_bp is 1..10000, hand-written CHECK.
-- "Rows of a contract sum to 10000, at most 3 rows" is the service's check: a CHECK cannot
-- see sibling rows. Both FKs are real: every contract has its `sales.contract` row, and
-- credit goes to an existing actor.
-- Additive. ORDER: migrate BEFORE deploy - the old api never reads the table. Re-runnable:
-- IF NOT EXISTS, DROP ... IF EXISTS before ADD. Hand-written for 0047's reason.
-- The FKs take a lock on `sales.contract` and `platform.actor` that every writer queues
-- behind: give up after 10 s instead. Lasts to the migrator's commit (one transaction).
SET LOCAL lock_timeout = '10s';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sales"."contract_credit" (
	"contract_code" text NOT NULL,
	"actor_id" text NOT NULL,
	"share_bp" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contract_credit_pk" PRIMARY KEY("contract_code","actor_id")
);--> statement-breakpoint
ALTER TABLE "sales"."contract_credit" DROP CONSTRAINT IF EXISTS "contract_credit_contract_code_contract_code_fk";--> statement-breakpoint
ALTER TABLE "sales"."contract_credit" ADD CONSTRAINT "contract_credit_contract_code_contract_code_fk" FOREIGN KEY ("contract_code") REFERENCES "sales"."contract"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."contract_credit" DROP CONSTRAINT IF EXISTS "contract_credit_actor_id_actor_id_fk";--> statement-breakpoint
ALTER TABLE "sales"."contract_credit" ADD CONSTRAINT "contract_credit_actor_id_actor_id_fk" FOREIGN KEY ("actor_id") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."contract_credit" DROP CONSTRAINT IF EXISTS "contract_credit_share_range";--> statement-breakpoint
ALTER TABLE "sales"."contract_credit" ADD CONSTRAINT "contract_credit_share_range" CHECK ("share_bp" BETWEEN 1 AND 10000);--> statement-breakpoint
-- "Which contracts does this person hold credit on": the KPI sums per actor.
CREATE INDEX IF NOT EXISTS "contract_credit_actor_idx" ON "sales"."contract_credit" USING btree ("actor_id");
