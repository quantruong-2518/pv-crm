-- 0043 - the conversation book itself: `comms.thread`, `comms.message`,
-- `comms.message_party`, `comms.link`, on top of the `comms.identity` spine
-- turn 0 shipped in `0040`.
--
-- FOUR TABLES, NOT ONE. `thread` is split from `message` because "how many turns
-- have we had, when was the last one" has to be answerable without reading a
-- single body (§3.1). `message_party` is a join table because a four-person
-- meeting does not fit in a `from`/`to` pair, and because a transcript needs to
-- say who spoke which line. `link` is a join table because one mail chain hangs
-- on the lead, the account it grew into and the opportunity it is about at once
-- - a column would force a second copy of the conversation, and the second copy
-- drifts from the first.
--
-- MANUAL CAPTURE ONLY THIS TURN. `external_id` and `capture_source` carry room
-- for turn 2's sync and webhook doors and turn 5's upload door; nothing writes
-- anything but `'manual'` and NULL yet. The columns exist now so the CHECK
-- constraints do not have to widen the day those doors ship - the same argument
-- `CommsChannel` made for carrying `'phone'` before anything travelled through
-- it.
--
-- Every CHECK below is copied out by hand from `packages/contracts/src/comms/
-- thread.ts`, character for character, not generated. The day an enum grows,
-- that has to be a migration a person reads.
--
-- WHERE `ON DELETE CASCADE` IS AND WHERE IT IS NOT, stated once because the two
-- halves look alike and are not. Down the CONTAINMENT chain - thread owns its
-- messages, a message owns its parties, a thread owns its links - CASCADE is
-- right: none of those rows has meaning apart from its parent, and leaving them
-- behind produces rows no query can reach. That is the shape
-- `meeting_attendee.meeting_id` already uses. Sideways, into `comms.identity`
-- and into `platform.object`, there is NO cascade: an identity is a person's
-- address and an object is a deal, and deleting either must not take the record
-- of what was said with it. That is the shape `meeting.lead_code` already uses,
-- and a refused delete is the correct noise here - loudly wrong beats quietly
-- gone.
--
-- `comms.link.object_code` is the fence `0042` had to be written for. No row in
-- these four tables may point at a code with no `platform.object` row, which is
-- exactly the guarantee that did not exist for opportunity and contract codes
-- until the previous migration. (Named by KIND, not by prefix: the contract
-- book's prefix is spelled with a Vietnamese letter, and writing it here trips
-- the English-comments rule. Writing a plain ASCII `D` instead - which an
-- earlier draft did - spells a code that does not exist, which is worse than
-- saying nothing. Do not retry that fix.)
CREATE TABLE "comms"."thread" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" text NOT NULL,
	-- The wire's own id for this conversation - an email `Message-ID`, a chat
	-- platform's conversation id. NULL on every row this turn writes: manual
	-- capture has no wire to read an id off of.
	"external_id" text,
	-- NULL is ordinary, not missing data: a phone call has no subject line.
	"subject" text,
	-- When the FIRST turn happened, not when the row was minted. No
	-- `DEFAULT now()`: writing a conversation down after the fact is the normal
	-- path of this table, and a silent default would turn yesterday's call into
	-- today's at exactly the column the reporting section counts - the trap
	-- `meeting.at` documents.
	"started_at" timestamp with time zone NOT NULL,
	-- A copy of `MAX(message.at)`, and the one denormalisation kept here: the
	-- thread list sorts by it, and sorting a list by a per-row subquery is the
	-- one read that has to stay cheap. Bumped in the same transaction that
	-- appends a message.
	"last_at" timestamp with time zone NOT NULL,
	"state" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	-- THE FENCE THAT MAKES TURN 2'S SYNC DOOR IDEMPOTENT: re-pulling the same
	-- mailbox a third time lands on the same row instead of a third copy.
	--
	-- The easy thing to get wrong, so it is written down: Postgres treats every
	-- NULL as DISTINCT from every other NULL under a unique index. This does not
	-- collapse the many manually-captured threads that all leave `external_id`
	-- empty - they sit side by side without colliding. The constraint only bites
	-- once a door actually reads an id off the wire.
	CONSTRAINT "thread_channel_external_unique" UNIQUE("channel","external_id"),
	-- The five members of `CommsChannel`, same list as `identity_channel_known`.
	CONSTRAINT "thread_channel_known" CHECK ("channel" IN ('email', 'zalo-oa', 'telegram', 'phone', 'in-app')),
	CONSTRAINT "thread_state_known" CHECK ("state" IN ('open', 'archived')),
	-- An empty string is neither a missing subject nor an empty external id - it
	-- is a value that reads as present and matches nothing. NULL says "none";
	-- this keeps two states from becoming three.
	CONSTRAINT "thread_no_blank" CHECK (("subject" IS NULL OR "subject" <> '') AND ("external_id" IS NULL OR "external_id" <> '')),
	-- A thread whose last turn predates its first is a row no timeline can draw.
	-- One turn makes the two equal, hence `>=` and not `>`.
	CONSTRAINT "thread_span_forward" CHECK ("last_at" >= "started_at")
);
--> statement-breakpoint
CREATE TABLE "comms"."message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"direction" text NOT NULL,
	-- The one identity treated as the primary sender. NOT NULL because a turn
	-- with no sender is not a turn: an address that matched nobody never reaches
	-- this table, it goes to the unmatched queue (§5a). `message_party` carries
	-- everyone else who was on the call or in the room.
	"from_identity_id" uuid NOT NULL,
	-- NULL means the turn carries no text - a call logged with only a duration.
	-- That is the contract's `content.state = 'none'`. The OTHER absence,
	-- `'hidden'`, is produced by the reader's permission at read time and is
	-- never a stored value.
	"body_text" text,
	-- How long a call or a meeting ran; NULL for a written message, where the
	-- question does not apply. Metadata rather than content, so `comm.view`
	-- alone sees it: a duration says nothing about what was said.
	"duration_sec" integer,
	-- Which door wrote the row. Server-set, never client-set - only `'manual'`
	-- is reachable this turn and the server is the one place that fact can be
	-- trusted.
	"capture_source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_direction_known" CHECK ("direction" IN ('in', 'out')),
	-- The four members of `CaptureSource`. Three have no writer until turns 2
	-- and 5; listed now so the fence does not widen the day those doors ship.
	CONSTRAINT "message_capture_source_known" CHECK ("capture_source" IN ('manual', 'sync', 'webhook', 'upload')),
	-- An empty body would be a third state beside "no text" and "withheld", and
	-- `MessageContent` in the contract has room for exactly two.
	CONSTRAINT "message_body_not_blank" CHECK ("body_text" IS NULL OR "body_text" <> ''),
	-- A negative duration is a call that ran backwards. Zero stays legal: a call
	-- that rang and was not picked up is still a turn worth logging.
	CONSTRAINT "message_duration_nonneg" CHECK ("duration_sec" IS NULL OR "duration_sec" >= 0)
);
--> statement-breakpoint
CREATE TABLE "comms"."message_party" (
	"message_id" uuid NOT NULL,
	"identity_id" uuid NOT NULL,
	"role" text NOT NULL,
	-- THE TRIPLE IS THE KEY, and there is no surrogate `id`. The row has no
	-- identity of its own to name: it IS the fact "this person was on this turn
	-- in this role", and a surrogate key would let the same fact be written
	-- twice with nothing refusing it. `role` is INSIDE the key because one
	-- person can genuinely hold two - the sender of a letter is also a
	-- `'speaker'` on its transcript - and a two-column key would make the second
	-- fact impossible to write at all.
	CONSTRAINT "message_party_pk" PRIMARY KEY("message_id","identity_id","role"),
	-- The four members of `MessagePartyRole`. `'speaker'` has no writer before
	-- turn 5's transcript door, listed now for `capture_source`'s reason.
	CONSTRAINT "message_party_role_known" CHECK ("role" IN ('from', 'to', 'cc', 'speaker'))
);
--> statement-breakpoint
CREATE TABLE "comms"."link" (
	"thread_id" uuid NOT NULL,
	"object_code" text NOT NULL,
	"linked_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	-- THE PAIR IS THE KEY. Same reasoning as `message_party` above, plus one
	-- more: it makes "attach the same thread to the same object twice" a refused
	-- write rather than a duplicate chip on a screen. `linked_by` stays OUT of
	-- the key - a link inferred by turn 2's resolver and then confirmed by a
	-- person is the SAME link, and a key holding it would let both spellings sit
	-- there as two rows.
	CONSTRAINT "link_pk" PRIMARY KEY("thread_id","object_code"),
	CONSTRAINT "link_linked_by_known" CHECK ("linked_by" IN ('auto', 'human'))
);
--> statement-breakpoint
-- CASCADE: a turn has no meaning apart from the conversation it is a turn OF,
-- the same relation `meeting_attendee` has to `meeting`.
ALTER TABLE "comms"."message" ADD CONSTRAINT "message_thread_id_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "comms"."thread"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- NO cascade, and this is the other half of the pair: an identity is a person's
-- address, and deleting an address must not take the history of what was said
-- through it. Merging two identities is an UPDATE here, not a delete.
ALTER TABLE "comms"."message" ADD CONSTRAINT "message_from_identity_id_identity_id_fk" FOREIGN KEY ("from_identity_id") REFERENCES "comms"."identity"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- CASCADE, one level down from the message for the same containment reason.
ALTER TABLE "comms"."message_party" ADD CONSTRAINT "message_party_message_id_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "comms"."message"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- NO cascade, same call as `message.from_identity_id`: deleting an address must
-- not quietly rewrite who was in the room.
ALTER TABLE "comms"."message_party" ADD CONSTRAINT "message_party_identity_id_identity_id_fk" FOREIGN KEY ("identity_id") REFERENCES "comms"."identity"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- CASCADE: a link to a thread that no longer exists points at nothing.
ALTER TABLE "comms"."link" ADD CONSTRAINT "link_thread_id_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "comms"."thread"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- The fence §3.2 promised and the reason `0042` exists. NO cascade: an object
-- row disappearing must not silently take the record of the conversations about
-- it - especially while `ContactService.drop()` still leaves mirror rows behind
-- with no delete path at all (§19, tail).
ALTER TABLE "comms"."link" ADD CONSTRAINT "link_object_code_object_code_fk" FOREIGN KEY ("object_code") REFERENCES "platform"."object"("code") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- "The turns of thread X, newest first" - the one question the message list
-- asks, on every open of a thread. Both columns in that order so the read needs
-- no sort pass, the shape `touch_subject_idx` uses.
--
-- No index on `from_identity_id` and none on `message_party.identity_id`:
-- "everything this person ever said" is nobody's question in turn 1, and an
-- index with no question is a cost on every insert. Whoever builds that screen
-- adds the index in the same migration as the question.
CREATE INDEX "message_thread_idx" ON "comms"."message" USING btree ("thread_id","at" DESC);
--> statement-breakpoint
-- "Which threads hang on object Y" - what the timeline of a lead, an account or
-- an opportunity asks every time it draws. The primary key above answers the
-- MIRROR question ("which objects is thread X on") and cannot answer this one:
-- its leading column is the wrong end.
CREATE INDEX "link_object_idx" ON "comms"."link" USING btree ("object_code");
