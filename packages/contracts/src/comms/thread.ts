import { z } from 'zod'
import { Moment, textInput, textInputOptional } from '../primitives'
import { CommsChannel, IdentityId, LinkableCode } from './identity'

/** Turn 1 of `comms` — the conversation log itself, on top of the `comms.identity`
 *  spine turn 0 shipped. `docs/tam-nhin-giao-tiep-va-noi-dung.md` §3 has the full
 *  case for three tables instead of one; this file only turns that shape into
 *  zod, MANUAL CAPTURE ONLY (§11, §13.3 — no sync door, no webhook, no upload
 *  in this turn, so `captureSource` and `externalId` carry room for those doors
 *  without pretending a writer for them exists yet).
 *
 *      POST   /comms/messages              permission `comm.view`   (C4)
 *      POST   /comms/threads/:id/links     permission `comm.view` + edit on the target object (C3)
 *      GET    /comms/threads?object=       permission `comm.view`   scoped (C1)
 *      GET    /comms/threads/:id/messages  permission `comm.view` for the row,
 *                                           `comm.view-content` for `bodyText` (C2)
 *
 *  Two things settled elsewhere, not re-litigated here:
 *  - a message never writes a `sales.touch` row (§3.3) — the timeline SCREEN
 *    merges the two streams when it draws, the books stay separate;
 *  - a thread carries no object code and never reaches ContextRail (§19.3) —
 *    a code is minted for something a person names out loud, and a thread is
 *    something that happened BETWEEN objects, not an object itself. */

// ---------------------------------------------------------------------------
// SHARED ENUMS AND IDS
// ---------------------------------------------------------------------------

export const ThreadId = z.uuid('Mã luồng phải là UUID')
export const MessageId = z.uuid('Mã lượt phải là UUID')

export const ThreadState = z.enum(['open', 'archived'])
export type ThreadState = z.infer<typeof ThreadState>

export const MessageDirection = z.enum(['in', 'out'])
export type MessageDirection = z.infer<typeof MessageDirection>

/** Who a party was to one message. Only `'from'`/`'to'`/`'cc'` have a writer in
 *  this turn — the manual capture door records the sender and whoever else was
 *  on the call or in the room. `'speaker'` is for a transcript that names who
 *  said which line, and nothing produces a transcript before turn 5. It is in
 *  the enum now for the same reason two `TouchKind` members sit unwritten in
 *  `../sales/touch`: the alternative is widening a CHECK constraint later for
 *  a value already known to be coming. */
export const MessagePartyRole = z.enum(['from', 'to', 'cc', 'speaker'])
export type MessagePartyRole = z.infer<typeof MessagePartyRole>

/** How a message entered the book. Only `'manual'` is reachable from any door
 *  this turn — a human typed it in right after a call or a meeting. The other
 *  three name turn 2's sync door, turn 2's webhook door, and turn 5's upload
 *  door; they sit in the enum so the column's CHECK constraint does not move
 *  again when those doors ship, the same reasoning `CommsChannel` in
 *  `./identity` gives for carrying `'phone'` before anything sent through it.
 *
 *  Not client-settable: `MessageCreate` below has no `captureSource` field at
 *  all, because the only door that exists always means `'manual'` and the
 *  server, not the caller, is the one place that fact can be trusted. */
export const CaptureSource = z.enum(['manual', 'sync', 'webhook', 'upload'])
export type CaptureSource = z.infer<typeof CaptureSource>

export const LinkedBy = z.enum(['auto', 'human'])
export type LinkedBy = z.infer<typeof LinkedBy>

// ---------------------------------------------------------------------------
// THREAD
// ---------------------------------------------------------------------------

export const THREAD_SUBJECT_MAX = 200

/** Ceiling on the raw cell. Wide enough for an email `Message-ID`
 *  (`<uuid@host>`, well under 255) and for whatever opaque id a chat platform's
 *  webhook hands back in turn 2 — this file does not try to shape-check either,
 *  the same restraint `identityAddress` documents for its own raw cell. */
export const THREAD_EXTERNAL_ID_MAX = 255

export const ThreadRow = z.object({
  id: ThreadId,
  channel: CommsChannel,
  /** The wire's own id for this conversation — an email `Message-ID`, a chat
   *  platform's conversation id. `NULL` for every thread this turn produces:
   *  manual capture has no wire to read an id off of.
   *
   *  `UNIQUE (channel, external_id)` lives on the TABLE, not here — it is what
   *  makes turn 2's sync door idempotent, re-pulling the same mailbox a third
   *  time and landing on the same row instead of a third copy. Postgres treats
   *  every `NULL` as distinct from every other `NULL` under a unique index, so
   *  many manually-captured threads sit side by side without colliding on the
   *  one column they all leave empty. */
  externalId: z.string().min(1).max(THREAD_EXTERNAL_ID_MAX).nullable(),
  subject: textInput(THREAD_SUBJECT_MAX).nullable(),
  startedAt: Moment,
  lastAt: Moment,
  state: ThreadState,
  /** How many `comms.message` rows this thread holds. Answers "how many turns"
   *  without the caller having to fetch every message first — the one piece of
   *  §5b's metadata question (`comm.view`, no `comm.view-content` needed) that
   *  `GET /comms/threads?object=` would otherwise have no way to state. */
  messageCount: z.number().int().nonnegative(),
})

