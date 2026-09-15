import { Inject, Injectable } from '@nestjs/common'
import type { AccessControl, Action, Actor } from '@pv/engines'
import {
  LinkRow,
  MessageCreateResponse,
  ThreadListResponse,
  ThreadMessagesResponse,
  type LinkCreate,
  type MessageCreate,
  type ThreadQuery,
} from '@pv/contracts'
import { AuditRepository } from '@api/platform/audit/audit.repository'
import type { Db } from '@api/platform/db/db.module'
import { ACCESS } from '@api/platform/engines/tokens'
import { denied, invalid, notFound } from '@api/platform/http/problem'
import { toLink, toMessage, toObjectRef, toThread } from './comms.mapper'
import { ThreadRepository } from './thread.repository'
import type { MessagePartyRowDb } from './comms.schema'

/** The conversation book — four doors, all on `comm.view`.
 *
 *  ------------------------------------------------------------------
 *  THE SCOPE AXIS RUNS THROUGH `platform.object`, NOT THROUGH THIS SCHEMA
 *  ------------------------------------------------------------------
 *  `comms.thread` has no owner column and is not going to get one: a
 *  conversation happened BETWEEN people and belongs to neither of them. So the
 *  question "may this caller see this conversation" is answered by the objects
 *  the thread hangs on — read the `platform.object` mirror row, hand it to E2
 *  as an `ObjectRef`, let the same three axes that guard the lead book answer.
 *  Forking that comparison here (`row.owner === who.name`) would be the exact
 *  mistake `GraphService.storyFor` documents having made once already.
 *
 *  It applies on all four doors, including the two that take a thread id
 *  rather than an object code. A scope fence on `?objectCode=` alone is not a
 *  fence: one UUID out of a colleague's screen and the timeline behind it
 *  opens. And a thread carrying NO link is refused rather than shared — see
 *  `refuseUnreachableThread`, where that default was inverted after review.
 *
 *  Which is only safe because every door that mints a thread anchors it in
 *  the same transaction. `create()` writes the `comms.link` row beside the
 *  first message; there is no longer a way to produce a thread that hangs on
 *  nothing, so the fail-closed default refuses no legitimate caller.
 *
 *  ------------------------------------------------------------------
 *  A READ THAT REVEALS A BODY WRITES ONE AUDIT LINE, AND NOT IN A TRANSACTION
 *  ------------------------------------------------------------------
 *  §5c asks for a trail when somebody reads what was said. Every other writer
 *  in this repo wraps its audit line in the transaction that wrote the row it
 *  explains, and that is right THERE and wrong here: on this path there is no
 *  row, the audit line is the only write in the request, and a transaction
 *  around a single `INSERT` buys nothing an `INSERT` does not already have.
 *
 *  What the read path actually needs is ORDER, not atomicity: the line has to
 *  be durable before the bodies leave the process. `await` before `return`
 *  gives exactly that — if the trail cannot be written the request fails and
 *  no body is handed over, which is the direction this is supposed to fail in.
 *
 *  ONE line per request, not one per turn. A thirty-turn thread opened once is
 *  one act of reading; thirty rows would bury the log that exists to answer
 *  "who read my customer's conversation" under the answer itself. */
@Injectable()
export class ThreadService {
  constructor(
    private readonly repo: ThreadRepository,
    private readonly audit: AuditRepository,
    @Inject(ACCESS) private readonly access: AccessControl,
  ) {}

  /** C1 — the threads hanging on one object, with their turn counts. */
  async byObject(who: Actor, q: ThreadQuery): Promise<ThreadListResponse> {
    await this.refuseUnreachableObject(who, q.objectCode, 'view')

    const rows = await this.repo.byObject(q.objectCode)

    return ThreadListResponse.parse({
      rows: rows.map((t) => toThread(t.row, t.messageCount)),
    })
  }

  /** C2 — the timeline. Metadata for `comm.view`, bodies for
   *  `comm.view-content`, and the difference is decided in `toMessage`.
   *
   *  The count of what was actually revealed is read back OFF the mapped rows
   *  rather than recomputed from the permission: this service never asks the
   *  content question itself, so there is no second answer to it that could
   *  disagree with the one already sitting in the response. */
  async messages(who: Actor, id: string): Promise<ThreadMessagesResponse> {
    const found = await this.repo.threadById(id)
    if (!found) throw notFound('luồng giao tiếp', id)

    await this.refuseUnreachableThread(who, id)

    const rows = await this.repo.messagesOf(id)
    const parties = await this.repo.partiesOf(rows.map((r) => r.id))
    const byMessage = groupByMessage(parties)

    const wire = rows.map((r) => toMessage(this.access, who, r, byMessage.get(r.id) ?? []))

    const shown = wire.filter((m) => m.content.state === 'visible').length
    if (shown > 0) await this.trailContentRead(who, id, shown)

    return ThreadMessagesResponse.parse({ rows: wire })
  }

