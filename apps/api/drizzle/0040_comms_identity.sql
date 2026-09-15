-- 0040 - `comms.identity`, the table that says which person an address is, and
-- the first real fence under a guest attendee's name.
--
-- One migration for two tables because they are one decision seen twice: both
-- are about naming the person on the OTHER side of a conversation, and both are
-- only writable now because `sales.contact` turned out to be a real table with
-- a real foreign key into `platform.object` (precondition pass, 14/09).
--
-- A SCHEMA OF ITS OWN. `comms` sits beside `platform` and `sales`, not inside
-- either. This repo splits schemas by domain rather than by tier, and a
-- conversation book is not the property of Sales - the day Supply exists, mail
-- with a supplier is this same table, not a copy of it.
--
-- THE GUEST HALF POINTS AT `platform.object`. Customer email lives in two
-- places that do not agree: `sales.lead.email` is where MAS actually sends,
-- `sales.contact.email` is a book of several people per lead that no send
-- reads. A `contact_code` column here would miss exactly the address every
-- letter already travels to. `platform.object` covers lead, account and contact
-- with ONE foreign key, and it is a fence that holds - all three carry a real
-- foreign key into it. Opportunity and contract do NOT (mirror row by
-- discipline, no constraint), which is why nothing may point at an `OP-` or
-- `HD-` code until turn 1 pays that debt: a foreign key onto somebody else's
-- discipline is a write refused for a reason the writer cannot fix.
--
-- Every CHECK below is copied out by hand, not generated. The day a sixth
-- channel is added, that has to be a migration a person reads.
CREATE SCHEMA IF NOT EXISTS "comms";
--> statement-breakpoint
CREATE TABLE "comms"."identity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" text NOT NULL,
	"address" text NOT NULL,
	"side" text NOT NULL,
	"actor_id" text,
	"object_code" text,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	-- A fence, not a lookup index: one address answering to two people is the
	-- root of every wrong count in the reporting section. It only holds if the
	-- address arrives normalised (lowercased mailbox, E.164 number) - two
	-- spellings of one mailbox are two rows this cannot see.
	CONSTRAINT "identity_channel_address_unique" UNIQUE("channel","address"),
	CONSTRAINT "identity_channel_known" CHECK ("channel" IN ('email', 'zalo-oa', 'telegram', 'phone', 'in-app')),
	-- The same pair `meeting_attendee.side` uses, deliberately.
	CONSTRAINT "identity_side_known" CHECK ("side" IN ('member', 'guest')),
	-- ONE constraint, not two. `side` is not a label that happens to agree with
	-- the columns, it IS the answer to which column is filled. Split in two, a
	-- row carrying both halves would satisfy each clause separately and the
	-- discriminated union in the contract would be a lie the table allows.
	CONSTRAINT "identity_one_side_only" CHECK (("side" = 'member' AND "actor_id" IS NOT NULL AND "object_code" IS NULL) OR ("side" = 'guest' AND "object_code" IS NOT NULL AND "actor_id" IS NULL)),
	CONSTRAINT "identity_no_blank" CHECK ("address" <> '')
);
--> statement-breakpoint
ALTER TABLE "comms"."identity" ADD CONSTRAINT "identity_actor_id_actor_id_fk" FOREIGN KEY ("actor_id") REFERENCES "platform"."actor"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "comms"."identity" ADD CONSTRAINT "identity_object_code_object_code_fk" FOREIGN KEY ("object_code") REFERENCES "platform"."object"("code") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- "Which addresses do we hold for this customer" - asked when resolving the
-- unmatched queue, so a second row is not minted for a person who already has
-- one. The member half gets no index: nothing in turn 0 asks "which addresses
-- are this colleague's", and an index with no question is a cost on every
-- insert. Whoever adds that screen adds the index in the same migration.
CREATE INDEX "identity_object_idx" ON "comms"."identity" USING btree ("object_code");
--> statement-breakpoint
-- `meeting_attendee.contact_code` - the guest attendee stops being a typed
-- string. Closes fix-later §2c, whose premise ("the customer side has no table
-- to point at") stopped being true on 28/08.
--
-- Nullable for ever, and `name` stays NOT NULL beside it: plenty of meetings
-- happen with somebody nobody has entered in the book, and requiring the link
-- would either block writing the meeting down or mint a junk contact row per
-- attendee. The typed path is an upgrade of the hand-typed one, not a
-- replacement.
--
-- The CHECK is safe to validate against existing rows - its left side is NULL
-- on every row written before this migration, so none can fail it (trap 2 of
-- `docs/ban-giao-tang-duyet-va-vi-tri.md` §2).
ALTER TABLE "sales"."meeting_attendee" ADD COLUMN "contact_code" text;
--> statement-breakpoint
ALTER TABLE "sales"."meeting_attendee" ADD CONSTRAINT "meeting_attendee_contact_code_contact_code_fk" FOREIGN KEY ("contact_code") REFERENCES "sales"."contact"("code") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- `sales.contact` is the CUSTOMER's book: a host carrying a contact code would
-- be one of ours filed as one of theirs, and `actor_id` is already the host's
-- identity. The mirror of `meeting_attendee_host_co_actor`.
ALTER TABLE "sales"."meeting_attendee" ADD CONSTRAINT "meeting_attendee_contact_only_guest" CHECK ("contact_code" IS NULL OR "side" = 'guest');
