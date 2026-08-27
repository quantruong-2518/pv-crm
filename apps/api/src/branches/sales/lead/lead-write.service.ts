import { Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  LeadCreateResponse,
  LeadImportCommitResponse,
  LeadImportPreviewResponse,
  type LeadCreate,
  type LeadImportBody,
} from '@pv/contracts'
import { ObjectMirror } from '@api/platform/graph/object-mirror'
import type { Db } from '@api/platform/db/db.module'
import { checkBatch, keyOf, type ImportCheck } from './lead-import.check'
import { fromCreate, refOf } from './lead-write.mapper'
import { toContract } from './lead.mapper'
import { LeadRepository } from './lead.repository'
import { LeadWriteRepository } from './lead-write.repository'

/** THE THREE DOORS A LEAD CAN COME IN THROUGH. One of them writes nothing.
 *
 *  ------------------------------------------------------------------
 *  THE INVARIANT EVERY DOOR OBEYS: MIRROR ROW FIRST
 *  ------------------------------------------------------------------
 *  `sales.lead.code` carries a foreign key into `platform.object(code)`, so
 *  the order is not a style: mint the code, write the mirror row, write the
 *  lead — and all of it inside ONE transaction. Postgres refuses the insert
 *  otherwise, which is exactly why the key is shaped that way; a lead with no
 *  mirror row is a lead the object graph cannot see, its ContextRail comes up
 *  empty (rule 10), and nothing anywhere turns red.
 *
 *  `ObjectMirror` deliberately opens no transaction of its own. This service
 *  holds it, because this service is the layer that knows what else belongs in
 *  the same unit of work.
 *
 *  ------------------------------------------------------------------
 *  WHY THE CODES ARE MINTED BEFORE THE TRANSACTION OPENS
 *  ------------------------------------------------------------------
 *  `LeadRepository.nextCode()` runs on the pool, not on our handle. Asking it
 *  for a number while our transaction already holds a connection means one
 *  request occupying two connections at once — with a pool of ten, ten
 *  concurrent imports then wait on each other for an eleventh that will never
 *  come. Minting first costs nothing: `nextval` ignores transactions by
 *  design, so a rolled-back batch simply burns its numbers and the next lead
 *  takes the one after. Gaps in the code series are normal and were budgeted
 *  for; a stalled pool is not.
 *
 *  ------------------------------------------------------------------
 *  NOTHING IS RE-NORMALISED HERE
 *  ------------------------------------------------------------------
 *  `LeadCreate` and `LeadImportBody` already trimmed, collapsed, lowercased
 *  the mailbox and turned every `''` into `undefined`. Doing it again in the
 *  service is a second convention that will drift from the first. Likewise the
 *  table's own refusals — a duplicate mailbox, a blank-but-not-empty cell, an
 *  owner who is not in the staff book — are already translated into the right
 *  Problem by `db-error.ts` plus `lead.constraints.ts`. Catching them here to
 *  write a nicer sentence would produce a second wording of a rule that has
 *  one. */
@Injectable()
export class LeadWriteService {
  constructor(
    private readonly repo: LeadWriteRepository,
    private readonly leads: LeadRepository,
    private readonly mirror: ObjectMirror,
  ) {}

  // ── door 1 · one lead, typed by a person ─────────────────────────────────

  /** `POST /sales/leads`. Answers with the row as the book would show it.
   *
   *  The owner is looked up before the write because the mirror row carries a
   *  display NAME while the column carries an id — and because the response is
   *  a full book row, which prints the owner's mailbox. A missing actor is not
   *  refused here: the insert dies on `lead_owner_id_actor_id_fk` a moment
   *  later, and that fence holds for every door at once rather than only for
   *  the ones that remembered to check. */
  async create(body: LeadCreate): Promise<LeadCreateResponse> {
    const handle = this.repo.readonlyHandle
    const owner = body.ownerId ? await this.repo.actorById(handle, body.ownerId) : null

    const write = fromCreate(body, owner?.name ?? null)
    const code = await this.leads.nextCode()

    const row = await this.repo.run(async (tx) => {
      await this.mirror.put(tx, refOf(code, write))
      const [written] = await this.repo.insertLeads(tx, [{ ...write.values, code }])
      if (!written) throw new Error(`sales.lead: INSERT ${code} không trả về dòng nào`)
      return written
    })

    /* `daysHere` is 0 and `signed` is false by construction, not by guesswork:
       `stage_since` defaulted to now a millisecond ago, and a lead that has
       existed for a millisecond has no contract. Both are computed at read
       time by `lead.repository.ts`; here the answer is known without asking. */
    return LeadCreateResponse.parse(
      toContract({
        row,
        daysHere: 0,
        ownerName: owner?.name ?? null,
        ownerEmail: owner?.email ?? null,
        signed: false,
      }),
    )
  }

  // ── door 2 · the dry run ─────────────────────────────────────────────────

  /** `POST /sales/leads/import/preview` — READS ONLY.
   *
   *  Not one byte: no lead, no mirror row, no batch record, and above all no
   *  `nextval`. Minting a code is spending a real one, and a person who
   *  presses "xem trước" three times before committing would punch three holes
   *  in the code series for nothing. The preview exists to answer "what would
   *  happen", and a question that changes the thing it asks about is not that
   *  question. */
  async preview(body: LeadImportBody): Promise<LeadImportPreviewResponse> {
    const { report } = await this.check(this.repo.readonlyHandle, body)
    return LeadImportPreviewResponse.parse(report)
  }

