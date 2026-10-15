-- 0106 - `platform.notification_kind_policy`: an admin's override of one
-- notification kind (ADR 0093 §1). No row = the contract's defaults.
--
-- It stores mutes, not grants, so a kind added later reaches everyone until
-- somebody mutes it. Locked kinds are refused by the API, not by a CHECK here:
-- that set is contract data. Both CHECK lists are copied by hand, from
-- `notification_kind_known` and `actor_role_ids_known`: a new kind or role is a
-- migration somebody reads. `updated_by` is a real FK, like `setting`'s - only
-- a signed-in operator writes; it takes a brief lock on `platform.actor`.
-- `important` NULL = follow the contract default, so a saved mute does not
-- freeze importance. No index beyond the primary key: reads are one kind or every row (one per kind).
--
-- A new table and nothing else, so migrate-then-deploy is safe; the new code
-- must not read it before this has run.
-- Hand-written for 0047's reason: `generate`'s baseline is still stuck at 0026.
CREATE TABLE "platform"."notification_kind_policy" (
	"kind" text PRIMARY KEY NOT NULL,
	"important" boolean,
	"muted_role_ids" text[] DEFAULT '{}' NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_kind_policy_kind_known" CHECK ("kind" IN ('lead-pooled', 'lead-received', 'lead-removed', 'lead-re-entered', 'lead-stopped', 'lead-scan-ready', 'lead-scan-committed', 'lead-scan-failed', 'opportunity-awaiting-accept', 'opportunity-lost', 'opportunity-accepted', 'opportunity-assigned', 'opportunity-unassigned', 'next-step-assigned', 'next-step-done', 'approval-waiting', 'approval-approved', 'approval-rejected', 'mail-run-sent', 'mail-run-cancelled', 'mail-failed', 'customer-replied', 'access-changed', 'password-reset-by-admin', 'google-link-broken')),
	CONSTRAINT "notification_kind_policy_muted_roles_known" CHECK ("muted_role_ids" <@ ARRAY['director', 'head-of-sales', 'marketing', 'bd', 'presales', 'sale', 'account-executive']::text[])
);--> statement-breakpoint
ALTER TABLE "platform"."notification_kind_policy" ADD CONSTRAINT "notification_kind_policy_updated_by_actor_id_fk" FOREIGN KEY ("updated_by") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;
