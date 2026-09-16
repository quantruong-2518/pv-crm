-- 0036 - the six lead motions get somewhere to declare themselves.
--
-- `LeadMotion` is written at every intake door and then nothing downstream
-- reads it. `HANDOFF_SLA` is flat - two stages, three days each, identical for
-- all six - and its own comment admits what was lost: the documented targets
-- were in MINUTES and HOURS, and the frozen book only kept days. So inbound's
-- 30-minute target has been sitting in a fixture as "3 days" for months.
--
-- This table is where a motion stops being a label. Four columns, one per item
-- in the list of four things a motion must declare before it is behaviour
-- rather than a label.
--
-- EVERY COLUMN IS NULL, AND THAT IS THE POINT
-- Section 8.5 of the same document says the numbers do not exist yet and must
-- not be invented. A `DEFAULT 3` here would be exactly that invented number
-- wearing a schema as a disguise. NULL means "nobody has decided"; the screen
-- draws it as such, and a rule that finds one refuses to act rather than fall
-- back on something nobody agreed to.
--
-- Six rows, planted here, never created or deleted afterwards: `LEAD_MOTIONS`
-- is a closed list in `@pv/engines` and the reason is written beside it - an
-- "other" bucket would be the biggest row in the table within a quarter, and
-- then "which channel produces customers" stops being answerable.
--
-- The values are UPPER CASE because that is the stored spelling declared in
-- `@pv/contracts`. `@pv/engines` holds the same six in lower case and the web
-- app reads that one; the pair is the "enum declared twice" debt in
-- `docs/decisions/0012-rename-vietnamese-identifiers-in-six-batches.md`,
-- converted in exactly one place. This table stores the
-- stored form and opens no second conversion site.
CREATE TABLE "sales"."motion_policy" (
	"motion" text PRIMARY KEY NOT NULL,
	"first_touch_minutes" integer,
	"owner_role_id" text,
	"cold_mail_allowed" boolean,
	"self_serve_counts_as_init_data" boolean,
	CONSTRAINT "motion_policy_motion_known" CHECK ("motion" IN ('INBOUND', 'OUTBOUND', 'EVENT', 'REFERRAL', 'PARTNER', 'RECYCLE')),
	CONSTRAINT "motion_policy_role_known" CHECK ("owner_role_id" IS NULL OR "owner_role_id" IN ('director', 'head-of-sales', 'marketing', 'bd', 'presales', 'sale', 'account-executive')),
	CONSTRAINT "motion_policy_first_touch_sane" CHECK ("first_touch_minutes" IS NULL OR ("first_touch_minutes" > 0 AND "first_touch_minutes" <= 129600))
);
--> statement-breakpoint
INSERT INTO "sales"."motion_policy" ("motion") VALUES
	('INBOUND'), ('OUTBOUND'), ('EVENT'), ('REFERRAL'), ('PARTNER'), ('RECYCLE');
