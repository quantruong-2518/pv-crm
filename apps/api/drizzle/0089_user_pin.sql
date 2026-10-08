-- 0089 - server-side pins: `platform.user_pin`, one row per (actor, kind, code).
--
-- Private to the actor: every read filters by `actor_id`. CASCADEs with the
-- actor - a pin is a preference, not history. `code` is polymorphic (LD-/OP-)
-- and has NO foreign key, for `sales.touch.subject_code`'s reason. The CHECK
-- on `subject_type` is copied by hand from `PinSubject`. The index answers
-- "my pins of this kind, newest first"; the primary key answers "is this code
-- pinned by me". New table only - nothing existing changes.
--
-- Hand-written for 0047's reason: `generate`'s baseline is still stuck at 0026.
CREATE TABLE "platform"."user_pin" (
	"actor_id" text NOT NULL,
	"subject_type" text NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_pin_actor_id_subject_type_code_pk" PRIMARY KEY("actor_id","subject_type","code"),
	CONSTRAINT "user_pin_subject_type_known" CHECK ("subject_type" IN ('lead', 'opportunity'))
);--> statement-breakpoint
ALTER TABLE "platform"."user_pin" ADD CONSTRAINT "user_pin_actor_id_actor_id_fk" FOREIGN KEY ("actor_id") REFERENCES "platform"."actor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_pin_actor_recent_idx" ON "platform"."user_pin" USING btree ("actor_id","subject_type","created_at" DESC NULLS LAST);