export type ThreadRow = z.infer<typeof ThreadRow>

// ---------------------------------------------------------------------------
// MESSAGE CONTENT — the one field two permissions disagree about
// ---------------------------------------------------------------------------

/** Ceiling on one turn's text.
 *
 *  Argued rather than picked, the way `TRANSCRIPT_MAX` is: 20.000 characters is
 *  roughly four thousand words — a very long letter, several times anything a
 *  person types into a CRM by hand, and still an order of magnitude under the
 *  hour-of-speech figure `TRANSCRIPT_MAX` allows, because a transcript is a
 *  different column with a different writer.
 *
 *  What happens when turn 2's sync door meets a letter longer than this: it
 *  REFUSES, it does not truncate. A truncated body renders as `'visible'`, and
 *  nothing in `MessageContent` can say "this is the first 20.000 characters of
 *  what was said" — so truncation would be a quiet lie of exactly the kind the
 *  three-branch union exists to prevent, told inside a record that may be under
 *  legal hold. A refusal has somewhere to land instead: the unmatched queue is
 *  already the place for "arrived, not filed". */
export const MESSAGE_BODY_MAX = 20000

/** The body of one turn, wrapped so a reader can tell apart the two reasons
 *  `bodyText` might not be sitting right there: the turn genuinely carries no
 *  text (a phone call logged with only a duration, nothing typed), or the
 *  viewer lacks `comm.view-content` and the server withheld a value that does
 *  exist. A plain `bodyText: string | null` cannot say which — both collapse
 *  onto the same `null`, and the two questions "did we talk about anything"
 *  and "am I allowed to see what was said" read as one wrong answer either
 *  way.
 *
 *  Same instinct as `hidden` on `paged()` (`../pagination`) and the mandatory
 *  "hidden by your permission" row Rule 7 forces onto the global search screen
 *  (`docs/luat-thiet-ke.md` §7, screen 03): a server that knows something is
 *  being withheld says so, in the shape of the response, rather than sending
 *  the same absence a screen would send for "nothing here". */
export const MessageContent = z.discriminatedUnion('state', [
  z.object({ state: z.literal('none') }),
  z.object({ state: z.literal('hidden') }),
  z.object({ state: z.literal('visible'), bodyText: textInput(MESSAGE_BODY_MAX) }),
])

export type MessageContent = z.infer<typeof MessageContent>

// ---------------------------------------------------------------------------
// MESSAGE PARTY
// ---------------------------------------------------------------------------

export const MessagePartyRow = z.object({
  identityId: IdentityId,
  role: MessagePartyRole,
})

export type MessagePartyRow = z.infer<typeof MessagePartyRow>

// ---------------------------------------------------------------------------
// MESSAGE — THE READ SHAPE
// ---------------------------------------------------------------------------

export const MessageRow = z.object({
  id: MessageId,
  threadId: ThreadId,
  at: Moment,
  direction: MessageDirection,
  /** The one identity this row treats as the primary sender — always resolved,
   *  never the raw wire address: `resolve.service` only ever produces a
   *  `comms.message` row after an address matches a `comms.identity`, an
   *  unresolved address goes to `comms.inbox_unmatched` instead (§5a) and never
   *  reaches this table. `parties` below carries the FULL list — everyone who
   *  was on the call or in the room, cc included — which a single column
   *  cannot. */
  fromIdentityId: IdentityId,
  /** How long a call or a meeting ran. Metadata, not content: `comm.view`
   *  alone sees it, same as `channel` and `at` — §5b's line is drawn at "what
   *  was said", and a duration says nothing about that. `null` for a written
   *  message, where the question does not apply. */
  durationSec: z.number().int().nonnegative().nullable(),
  captureSource: CaptureSource,
  content: MessageContent,
  parties: z.array(MessagePartyRow),
})

export type MessageRow = z.infer<typeof MessageRow>

/** Not `paged()`, for the reason `TouchTimelineResponse` in `../sales/touch`
 *  is not: a thread's turns are its own answer to "how much have we talked",
 *  and a list that hides its tail behind "load more" lies about that count
 *  before the reader even opens the reply box. The list is bounded by how many
 *  turns one thread has actually had, the same bound that keeps a touch
 *  timeline finite. */
export const ThreadMessagesResponse = z.object({
  rows: z.array(MessageRow),
})

export type ThreadMessagesResponse = z.infer<typeof ThreadMessagesResponse>

// ---------------------------------------------------------------------------
// WRITING A MESSAGE — POST /comms/messages
// ---------------------------------------------------------------------------

const MessagePartyCreate = z.object({
  identityId: IdentityId,
  role: MessagePartyRole,
})

