import {
  check,
  index,
  integer,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type {
  CaptureSource,
  CommsChannel,
  IdentitySide,
  LinkedBy,
  MessageDirection,
  MessagePartyRole,
  ThreadState,
} from '@pv/contracts'
import { actor, objectRef } from '@api/platform/db/platform.schema'

/** Postgres schema of the `comms` module — the conversation book.
 *
 *  Its own schema, beside `platform` and `sales` rather than inside either.
 *  `platform` is the floor everything stands on (people, sessions, the object
 *  graph); `comms` stands ON that floor and owns a domain of its own, which is
 *  the same relationship `sales` has. This repo splits schemas by DOMAIN, not
 *  by tier, so a `platform.comms_identity` would have been the one table whose
 *  name carried its module inside it. */
export const comms = pgSchema('comms')

/** Which person a wire address belongs to — the spine of the module.
 *
 *  Without a row here an inbound letter connects to nobody: an address is the
 *  only thing a mail server, a Zalo webhook or a phone log hands us, and every
 *  comms count is a count of conversations with a PERSON.
 *
 *  ------------------------------------------------------------------
 *  THE GUEST HALF POINTS AT `platform.object`, NOT AT `sales.contact`
 *  ------------------------------------------------------------------
 *  Decided 14/09 after the precondition pass, and it reverses what §2 of the
 *  vision doc said first. Customer email lives in TWO places that do not agree:
 *  `sales.lead.email` is the address MAS actually sends to, while
 *  `sales.contact.email` is a book of several people per lead that no send
 *  reads. A `contact_code` column would therefore miss exactly the address
 *  every letter already travels to, and every MAS thread would land in the
 *  unmatched queue.
 *
 *  `platform.object` covers both with ONE foreign key instead of a polymorphic
 *  CHECK, and it is a fence that HOLDS — `lead.code`, `account.code` and
 *  `contact.code` each carry a real foreign key into it, so the mirror row is
 *  guaranteed for every code turn 0 can point at. That guarantee is the whole
 *  test: `touch.subject_code` has no foreign key precisely because the mirror
 *  row for an opportunity is discipline rather than a fence, and a foreign key
 *  onto discipline turns somebody else's debt into a refused write here.
 *  Opportunity and contract were that debt; turn 1 paid it in migration 0042,
 *  so an opportunity code or a contract code now stands on the same real
 *  foreign key the other three do, and the service-side prefix list that stood
 *  in for it while the debt was open has been removed.
 *
 *  Neither prefix is spelled out anywhere in this file, and that is not
 *  squeamishness: the contract book's prefix is not ASCII, and
 *  `aurora/comments-in-english` reads characters rather than meaning, so a
 *  comment quoting it is a red build. Earlier comments here dodged that by
 *  writing the prefix with a plain D, which is a code that does not exist.
 *  Naming the KIND instead is the spelling that is both legal and true.
 *
 *  ------------------------------------------------------------------
 *  `UNIQUE (channel, address)` IS A FENCE, NOT A LOOKUP INDEX
 *  ------------------------------------------------------------------
 *  One address answering to two people is the root of every wrong number in
 *  the reporting section — the same conversation counted against two customers.
 *  It follows that normalising (lowercased mailbox, E.164 number) has to happen
 *  BEFORE the row reaches this column, server-side and in one place; the
 *  contract's `identityAddress` docblock states that and forbids the web end
 *  from inventing a second normaliser. Two spellings of one mailbox are two
 *  rows this constraint cannot see. */
export const identity = comms.table(
  'identity',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** `$type` rather than a second spelling of the five members: the union
     *  lives in `contracts/src/comms/identity.ts` and the CHECK below is the
     *  only other place the values appear. A third copy here is the drift the
     *  CHECK exists to prevent. Same for `side`. */
    channel: text('channel').$type<CommsChannel>().notNull(),

    /** An email mailbox, an E.164 number, or a platform user id (Zalo,
     *  Telegram, in-app). One column for all three because `channel` already
     *  says which shape applies, and three nullable columns would need a CHECK
     *  to say the same thing. */
    address: text('address').notNull(),

    side: text('side').$type<IdentitySide>().notNull(),

    actorId: text('actor_id').references(() => actor.id),
    objectCode: text('object_code').references(() => objectRef.code),

    /** When somebody CONFIRMED this address is that person's. NULL is the
     *  normal state of a fresh row, not missing data: an address harvested from
     *  an inbound letter is a guess until a human resolves it. A mark rather
     *  than a boolean, the convention `disabled_at` and `closed_at` follow —
     *  the question asked of a verified identity is "since when". */
    verifiedAt: timestamp('verified_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /** "Who is this address" — the question every inbound message asks, and the
     *  anti-duplicate fence in the docblock above. One constraint serves both. */
    unique('identity_channel_address_unique').on(t.channel, t.address),
    /** "Which addresses do we hold for this customer" — asked when resolving
     *  the unmatched queue (so a second row is not minted for a person who
     *  already has one) and by the identity book's detail view.
     *
     *  The member half gets no index: nothing in turn 0 asks "which addresses
     *  are this colleague's", and the answer would be a handful of rows on a
     *  table read overwhelmingly by address. Whoever adds that screen adds the
     *  index in the same migration as the question. */
    index('identity_object_idx').on(t.objectCode),
    /** The five members of `CommsChannel`, copied out by hand rather than
     *  generated. The day a sixth channel is added, that has to be a migration
     *  somebody reads — a generated list would let the fence widen in a diff
     *  nobody opens. */
    check(
      'identity_channel_known',
      sql`"channel" IN ('email', 'zalo-oa', 'telegram', 'phone', 'in-app')`,
    ),
    /** The same pair `meeting_attendee.side` uses, deliberately: two meetings
     *  with one person must not become two vocabularies. */
    check('identity_side_known', sql`"side" IN ('member', 'guest')`),
    /** Exactly one half is filled, and WHICH half is what `side` means.
     *
     *  One constraint, not two, because the fact is one fact: `side` is not an
     *  independent label that happens to agree with the columns, it IS the
     *  answer to which column is filled. Split in two ("member implies an
     *  actor", "guest implies an object"), a row could still carry both halves
     *  and satisfy each clause separately — the discriminated union in
     *  `IdentityRow` would then be a lie the type states and the table allows. */
    check(
      'identity_one_side_only',
      sql`("side" = 'member' AND "actor_id" IS NOT NULL AND "object_code" IS NULL)
          OR ("side" = 'guest' AND "object_code" IS NOT NULL AND "actor_id" IS NULL)`,
    ),
    /** An empty address is a row that matches nothing and blocks the one
     *  (channel, '') slot for every future empty write. */
    check('identity_no_blank', sql`"address" <> ''`),
  ],
)

export type IdentityRowDb = typeof identity.$inferSelect
export type IdentityValues = typeof identity.$inferInsert

// ---------------------------------------------------------------------------
// TURN 1 - THE CONVERSATION BOOK ITSELF
// ---------------------------------------------------------------------------

/** One conversation on one channel. The header row: how many turns, when the
 *  last one landed, is it still open — all answerable without reading a single
 *  message body, which is the whole reason this is not one wide table.
 *
 *  ------------------------------------------------------------------
 *  NO `message_count` COLUMN, THOUGH `ThreadRow` HAS THE FIELD
 *  ------------------------------------------------------------------
 *  A counter here would be a second source for a fact `comms.message` already
 *  holds, and the two drift the first time a write half-fails or a row is
 *  deleted by hand. The contract's `messageCount` is computed at read time.
 *  It becomes a column the day a profile shows the count is too slow to count,
 *  and that day it needs a trigger or a job — not a column somebody remembers
 *  to bump.
 *
 *  ------------------------------------------------------------------
 *  NO OBJECT CODE HERE, AND NO CODE OF ITS OWN
 *  ------------------------------------------------------------------
 *  `comms.link` carries the object, as a table, because one mail chain hangs on
 *  a lead AND an account AND an opportunity at once (§3.1). And a thread mints
 *  no `XX-nnnn` code: a code is for something a person names out loud, a thread
 *  is what happened BETWEEN the things people name (§19.3). */
export const thread = comms.table(
  'thread',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    channel: text('channel').$type<CommsChannel>().notNull(),

    /** The wire's own id for this conversation — an email `Message-ID`, a chat
     *  platform's conversation id. NULL on every row turn 1 writes: manual
     *  capture has no wire to read an id off of. */
    externalId: text('external_id'),

    /** NULL is ordinary: a phone call has no subject line, and manual capture
     *  does not force one. */
    subject: text('subject'),

    /** When the FIRST turn happened, not when the row was minted. Manual
     *  capture is written after the fact by definition, so no `defaultNow()` —
     *  the same trap `meeting.at` refuses for the same reason. */
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),

    /** When the LAST turn happened. A copy of `MAX(message.at)`, and the one
     *  denormalisation this table keeps: the thread list sorts by it, and
     *  sorting a list by a subquery per row is the one read that has to stay
     *  cheap. The writer that appends a message bumps it in the same
     *  transaction. */
    lastAt: timestamp('last_at', { withTimezone: true }).notNull(),

    state: text('state').$type<ThreadState>().notNull().default('open'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /** The fence that makes turn 2's sync door idempotent: re-pulling the same
     *  mailbox a third time lands on the same row instead of a third copy.
     *
     *  THE EASY THING TO GET WRONG: Postgres treats every NULL as distinct from
     *  every other NULL under a unique index, so this does NOT collapse the
     *  many manually-captured threads that all leave `external_id` empty — they
     *  sit side by side without colliding. The constraint only bites once a
     *  door actually reads an id off the wire. */
    unique('thread_channel_external_unique').on(t.channel, t.externalId),
    /** The five members of `CommsChannel`, copied out by hand rather than
     *  generated — the same reason `identity_channel_known` is: the day a sixth
     *  channel exists that has to be a migration a person reads. */
    check(
      'thread_channel_known',
      sql`"channel" IN ('email', 'zalo-oa', 'telegram', 'phone', 'in-app')`,
    ),
    check('thread_state_known', sql`"state" IN ('open', 'archived')`),
    /** An empty string is not a missing subject and not an empty external id —
     *  it is a value that reads as present and matches nothing. NULL says
     *  "none"; this keeps the two from becoming three states. */
    check(
      'thread_no_blank',
      sql`("subject" IS NULL OR "subject" <> '') AND ("external_id" IS NULL OR "external_id" <> '')`,
    ),
    /** A thread whose last turn predates its first is a row no timeline can
     *  draw. A one-turn thread makes the two equal, hence `>=` and not `>`. */
    check('thread_span_forward', sql`"last_at" >= "started_at"`),
  ],
)

