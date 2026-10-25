-- 0146 - termination penalty (ADR 0124): a terminated contract may carry ONE
-- penalty in ONE direction, pending until someone records the day money moved.
--
-- Columns on the termination row, not a child table: a termination happens once
-- (its key is the contract code), so its penalty is at most one too. All four
-- are nullable, so every row written before 0146 reads as "no penalty".
-- `penalty_settled_on` is a plain date: the calendar day the user says the money
-- moved (the read shape is a `Day`), which may be back-dated, never now().
-- The `pv_change_update` trigger (0128) already fans out any UPDATE of this
-- table, so no trigger changes here.
-- ORDER: migrate BEFORE deploy; the columns are nullable and the old build
-- never selects, writes or checks them.
-- Re-runnable: IF [NOT] EXISTS on DDL, constraints dropped then added. Hand-written for 0047's reason.
ALTER TABLE "sales"."contract_termination" ADD COLUMN IF NOT EXISTS "penalty_direction" text;--> statement-breakpoint
ALTER TABLE "sales"."contract_termination" ADD COLUMN IF NOT EXISTS "penalty_amount" bigint;--> statement-breakpoint
ALTER TABLE "sales"."contract_termination" ADD COLUMN IF NOT EXISTS "penalty_settled_on" date;--> statement-breakpoint
ALTER TABLE "sales"."contract_termination" ADD COLUMN IF NOT EXISTS "penalty_settled_by_id" text;--> statement-breakpoint

ALTER TABLE "sales"."contract_termination" DROP CONSTRAINT IF EXISTS "contract_termination_penalty_direction_known";--> statement-breakpoint
ALTER TABLE "sales"."contract_termination" ADD CONSTRAINT "contract_termination_penalty_direction_known" CHECK ("penalty_direction" IN ('customer-pays', 'company-pays'));--> statement-breakpoint
ALTER TABLE "sales"."contract_termination" DROP CONSTRAINT IF EXISTS "contract_termination_penalty_amount_positive";--> statement-breakpoint
ALTER TABLE "sales"."contract_termination" ADD CONSTRAINT "contract_termination_penalty_amount_positive" CHECK ("penalty_amount" > 0);--> statement-breakpoint
ALTER TABLE "sales"."contract_termination" DROP CONSTRAINT IF EXISTS "contract_termination_penalty_direction_amount";--> statement-breakpoint
ALTER TABLE "sales"."contract_termination" ADD CONSTRAINT "contract_termination_penalty_direction_amount" CHECK (("penalty_direction" IS NULL) = ("penalty_amount" IS NULL));--> statement-breakpoint
ALTER TABLE "sales"."contract_termination" DROP CONSTRAINT IF EXISTS "contract_termination_penalty_settled_pair";--> statement-breakpoint
ALTER TABLE "sales"."contract_termination" ADD CONSTRAINT "contract_termination_penalty_settled_pair" CHECK (("penalty_settled_on" IS NULL) = ("penalty_settled_by_id" IS NULL));--> statement-breakpoint
ALTER TABLE "sales"."contract_termination" DROP CONSTRAINT IF EXISTS "contract_termination_penalty_settled_needs_penalty";--> statement-breakpoint
ALTER TABLE "sales"."contract_termination" ADD CONSTRAINT "contract_termination_penalty_settled_needs_penalty" CHECK ("penalty_settled_on" IS NULL OR "penalty_direction" IS NOT NULL);--> statement-breakpoint

ALTER TABLE "sales"."contract_termination" DROP CONSTRAINT IF EXISTS "contract_termination_penalty_settled_by_id_actor_id_fk";--> statement-breakpoint
ALTER TABLE "sales"."contract_termination" ADD CONSTRAINT "contract_termination_penalty_settled_by_id_actor_id_fk" FOREIGN KEY ("penalty_settled_by_id") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;