const MessageCreateFields = z.object({
  /** WHICH RECORD THIS TURN BELONGS TO — required, on both branches.
   *
   *  A message with no link is a message nobody can reach: the thread list is
   *  an inner join on `comms.link`, so an unlinked thread appears on no profile
   *  at all. Leaving the anchor out of the write door meant the FIRST manual
   *  turn on every record fell into a hole — the toast said saved, the list
   *  came back unchanged. Caught in review before it shipped.
   *
   *  It rides on the shared fields rather than on the `'new'` branch alone
   *  because the `'existing'` branch needs it too: the server checks the caller
   *  can reach this object before it writes anything, and "which object" is the
   *  only thing that check can be made against. */
  objectCode: LinkableCode,
  at: Moment,
  direction: MessageDirection,
  fromIdentityId: IdentityId,
  /** Absent means the turn carries no text — a call logged with only a
   *  duration. Present is what the server turns into `content.state
   *  === 'visible'` on the way back out; there is no way to write
   *  `content.state === 'hidden'` — that state exists only for a READER
   *  the server has decided to withhold an existing body from. */
  bodyText: textInputOptional(MESSAGE_BODY_MAX),
  durationSec: z.number().int().nonnegative().optional(),
  parties: z.array(MessagePartyCreate).min(1, 'Cần ít nhất một người có mặt trong lượt này.'),
})

/** A discriminated union on `thread`, not one shape with `threadId` optional
 *  plus a refine that requires `channel` when it is missing.
 *
 *  The two cases are genuinely two different requests wearing one endpoint:
 *  "log a call that just happened" has no thread yet and must name a
 *  `channel` to start one, "add a turn to a conversation already open" has a
 *  thread and nothing else to decide. A single optional-`threadId` shape would
 *  let a caller send BOTH a `threadId` and a `channel` at once, or neither,
 *  and only a runtime check would catch it — the same gap `IdentityRow`'s
 *  docblock in `./identity` argues against for `actorId`/`objectCode`. The
 *  union makes `channel` unreachable once `thread: 'existing'` narrows the
 *  type, with no branch the compiler cannot see.
 *
 *  One door serving both cases, not two doors, because the person who just
 *  hung up the phone should not have to know or care whether this is the
 *  first call on this deal or the fifth — they are logging a call either way,
 *  and the thread it lands on is the server's problem, not theirs. */
export const MessageCreate = z.discriminatedUnion('thread', [
  MessageCreateFields.extend({
    thread: z.literal('new'),
    channel: CommsChannel,
    subject: textInputOptional(THREAD_SUBJECT_MAX),
  }),
  MessageCreateFields.extend({
    thread: z.literal('existing'),
    threadId: ThreadId,
  }),
])

export type MessageCreate = z.infer<typeof MessageCreate>

/** Both halves, always — the caller cannot tell from `MessageCreate` alone
 *  whether `thread: 'new'` actually minted a row or `thread: 'existing'` was
 *  used, so the response hands back the thread it landed on either way rather
 *  than making the caller re-fetch it to find out. */
export const MessageCreateResponse = z.object({
  thread: ThreadRow,
  message: MessageRow,
})

export type MessageCreateResponse = z.infer<typeof MessageCreateResponse>

// ---------------------------------------------------------------------------
// LINK — thread ↔ object
// ---------------------------------------------------------------------------

export const LinkRow = z.object({
  threadId: ThreadId,
  /** No prefix restriction any more, and that is the debt clearing inside this
   *  same turn. `platform.object` mirror rows for `opportunity` and `contract`
   *  used to be the service's discipline with no foreign key behind them, so a
   *  thread could name a deal code the database did not really guarantee.
   *  Migration 0042 turned both into real foreign keys, so the fence is now the
   *  key itself and no service has to spell a prefix list. */
  objectCode: LinkableCode,
  linkedBy: LinkedBy,
})

export type LinkRow = z.infer<typeof LinkRow>

/** No `linkedBy` here — every link this turn's one door produces is a person
 *  choosing to attach a thread, so the server always writes `'human'`.
 *  `'auto'` is turn 2's `resolve.service` inferring a link from a matched
 *  identity, a door that writes straight to the table and never goes through
 *  this schema. */
export const LinkCreate = z.object({
  objectCode: LinkableCode,
})

export type LinkCreate = z.infer<typeof LinkCreate>

// ---------------------------------------------------------------------------
// GET /comms/threads?object=
// ---------------------------------------------------------------------------

export const ThreadQuery = z.object({
  objectCode: LinkableCode,
})

export type ThreadQuery = z.infer<typeof ThreadQuery>

/** Not `paged()`, same reasoning as `ThreadMessagesResponse` above: this list
 *  is already scoped to one object, the same bound that keeps a touch timeline
 *  or a mail timeline finite, so there is no tail large enough for "load more"
 *  to be honest about hiding. */
export const ThreadListResponse = z.object({
  rows: z.array(ThreadRow),
})

export type ThreadListResponse = z.infer<typeof ThreadListResponse>