  /** C4 — one turn, logged by hand, and the thread under it if there is none.
   *
   *  ------------------------------------------------------------------
   *  ONE TRANSACTION, AND THE LINK ROW IS PART OF IT
   *  ------------------------------------------------------------------
   *  A thread with no message is a header describing a conversation that did
   *  not happen; a message with no parties is a turn nobody was on; and a
   *  thread with no LINK is a conversation no record can reach — `byObject`
   *  is an inner join on `comms.link`, so an unanchored thread appears on no
   *  profile at all. That last one shipped broken in the first draft of this
   *  file and was caught in review: the toast said saved, the list came back
   *  unchanged, and because the empty state can only open the `'new'` branch,
   *  the FIRST manual turn on every record was the one that vanished.
   *
   *  So all four rows commit together or none of them do — the same contract
   *  `MeetingService` states for a meeting and its attendees, with one more
   *  table in the cluster.
   *
   *  The anchor is written with `ensureLink`, not `insertLink`: the fifth call
   *  on a deal lands on a thread already attached to it, and refusing that
   *  with `link_pk` would turn an ordinary write into a 409 about a table the
   *  caller never mentioned.
   *
   *  `thread.last_at` is bumped on the `'existing'` branch inside that same
   *  transaction. A timeline whose header still names last Tuesday after a
   *  call this morning is a book lying about itself, and it lies in the one
   *  place the thread list sorts by.
   *
   *  ------------------------------------------------------------------
   *  THREE REFUSALS BEFORE THE FIRST INSERT
   *  ------------------------------------------------------------------
   *  `'new'` used to run no permission check at all. That was invisible only
   *  because the thread it minted hung on nothing; the moment it anchors, an
   *  unchecked `'new'` is a write landing on somebody else's record through a
   *  door that declares `comm.view`. So: the ANCHOR has to be in reach, the
   *  THREAD has to be in reach on the `'existing'` branch, and every guest
   *  identity named as sender or party has to belong to a record in reach —
   *  naming a customer you cannot see would file this turn against them and
   *  make their address readable to whoever reads the turn back.
   *
   *  The anchor is checked with `'view'` and not the `'edit'` the link door
   *  asks for, and the difference is the act rather than an oversight: C3
   *  moves a conversation that already exists onto a record, C4 records one
   *  that just happened where it happened. Raising this to `'edit'` would stop
   *  a presales seat logging the demo they personally sat through.
   *
   *  `captureSource` is `'manual'` here and nowhere else: `MessageCreate`
   *  carries no field for it on purpose, because the only door that exists
   *  always means manual and the server is the one place that fact can be
   *  trusted. `linkedBy` gets the same treatment, on both doors.
   *
   *  NO `sales.touch` ROW (§3.3). The screen merges the two streams when it
   *  draws; the books stay separate. A `touch.record` call here would be the
   *  second copy of one fact, and the second copy drifts. */
  async create(who: Actor, body: MessageCreate): Promise<MessageCreateResponse> {
    const at = new Date(body.at)

    await this.refuseUnreachableObject(who, body.objectCode, 'view')
    await this.refuseUnreachableParties(who, [
      body.fromIdentityId,
      ...body.parties.map((p) => p.identityId),
    ])

    const written = await this.repo.run(async (tx) => {
      const threadId =
        body.thread === 'new'
          ? (
              await this.repo.insertThread(tx, {
                channel: body.channel,
                subject: body.subject ?? null,
                /* Both ends are this turn: a thread that starts now has had
                   exactly one turn, so first and last are the same moment.
                   `thread_span_forward` reads `>=` for precisely this row. */
                startedAt: at,
                lastAt: at,
              })
            ).id
          : await this.openExisting(tx, who, body.threadId)

      await this.repo.ensureLink(tx, {
        threadId,
        objectCode: body.objectCode,
        linkedBy: 'human',
      })

      const row = await this.repo.insertMessage(tx, {
        threadId,
        at,
        direction: body.direction,
        fromIdentityId: body.fromIdentityId,
        bodyText: body.bodyText ?? null,
        durationSec: body.durationSec ?? null,
        captureSource: 'manual',
      })

      await this.repo.insertParties(
        tx,
        body.parties.map((p) => ({ messageId: row.id, identityId: p.identityId, role: p.role })),
      )

      if (body.thread === 'existing') await this.repo.widenSpan(tx, threadId, at)

      /* Read back rather than echo the body: the response has to describe the
         rows that are now in the book, and the thread's turn count and its
         stretched span exist nowhere else. */
      const tally = await this.repo.threadById(threadId, tx)
      if (!tally) throw new Error('comms.thread: header vanished inside its own transaction')
      const parties = await this.repo.partiesOf([row.id], tx)

      await this.audit.write(
        {
          actorId: who.id,
          action: 'edit',
          code: body.objectCode,
          note: `comms.message ${row.id} · manual capture on thread ${threadId} · ${body.direction} ${row.at.toISOString()}`,
        },
        tx,
      )

      return { tally, row, parties }
    })

    /* The writer sees their own body through the same gate as everybody else:
       a `marketing` seat that types a note gets it back as `'hidden'`. That
       reads odd for one second and is the only answer that keeps
       `MessageContent` meaning one thing — an exception for the author would
       be a second rule, and the first caller to hit it would be reading
       somebody else's message through a door labelled "mine". */
    return MessageCreateResponse.parse({
      thread: toThread(written.tally.row, written.tally.messageCount),
      message: toMessage(this.access, who, written.row, written.parties),
    })
  }

