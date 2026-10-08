-- 0086 - per-employee Google Calendar sync: `platform.google_link` and three
-- event columns on `sales.meeting`.
--
-- `google_link` is one row per actor (PK = actor_id) and CASCADEs with the
-- actor: it holds a credential, not history. `refresh_token_enc` is AES-GCM
-- ciphertext written by the app; the database cannot verify that and no CHECK
-- pretends to. `google_email` may differ from `actor.email`, so it is stored.
--
-- On `meeting` all three columns are NULLABLE with no default: every existing
-- row is simply "not synced". `google_owner_id` is whose calendar holds the
-- event (whose token can update or delete it) and SET NULLs with the actor, so
-- an event id may outlive its owner on purpose - no CHECK ties the two. No
-- index: nothing reads meetings by event or owner. Additive only.
--
-- Hand-written for 0047's reason: `generate`'s baseline is still stuck at 0026.
CREATE TABLE "platform"."google_link" (
	"actor_id" text PRIMARY KEY NOT NULL,
	"google_email" text NOT NULL,
	"refresh_token_enc" text NOT NULL,
	"scope" text NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "google_link_email_has_at" CHECK ("google_email" LIKE '%@%')
);--> statement-breakpoint
ALTER TABLE "platform"."google_link" ADD CONSTRAINT "google_link_actor_id_actor_id_fk" FOREIGN KEY ("actor_id") REFERENCES "platform"."actor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."meeting" ADD COLUMN "google_event_id" text;--> statement-breakpoint
ALTER TABLE "sales"."meeting" ADD COLUMN "google_event_url" text;--> statement-breakpoint
ALTER TABLE "sales"."meeting" ADD COLUMN "google_owner_id" text;--> statement-breakpoint
ALTER TABLE "sales"."meeting" ADD CONSTRAINT "meeting_google_owner_id_actor_id_fk" FOREIGN KEY ("google_owner_id") REFERENCES "platform"."actor"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales"."meeting" ADD CONSTRAINT "meeting_google_event_url_is_https" CHECK ("google_event_url" IS NULL OR "google_event_url" ~ '^https://');
