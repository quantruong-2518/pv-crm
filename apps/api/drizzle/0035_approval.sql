-- 0035 - E3 gets a place to keep what it is holding.
--
-- Until now `createApprovalEngine()` kept pending requests in a `Map` that dies
-- with the process, which is why `config.approval.ts` refuses out loud instead
-- of answering 202: a promise the system cannot keep is worse than no promise.
-- These two tables are that place.
--
-- `platform`, not `sales`. An older note called this table `sales.approval`,
-- written when Sales was the only branch with anything to approve. Nine of the
-- eleven pipelines end at a person saying yes, and a branch-local table would
-- mean a purchase order approved through different machinery than a discount -
-- the exact thing one inbox exists to prevent.
--
-- `payload` is the branch's own description of the change and is opaque here:
-- Sales puts a `ConfigChange` in it, Supply will put something else. What the
-- platform insists on instead is `consequence` - a sentence, written when the
-- request is raised, that says what happens if it is approved, so somebody can
-- decide without a screen decoding a payload it does not own.
--
-- The chain is a column rather than a child table: it is read whole, decided
-- whole and written whole by `decideOn` in `@pv/engines`. The only query that
-- looks inside asks "what is waiting on this person", which is a containment
-- test - hence the GIN index rather than a join.
--
-- `approval_link` is a table and not a column because zero is a normal answer:
-- a change to the sales vocabulary touches no object at all, a discount touches
-- one deal, a batch action could touch several. A column would have forced the
-- first case to invent an object to point at.
CREATE TABLE "platform"."approval" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"state" text DEFAULT 'waiting' NOT NULL,
	"raised_by_id" text NOT NULL,
	"raised_by" text NOT NULL,
	"raised_at" timestamp with time zone DEFAULT now() NOT NULL,
	"from_ai" boolean DEFAULT false NOT NULL,
	"basis" text,
	"consequence" text NOT NULL,
	"payload" jsonb NOT NULL,
	"chain" jsonb NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by" text,
	"decided_reason" text,
	CONSTRAINT "approval_state_known" CHECK ("state" IN ('waiting', 'approved', 'rejected')),
	CONSTRAINT "approval_kind_known" CHECK ("kind" IN ('config-change')),
	CONSTRAINT "approval_ai_has_basis" CHECK ("from_ai" = false OR "basis" IS NOT NULL),
	CONSTRAINT "approval_decided_when_settled" CHECK (("state" = 'waiting') = ("decided_at" IS NULL AND "decided_by" IS NULL)),
	CONSTRAINT "approval_chain_not_empty" CHECK (jsonb_array_length("chain") > 0),
	CONSTRAINT "approval_reason_only_on_refusal" CHECK (("state" = 'rejected') = ("decided_reason" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "platform"."approval_link" (
	"request_id" uuid NOT NULL,
	"object_code" text NOT NULL,
	"object_label" text NOT NULL,
	CONSTRAINT "approval_link_pk" PRIMARY KEY("request_id","object_code")
);
--> statement-breakpoint
ALTER TABLE "platform"."approval" ADD CONSTRAINT "approval_raised_by_id_actor_id_fk" FOREIGN KEY ("raised_by_id") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."approval_link" ADD CONSTRAINT "approval_link_request_id_approval_id_fk" FOREIGN KEY ("request_id") REFERENCES "platform"."approval"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."approval_link" ADD CONSTRAINT "approval_link_object_code_object_code_fk" FOREIGN KEY ("object_code") REFERENCES "platform"."object"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approval_waiting_idx" ON "platform"."approval" USING btree ("raised_at" DESC NULLS LAST) WHERE "state" = 'waiting';--> statement-breakpoint
CREATE INDEX "approval_chain_idx" ON "platform"."approval" USING gin ("chain");--> statement-breakpoint
CREATE INDEX "approval_link_object_idx" ON "platform"."approval_link" USING btree ("object_code");