  /** C3 — hang an existing thread on one more object.
   *
   *  TWO fences, not one, and they guard two different leaks. Reaching the
   *  THREAD is the same question every other door here asks. Reaching the
   *  TARGET is asked with `'edit'` rather than `'view'`, which is what the
   *  contract's own door table says (`comm.view` + edit on the target object):
   *  a link puts a conversation onto somebody's record, and writing onto a
   *  record you are only allowed to read is how data crosses a scope boundary
   *  without anything looking like a write. */
  async link(who: Actor, threadId: string, body: LinkCreate): Promise<LinkRow> {
    await this.refuseUnreachableObject(who, body.objectCode, 'edit')

    const row = await this.repo.run(async (tx) => {
      const found = await this.repo.threadById(threadId, tx)
      if (!found) throw notFound('luồng giao tiếp', threadId)

      await this.refuseUnreachableThread(who, threadId, tx)

      const written = await this.repo.insertLink(tx, {
        threadId,
        objectCode: body.objectCode,
        linkedBy: 'human',
      })

      /* Filed under the object code, which is the one audit line in this
         module that HAS one to file under — the question "what got attached
         to this customer" is asked of the customer, and `platform.audit`
         indexes `code`. */
      await this.audit.write(
        {
          actorId: who.id,
          action: 'edit',
          code: written.objectCode,
          note: `comms.link thread ${written.threadId} → ${written.objectCode}`,
        },
        tx,
      )

      return written
    })

    return LinkRow.parse(toLink(row))
  }

  /** The `'existing'` branch's own two refusals, run on the write
   *  transaction's handle: the thread has to be there and in reach, and both
   *  answers have to come from the book the insert is about to land in. */
  private async openExisting(tx: Db, who: Actor, threadId: string): Promise<string> {
    const found = await this.repo.threadById(threadId, tx)
    if (!found) throw notFound('luồng giao tiếp', threadId)

    await this.refuseUnreachableThread(who, threadId, tx)
    return found.row.id
  }

  /** E2 on one object code. 404 and 403 stay apart for the reason
   *  `LeadService.profile` writes down at length: a code that is not in the
   *  book and a code that is not yours are two different next steps for the
   *  person reading the screen, and collapsing them sends one of the two
   *  hunting for a row that is sitting right there. */
  private async refuseUnreachableObject(who: Actor, code: string, action: Action): Promise<void> {
    const row = await this.repo.objectByCode(code)
    if (!row) throw notFound('object', code)

    const verdict = this.access.check(who, { ref: toObjectRef(row), action })
    if (!verdict.ok) throw denied(verdict.reason, verdict.note)
  }

