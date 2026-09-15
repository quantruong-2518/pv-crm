import { check, index, pgSchema, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { CommsChannel, IdentitySide } from '@pv/contracts'
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
 *  count in §7 of `docs/tam-nhin-giao-tiep-va-noi-dung.md` is a count of
 *  conversations with a PERSON.
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
 *  Opportunity and contract are that debt, they are turn 1's to pay, and until
 *  they are paid nothing in this table may point at an `OP-…` or `HD-…` code.
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