  // ── door 3 · the real load ───────────────────────────────────────────────

  /** `POST /sales/leads/import` — the whole batch, or none of it.
   *
   *  Half a file loaded and then a crash is the state nobody can unwind by
   *  hand: the rows that landed look exactly like rows somebody meant to load,
   *  so the only way back is to know which ones, which is the thing that was
   *  lost. One transaction removes the question.
   *
   *  The batch record is written inside that same transaction, and it is
   *  written even when the batch accepted nothing: the load HAPPENED, somebody
   *  pressed the button on a file, and "that file produced zero rows" is one
   *  of the more useful things a log can say six months later. */
  async commit(who: Actor, body: LeadImportBody): Promise<LeadImportCommitResponse> {
    const handle = this.repo.readonlyHandle
    const { report, writes } = await this.check(handle, body)

    /* One code per accepted row, all of them before the transaction opens —
       see the note at the top of this class.

       Minted in parallel and then SORTED before being handed out. The sort is
       not cosmetics: `Promise.all` keeps the results in call order, but the
       numbers themselves come back in whatever order the sequence served
       them, so row 1 of the file ends up holding `LD-0201` and row 3 holding
       `LD-0212`. Every number in the list is already ours, so putting them in
       order costs nothing and buys the one thing a person opening the book
       right after a load expects — the file's order is the code's order.

       Known cost, said out loud rather than hidden: this is one round trip per
       row. A 5.000-row file spends 5.000 of them here. The fix is a single
       `nextval(seq, n)` call minting a block at once, which belongs in
       `lead.repository.ts` next to the sequence it reads. */
    const codes = (await Promise.all(writes.map(() => this.leads.nextCode()))).sort(
      (a, b) => Number(a.slice(3)) - Number(b.slice(3)),
    )

    /* Row and mirror row are built together, from the same draft and the same
       code, so the two can never drift apart by an index. */
    const ready = writes.map((write, i) => ({
      row: { ...write.values, code: codes[i]! },
      ref: refOf(codes[i]!, write),
    }))

    const batch = await this.repo.run(async (tx) => {
      /* Chunked, and still atomic — every statement below runs in this one
         transaction. The chunking is about a protocol limit, not about
         durability: Postgres accepts at most 65.535 bind parameters per
         statement, and a lead row carries around twenty columns, so a single
         5.000-row INSERT would be refused by the driver before it ever reached
         the server.

         Mirror rows first inside every chunk, for the reason this whole class
         exists: the foreign key on `lead.code` refuses the lead otherwise. */
      for (let i = 0; i < ready.length; i += CHUNK) {
        const slice = ready.slice(i, i + CHUNK)
        await this.mirror.putMany(
          tx,
          slice.map((p) => p.ref),
        )
        await this.repo.insertLeads(
          tx,
          slice.map((p) => p.row),
        )
      }

      return this.repo.writeBatchNote(tx, {
        actorId: who.id,
        note: noteOf(body, codes),
      })
    })

    return LeadImportCommitResponse.parse({
      ...report,
      batchId: batch.id,
      at: batch.at.toISOString(),
      intake: 'IMPORT',
      motion: body.motion,
      accepted: codes.length,
      codes,
    })
  }

  // ── the shared half ──────────────────────────────────────────────────────

  /** Load what the check needs, then run THE check.
   *
   *  Both import doors come through here, which is the whole reason "the
   *  preview said it was clean" and "the commit reported errors" cannot become
   *  two different sentences about one file. The reads are identical too: the
   *  same staff book, the same live mailboxes, the same lookup. */
  private async check(handle: Db, body: LeadImportBody): Promise<ImportCheck> {
    const mailboxes = body.rows
      .map((r) => r.values.email?.trim().toLowerCase())
      .filter((e): e is string => e !== undefined && e !== '')

    const [staff, book] = await Promise.all([
      this.repo.staff(handle),
      this.repo.liveByEmail(handle, [...new Set(mailboxes)]),
    ])

    return checkBatch({
      rows: body.rows,
      motion: body.motion,
      ...(body.source === undefined ? {} : { source: body.source }),
      staff,
      /* The check speaks in dedupe keys, the table speaks in mailboxes. One
         `keyOf` on both sides is what keeps the two vocabularies from needing
         a translation nobody maintains. */
      book: new Map([...book].map(([email, code]) => [keyOf(email), code])),
    })
  }
}

/** Rows per statement. See the note at the call site — this is the bind
 *  parameter ceiling, not a durability boundary. */
const CHUNK = 500

/** The batch record's note.
 *
 *  JSON rather than prose because something will have to read it back: the
 *  contract promises that a batch id makes a wrong load undoable, and with no
 *  `batch_id` column on `sales.lead` this line is the only place the batch →
 *  rows link exists at all. Who and when are already columns of
 *  `platform.audit`; this carries the rest. */
function noteOf(body: LeadImportBody, codes: readonly string[]): string {
  return JSON.stringify({
    kind: 'lead-import',
    file: body.fileName,
    intake: 'IMPORT',
    motion: body.motion,
    ...(body.source === undefined ? {} : { source: body.source }),
    accepted: codes.length,
    codes,
  })
}