/** One turn inside a thread — a letter, a call, a chat line.
 *
 *  `body_text` sits here rather than in a side table even though §5b gates it
 *  behind a second permission: the gate is in the SELECT list of the read, not
 *  in the storage. Splitting it out would buy a join on every read to save a
 *  column on rows that mostly have one. */
export const message = comms.table(
  'message',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** CASCADE, and this is the half of the pair where it is right: a turn has
     *  no meaning apart from the conversation it is a turn OF, exactly the
     *  relation `meeting_attendee` has to `meeting`. Deleting a thread and
     *  leaving its messages behind produces rows no query can reach. */
    threadId: uuid('thread_id')
      .notNull()
      .references(() => thread.id, { onDelete: 'cascade' }),

    /** When the turn happened. No default, same as `thread.started_at`. */
    at: timestamp('at', { withTimezone: true }).notNull(),

    direction: text('direction').$type<MessageDirection>().notNull(),

    /** The one identity treated as the primary sender. No CASCADE, and that is
     *  the OTHER half of the pair: an identity is a person's address, and
     *  deleting an address must not take the history of what was said through
     *  it — the same call `meeting.lead_code` makes against `meeting_attendee`.
     *  A merge of two identities is an UPDATE here, not a delete.
     *
     *  NOT NULL because a turn with no sender is not a turn: an address that
     *  matched nobody never reaches this table, it goes to the unmatched queue
     *  (§5a). `parties` below carries everyone else. */
    fromIdentityId: uuid('from_identity_id')
      .notNull()
      .references(() => identity.id),

    /** NULL means the turn carries no text — a call logged with only a
     *  duration. That is the contract's `content.state === 'none'`; the OTHER
     *  absence, `'hidden'`, is a decision the reader's permission produces and
     *  never a stored value. */
    bodyText: text('body_text'),

    /** How long a call or a meeting ran. NULL for a written message, where the
     *  question does not apply. Metadata, not content: `comm.view` alone sees
     *  it, because a duration says nothing about what was said. */
    durationSec: integer('duration_sec'),

    /** Which door wrote the row. Server-set, never client-set: only `'manual'`
     *  is reachable this turn, and the server is the one place that fact can be
     *  trusted. */
    captureSource: text('capture_source').$type<CaptureSource>().notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /** "The turns of thread X, newest first" — the one question the message
     *  list asks, on every open of a thread. Both columns in that order so the
     *  read needs no sort pass, the shape `touch_subject_idx` uses. */
    index('message_thread_idx').on(t.threadId, t.at.desc()),
    check('message_direction_known', sql`"direction" IN ('in', 'out')`),
    /** The four members of `CaptureSource`. Three of them have no writer until
     *  turns 2 and 5; they are listed now so the fence does not have to widen
     *  the day those doors ship. */
    check(
      'message_capture_source_known',
      sql`"capture_source" IN ('manual', 'sync', 'webhook', 'upload')`,
    ),
    /** An empty body would be a third state beside "no text" and "withheld",
     *  and the contract's `MessageContent` only has room for two. */
    check('message_body_not_blank', sql`"body_text" IS NULL OR "body_text" <> ''`),
    /** A negative duration is a call that ran backwards. Zero is allowed: a
     *  call that rang and was not picked up is a turn worth logging. */
    check('message_duration_nonneg', sql`"duration_sec" IS NULL OR "duration_sec" >= 0`),
  ],
)

