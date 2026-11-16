-- 0174 - `platform.assistant_proposal`: one card the assistant proposed and the asker may press
-- (ADR 0162). Both parents cascade (message, tool call) and so does the actor FK, mirroring
-- `assistant_message.actor_id`: NO ACTION would refuse an actor delete before the session's
-- cascade reached the row. `tool_call_id` is UNIQUE: one card per tool call. `state` never
-- holds `expired` - that is `pending` past `expires_at`, read at query time. `touch_kind_known`
-- gains `assistant-applied` (0173's thirty plus one: thirty-one): the history mark the press
-- writes. `AssistantProposalAction` and `TouchKind` in @pv/contracts must carry exactly these
-- values; widen both together. Lists copied by hand.
-- No permission grant here: the seeder plants new permissions at boot.
-- Additive: a new table and one wider list; every existing touch row stays valid.
-- ORDER: migrate BEFORE deploy - the new api writes both; the old api never names either.
-- Re-runnable: IF NOT EXISTS, DROP ... IF EXISTS before ADD. Hand-written for 0047's reason:
-- `generate`'s baseline is stuck at 0026.
-- The FKs take locks on `assistant_message`, `assistant_tool_call` and `actor` that every writer
-- queues behind, and the touch ADD scans its table: give up after 10 s instead. Lasts to the
-- migrator's commit (one transaction).
SET LOCAL lock_timeout = '10s';--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "platform"."assistant_proposal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"tool_call_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"subject_kind" text NOT NULL,
	"subject_code" text NOT NULL,
	"action" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"body" jsonb NOT NULL,
	"reason" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "platform"."assistant_proposal" DROP CONSTRAINT IF EXISTS "assistant_proposal_message_id_assistant_message_id_fk";--> statement-breakpoint
ALTER TABLE "platform"."assistant_proposal" ADD CONSTRAINT "assistant_proposal_message_id_assistant_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "platform"."assistant_message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."assistant_proposal" DROP CONSTRAINT IF EXISTS "assistant_proposal_tool_call_id_assistant_tool_call_id_fk";--> statement-breakpoint
ALTER TABLE "platform"."assistant_proposal" ADD CONSTRAINT "assistant_proposal_tool_call_id_assistant_tool_call_id_fk" FOREIGN KEY ("tool_call_id") REFERENCES "platform"."assistant_tool_call"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform"."assistant_proposal" DROP CONSTRAINT IF EXISTS "assistant_proposal_actor_id_actor_id_fk";--> statement-breakpoint
ALTER TABLE "platform"."assistant_proposal" ADD CONSTRAINT "assistant_proposal_actor_id_actor_id_fk" FOREIGN KEY ("actor_id") REFERENCES "platform"."actor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "platform"."assistant_proposal" DROP CONSTRAINT IF EXISTS "assistant_proposal_tool_call_uq";--> statement-breakpoint
ALTER TABLE "platform"."assistant_proposal" ADD CONSTRAINT "assistant_proposal_tool_call_uq" UNIQUE ("tool_call_id");--> statement-breakpoint
ALTER TABLE "platform"."assistant_proposal" DROP CONSTRAINT IF EXISTS "assistant_proposal_subject_kind_known";--> statement-breakpoint
ALTER TABLE "platform"."assistant_proposal" ADD CONSTRAINT "assistant_proposal_subject_kind_known" CHECK ("subject_kind" IN ('lead', 'opportunity'));--> statement-breakpoint
ALTER TABLE "platform"."assistant_proposal" DROP CONSTRAINT IF EXISTS "assistant_proposal_action_known";--> statement-breakpoint
ALTER TABLE "platform"."assistant_proposal" ADD CONSTRAINT "assistant_proposal_action_known" CHECK ("action" IN ('next-step-set', 'next-step-done'));--> statement-breakpoint
ALTER TABLE "platform"."assistant_proposal" DROP CONSTRAINT IF EXISTS "assistant_proposal_state_known";--> statement-breakpoint
ALTER TABLE "platform"."assistant_proposal" ADD CONSTRAINT "assistant_proposal_state_known" CHECK ("state" IN ('pending', 'applied', 'dismissed', 'stale'));--> statement-breakpoint
ALTER TABLE "platform"."assistant_proposal" DROP CONSTRAINT IF EXISTS "assistant_proposal_body_is_object";--> statement-breakpoint
ALTER TABLE "platform"."assistant_proposal" ADD CONSTRAINT "assistant_proposal_body_is_object" CHECK (jsonb_typeof("body") = 'object');--> statement-breakpoint
ALTER TABLE "platform"."assistant_proposal" DROP CONSTRAINT IF EXISTS "assistant_proposal_reason_length";--> statement-breakpoint
ALTER TABLE "platform"."assistant_proposal" ADD CONSTRAINT "assistant_proposal_reason_length" CHECK (char_length("reason") BETWEEN 1 AND 200);--> statement-breakpoint
ALTER TABLE "platform"."assistant_proposal" DROP CONSTRAINT IF EXISTS "assistant_proposal_decided_pair";--> statement-breakpoint
ALTER TABLE "platform"."assistant_proposal" ADD CONSTRAINT "assistant_proposal_decided_pair" CHECK (("state" = 'pending') = ("decided_at" IS NULL));--> statement-breakpoint

-- "Which cards sit under these answers": the chat reload.
CREATE INDEX IF NOT EXISTS "assistant_proposal_message_idx" ON "platform"."assistant_proposal" USING btree ("message_id");--> statement-breakpoint

ALTER TABLE "sales"."touch" DROP CONSTRAINT IF EXISTS "touch_kind_known";--> statement-breakpoint
ALTER TABLE "sales"."touch" ADD CONSTRAINT "touch_kind_known" CHECK ("kind" IN ('created', 'contacted', 'field-filled', 'handed-over', 'tier-raised', 'care-planned', 'exchange-logged', 'first-action', 'verified', 'nurtured', 'resumed', 'archived', 'first-meeting', 'entered-pipeline', 'stage-changed', 'signed', 'exited', 'reopened', 'sample-sent', 'poc-run', 'demo-held', 'site-visited', 'quotation-sent', 'care-left', 'next-step-done', 'mail-failed', 'mail-sync-failed', 're-entered', 'customer-replied', 'solution-sent', 'assistant-applied'));
