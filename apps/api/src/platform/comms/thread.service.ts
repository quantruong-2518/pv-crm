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
import { denied, notFound } from '@api/platform/http/problem'
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
 *  opens. A thread with NO links is visible to anyone holding `comm.view`, and
 *  that is the same call E2 makes for `ref.owner` being empty — an object with
 *  no owner is a shared row, not somebody else's row. `thread: 'new'` is that
 *  case by construction: it hangs on nothing until somebody posts a link, and
 *  the link door is where the fence meets it.
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
   *  ONE TRANSACTION, BECAUSE HALF OF THIS IS NOT A TURN
   *  ------------------------------------------------------------------
   *  A thread with no message is a header describing a conversation that did
   *  not happen; a message with no parties is a turn nobody was on. Both are
   *  rows no screen can draw and no later write can repair, so all of it
   *  commits together or none of it does — the same contract `MeetingService`
   *  states for a meeting and its attendees.
   *
   *  `thread.last_at` is bumped on the `'existing'` branch inside that same
   *  transaction. A timeline whose header still names last Tuesday after a
   *  call this morning is a book lying about itself, and it lies in the one
   *  place the thread list sorts by.
   *
   *  `captureSource` is `'manual'` here and nowhere else: `MessageCreate`
   *  carries no field for it on purpose, because the only door that exists
   *  always means manual and the server is the one place that fact can be
   *  trusted. `linkedBy` gets the same treatment on the link door below.
   *
   *  NO `sales.touch` ROW (§3.3). The screen merges the two streams when it
   *  draws; the books stay separate. A `touch.record` call here would be the
   *  second copy of one fact, and the second copy drifts. */
  async create(who: Actor, body: MessageCreate): Promise<MessageCreateResponse> {
    const at = new Date(body.at)

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
   *  the thread is attached to is within reach. */
  private async refuseUnreachableThread(who: Actor, threadId: string, tx?: Db): Promise<void> {
    const codes = await this.repo.linkCodesOf(threadId, tx)
    if (codes.length === 0) return

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