/** Everyone who was on one turn — the full list a single `from` column cannot
 *  hold, because a four-person meeting does not fit in two columns (§3.1).
 *
 *  THE PRIMARY KEY IS THE TRIPLE, not a surrogate `id`. The row has no identity
 *  of its own to name: it IS the fact "this person was on this turn in this
 *  role", and a surrogate key would let the same fact be written twice with
 *  nothing refusing it. `role` belongs in the key rather than outside it
 *  because one person can genuinely hold two — the sender of a letter is also a
 *  `'speaker'` on its transcript — and a two-column key would make the second
 *  fact impossible to write. */
export const messageParty = comms.table(
  'message_party',
  {
    /** CASCADE, for `message.thread_id`'s reason one level down: a party has no
     *  existence apart from the turn they were on. */
    messageId: uuid('message_id')
      .notNull()
      .references(() => message.id, { onDelete: 'cascade' }),

    /** No CASCADE, same call as `message.from_identity_id`: deleting an address
     *  must not quietly rewrite who was in the room. */
    identityId: uuid('identity_id')
      .notNull()
      .references(() => identity.id),

    role: text('role').$type<MessagePartyRole>().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.messageId, t.identityId, t.role] }),
    /** The four members of `MessagePartyRole`. `'speaker'` has no writer before
     *  turn 5's transcript door, and is listed now for the reason the unwritten
     *  members of `CaptureSource` are. */
    check('message_party_role_known', sql`"role" IN ('from', 'to', 'cc', 'speaker')`),
  ],
)

