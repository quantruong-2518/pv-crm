-- 0066 - the next step (`NextStep` in `@pv/contracts`): at most ONE per lead
-- or deal, so the subject code is the primary key. Clearing deletes the row;
-- what was done lives on as a `next-step-done` touch.
--
-- `subject_code` references `platform.object` for real: leads (0002, ADR 0043)
-- and deals (0042/0044) are fenced to their mirror rows, so no legitimate write
-- can land on a code without one. `doer_id` stores the id only - the name is
-- joined at read, so a renamed person is renamed on every open step.
--
-- Every CHECK is copied by hand: the day a third subject prefix or a new touch
-- kind appears, that has to be a migration a person reads.
--
-- Hand-written for 0047-0065's reason: `generate`'s baseline is stuck at 0026.
CREATE TABLE "sales"."next_step" (
	"subject_code" text PRIMARY KEY NOT NULL,
	"text" text NOT NULL,
	"due" date NOT NULL,
	"doer_id" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "next_step_subject_known" CHECK ("subject_code" ~ '^(LD|OP)-[0-9]{4,}$'),
	CONSTRAINT "next_step_text_bounded" CHECK (btrim("text") <> '' AND char_length("text") <= 200)
);--> statement-breakpoint
ALTER TABLE "sales"."next_step" ADD CONSTRAINT "next_step_subject_code_object_code_fk" FOREIGN KEY ("subject_code") REFERENCES "platform"."object"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."next_step" ADD CONSTRAINT "next_step_doer_id_actor_id_fk" FOREIGN KEY ("doer_id") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."next_step" ADD CONSTRAINT "next_step_created_by_actor_id_fk" FOREIGN KEY ("created_by") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- Twenty-four kinds now: 0061's list plus `next-step-done`, written by the
-- "done" door in the same transaction that replaces or deletes the step.
ALTER TABLE "sales"."touch" DROP CONSTRAINT "touch_kind_known";--> statement-breakpoint
ALTER TABLE "sales"."touch" ADD CONSTRAINT "touch_kind_known" CHECK ("kind" IN ('created', 'contacted', 'field-filled', 'handed-over', 'tier-raised',
                     'care-planned', 'exchange-logged', 'first-action', 'verified',
                     'nurtured', 'resumed', 'archived', 'first-meeting',
                     'entered-pipeline', 'stage-changed', 'signed', 'exited',
                     'reopened', 'sample-sent', 'poc-run', 'quotation-sent',
                     'care-entered', 'care-left', 'next-step-done'));