  /** E2 on every object a thread hangs on — ONE in reach is enough.
   *
   *  A mail chain hanging on my lead and on a colleague's account is one
   *  conversation, and refusing it because half of what it touches is not mine
   *  would hide a letter I am named in. The refusal only fires when NOTHING
   *  the thread is attached to is within reach.
   *
   *  ------------------------------------------------------------------
   *  A THREAD ON NO OBJECT IS REFUSED, NOT WAVED THROUGH
   *  ------------------------------------------------------------------
   *  The first draft returned early on an empty link list and called it a
   *  shared row, borrowing E2's reading of an empty `ref.owner`. That reading
   *  was wrong twice over. E2's case is an object that EXISTS and is owned by
   *  nobody; this one is an absence of any object to ask about, so there is
   *  nothing the scope axis has been applied to — "no fence could be checked"
   *  became "the fence passed", which is fail-OPEN sitting in the one line a
   *  reader skims past. And while every manual turn now anchors itself, this
   *  function is what a future door — turn 2's resolver, a hand-written row —
   *  would meet, so the default it carries has to be the safe one.
   *
   *  Refusal rather than "only the person who created it", because there is no
   *  creator column on `comms.thread` and inventing one to answer this would
   *  put an owner on a thing whose whole design says it has none. Nothing is
   *  lost: an unanchored thread is already reachable from no list, so this
   *  refuses a door that only somebody holding a loose UUID could be at. */
  private async refuseUnreachableThread(who: Actor, threadId: string, tx?: Db): Promise<void> {
    const codes = await this.repo.linkCodesOf(threadId, tx)
    if (codes.length === 0) {
      throw denied(
        'out-of-scope',
        'Luồng giao tiếp này chưa gắn vào hồ sơ nào nên không ai đọc được — gắn nó vào một hồ sơ trước.',
      )
    }

    const rows = await this.repo.objectsByCodes(codes, tx)
    const { visible } = this.access.visible(
      who,
      rows.map((row) => ({ ref: toObjectRef(row) })),
    )
    if (visible.length > 0) return

    throw denied(
      'out-of-scope',
      'Luồng giao tiếp này chỉ gắn vào những hồ sơ ngoài phạm vi của bạn — hỏi người đang giữ chúng.',
    )
  }

  /** Every identity a write door names has to belong to a record in reach.
   *
   *  Two different leaks close here, and only the first is obvious. Naming a
   *  customer you cannot see files this turn against them, which is a write
   *  landing in a scope the caller has no business in. The quieter one is the
   *  read back: `comms.identity` holds the ADDRESS, and a turn that lists a
   *  party is a turn that hands their id to everyone allowed to read it.
   *
   *  Only `'guest'` rows carry an object to check. A `'member'` row is a
   *  colleague's own address and has no scope axis at all — that is the
   *  property `identity.service.ts` states about the whole table, and it is
   *  the reason a check on `side === 'member'` would be a fence around
   *  nothing.
   *
   *  A missing id is refused here rather than left to the foreign key: `400`
   *  naming the field is what the screen can redden, and the two constraints
   *  that would otherwise fire name two different columns for one mistake. */
  private async refuseUnreachableParties(who: Actor, ids: readonly string[]): Promise<void> {
    const wanted = [...new Set(ids)]
    const rows = await this.repo.identitiesByIds(wanted)

    if (rows.length !== wanted.length) {
      const found = new Set(rows.map((r) => r.id))
      throw invalid(
        { parties: [`Không có định danh ${wanted.filter((id) => !found.has(id)).join(', ')}.`] },
        'Có người trong lượt này không còn trong sổ định danh.',
      )
    }

    const codes = [...new Set(rows.flatMap((r) => (r.objectCode ? [r.objectCode] : [])))]
    if (codes.length === 0) return

    const objects = await this.repo.objectsByCodes(codes)
    const { visible } = this.access.visible(
      who,
      objects.map((row) => ({ ref: toObjectRef(row) })),
    )

    if (visible.length === codes.length) return
    throw denied(
      'out-of-scope',
      'Lượt này có người thuộc một hồ sơ ngoài phạm vi của bạn — hỏi người đang giữ hồ sơ đó.',
    )
  }

  /** No `code`, and that is deliberate rather than an omission.
   *
   *  A thread mints no object code of its own (§19.3) and may hang on several
   *  objects at once, so there is no single value `platform.audit.code` could
   *  hold without picking one of them arbitrarily. The note carries the thread
   *  id and how many turns opened up instead — which is the fact somebody
   *  reading this line six months later needs, and the one a `code` column
   *  guessing between two customers would have made unreadable. */
  private trailContentRead(who: Actor, threadId: string, shown: number): Promise<void> {
    return this.audit.write({
      actorId: who.id,
      action: 'view',
      note: `comms.thread ${threadId} · read body of ${shown} message(s)`,
    })
  }
}

function groupByMessage(rows: readonly MessagePartyRowDb[]): Map<string, MessagePartyRowDb[]> {
  const byMessage = new Map<string, MessagePartyRowDb[]>()
  for (const row of rows) {
    const bucket = byMessage.get(row.messageId)
    if (bucket) bucket.push(row)
    else byMessage.set(row.messageId, [row])
  }
  return byMessage
}