/** A thread hung on an object — a table, deliberately, not a column on
 *  `thread`.
 *
 *  One mail chain belongs to the lead, the account it grew into and the
 *  opportunity it is about, all at once; a column would force a copy of the
 *  conversation per object, and the second copy drifts from the first. This is
 *  the shape every large CRM lands on for the same reason (§3.1).
 *
 *  THE PRIMARY KEY IS THE PAIR. Like `message_party`, the row is the fact
 *  itself and has no separate identity; the pair also makes "attach the same
 *  thread to the same object twice" a refused write rather than a duplicate
 *  chip on a screen. `linked_by` stays OUT of the key: a link inferred by turn
 *  2's resolver and then confirmed by a person is the same link, and a key
 *  holding it would let both spellings sit there as two rows. */
export const link = comms.table(
  'link',
  {
    /** CASCADE: a link to a thread that no longer exists points at nothing. */
    threadId: uuid('thread_id')
      .notNull()
      .references(() => thread.id, { onDelete: 'cascade' }),

    /** The real fence §3.2 promised, and the reason migration `0042` exists at
     *  all: this column is why `sales.opportunity.code` and
     *  `sales.contract.code` had to stop being mirror rows by discipline. No
     *  CASCADE — an object row disappearing must not silently take the record
     *  of the conversations about it; a refused delete is the correct noise,
     *  especially while `ContactService.drop()` still leaves mirror rows behind
     *  (§19, tail). */
    objectCode: text('object_code')
      .notNull()
      .references(() => objectRef.code),

    linkedBy: text('linked_by').$type<LinkedBy>().notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.threadId, t.objectCode] }),
    /** "Which threads hang on object Y" — what the timeline of a lead, an
     *  account or an opportunity asks every time it draws. The primary key
     *  above answers the mirror question ("which objects is thread X on") and
     *  cannot answer this one: its leading column is the wrong end. */
    index('link_object_idx').on(t.objectCode),
    check('link_linked_by_known', sql`"linked_by" IN ('auto', 'human')`),
  ],
)

export type ThreadRowDb = typeof thread.$inferSelect
export type ThreadValues = typeof thread.$inferInsert
export type MessageRowDb = typeof message.$inferSelect
export type MessageValues = typeof message.$inferInsert
export type MessagePartyRowDb = typeof messageParty.$inferSelect
export type MessagePartyValues = typeof messageParty.$inferInsert
export type LinkRowDb = typeof link.$inferSelect
export type LinkValues = typeof link.$inferInsert
