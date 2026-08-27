import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import { DB, type Db } from '@api/platform/db/db.module'
import { actor, audit } from '@api/platform/db/platform.schema'
import { configEntry } from '../config/config.schema'
import { lead, type LeadRowDb } from './lead.schema'
import type { ActorLite } from './lead-import.check'
import type { LeadValues } from './lead-write.mapper'

/** THE WRITE HALF OF THE LEAD BOOK'S SQL. Decides nothing.
 *
 *  ------------------------------------------------------------------
 *  WHY A SECOND REPOSITORY AND NOT MORE METHODS ON THE FIRST
 *  ------------------------------------------------------------------
 *  `lead.repository.ts` owns the read path and the code sequence, and it is
 *  being worked on in parallel. Splitting the write statements into their own
 *  file keeps two people out of one file; it is a boundary of convenience, not
 *  of design, and the day it stops being useful the two merge back into one.
 *
 *  What is NOT duplicated: `nextCode()`. This class never mints a code —
 *  `LeadWriteService` injects `LeadRepository` and asks it, because a second
 *  spelling of `nextval('sales.lead_code_seq')` is a second place for the code
 *  format to drift.
 *
 *  ------------------------------------------------------------------
 *  EVERY WRITE TAKES A TRANSACTION HANDLE
 *  ------------------------------------------------------------------
 *  Same contract `ObjectMirror` states and for the same reason: the mirror row
 *  in `platform.object` and the row in `sales.lead` must both land or neither
 *  land, and only the service knows what else belongs in that unit of work. So
 *  the methods below take `tx` rather than reaching for the pool — there is no
 *  second, transaction-less path into these tables for someone to pick up by
 *  accident.
 *
 *  The read methods take a handle too, and that is deliberate rather than
 *  symmetric-for-neatness: the commit path has to read the book from INSIDE
 *  its own transaction, or it checks a book that can change between the check
 *  and the insert. The preview path passes the pool, because it is not allowed
 *  to open anything at all. */
@Injectable()
export class LeadWriteRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** The pool handle, for the read-only path.
   *
   *  Named rather than exposed as `db` so the one place that uses it — the
   *  dry-run preview — reads as a statement about itself. */
  get readonlyHandle(): Db {
    return this.db
  }

  /** One unit of work. Everything a write door does happens inside this. */
  run<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(tx))
  }

  /** The whole staff book: id and display name.
   *
   *  Read whole rather than one lookup per row, because the import resolves a
   *  NAME for every row of a file that can hold five thousand of them. The
   *  table is a company's headcount — tens of rows — so one read of all of it
   *  costs less than the first twenty round trips of the alternative. */
  async staff(tx: Db): Promise<ActorLite[]> {
    return tx.select({ id: actor.id, name: actor.name }).from(actor)
  }

  /** One person, for the manual door.
   *
   *  Returns the mailbox as well: `LeadRow` prints the owner's mailbox in the
   *  Lead PIC cell, and the response of `POST /sales/leads` is a full book row.
   *  Null means no such actor — the insert will then fail on
   *  `lead_owner_id_actor_id_fk`, which is the fence that actually holds. */
  async actorById(tx: Db, id: string): Promise<{ id: string; name: string; email: string } | null> {
    const [row] = await tx
      .select({ id: actor.id, name: actor.name, email: actor.email })
      .from(actor)
      .where(eq(actor.id, id))
      .limit(1)
    return row ?? null
  }

  /** The NAME of one campaign, for the manual door.
   *
   *  `POST /sales/leads` answers with a full book row, and a book row carries
   *  `source.campaignName` beside `source.campaignId` so that nothing
   *  downstream ever has a reason to print the raw `SR-…` code. Read after the
   *  insert rather than derived from the body: the body only holds an id, and
   *  an id is not a name.
   *
   *  `list = 'SOURCE'` for the same reason `CAMPAIGN_ON` spells it in
   *  `lead.repository.ts` — a `campaignId` that names a pipeline stage must
   *  come back with no name, not with the stage's name.
   *
   *  Null means the campaign does not exist, and this does NOT refuse the
   *  write. The column has no foreign key yet (debt recorded on it in
   *  `lead.schema.ts`), so refusing here would be one door checking what the
   *  other three do not — the same half-fence `actorById` above deliberately
   *  declines to build. The response then omits the name, which is exactly
   *  what the read path does for the same row. */
  async campaignName(tx: Db, id: string): Promise<string | null> {
    const [row] = await tx
      .select({ name: configEntry.name })
      .from(configEntry)
      .where(and(eq(configEntry.id, id), eq(configEntry.list, 'SOURCE')))
      .limit(1)
    return row?.name ?? null
  }

  /** Which of these mailboxes already belong to a LIVE lead.
   *
   *  ------------------------------------------------------------------
   *  THE `WHERE` HAS TO MATCH THE INDEX, NOT MERELY RESEMBLE IT
   *  ------------------------------------------------------------------
   *  `lead_email_live_idx` is unique on `lower(email)` among rows with
   *  `exit_reason IS NULL`. Both halves are copied here on purpose. Drop the
   *  `lower()` and two spellings of one mailbox read as two different leads —
   *  the check passes and the INSERT then dies on the index, turning a row
   *  the preview called clean into a failed batch. Drop the exit filter and a
   *  customer who left the funnel last year can never come back as a new lead,
   *  which is a real and legitimate thing for a customer to do.
   *
   *  Asked about the batch's own mailboxes only, never `SELECT email FROM
   *  lead`: the book is a hundred rows today and will not be, and the answer
   *  needed is about at most five thousand named addresses. */
  async liveByEmail(tx: Db, emails: readonly string[]): Promise<Map<string, string>> {
    if (emails.length === 0) return new Map()

    const rows = await tx
      .select({ key: sql<string>`lower(${lead.email})`, code: lead.code })
      .from(lead)
      .where(and(isNull(lead.exitReason), inArray(sql`lower(${lead.email})`, [...emails])))

    return new Map(rows.map((r) => [r.key, r.code]))
  }

  /** Write the leads. The mirror rows must already be in this transaction.
   *
   *  One statement for the whole batch rather than one per row: a 500-row file
   *  otherwise becomes 500 round trips to Neon, every one of them inside an
   *  open transaction holding its locks that much longer — the same argument
   *  `ObjectMirror.putMany` makes about the row it writes first.
   *
   *  `returning()` because the caller has to answer with the row as the book
   *  would show it, and two of those columns (`required_filled`,
   *  `optional_filled`) are GENERATED: only the database knows them, and only
   *  after the insert. */
  async insertLeads(
    tx: Db,
    rows: readonly (LeadValues & { code: string })[],
  ): Promise<LeadRowDb[]> {
    if (rows.length === 0) return []
    return tx
      .insert(lead)
      .values([...rows])
      .returning()
  }

  /** One public intake insert. A duplicate-email race is allowed to throw so
   *  Postgres rolls back the mirror row; the service recognises exactly that
   *  named constraint and returns the generic public acknowledgement. */
  async insertLandingLead(tx: Db, row: LeadValues & { code: string }): Promise<LeadRowDb> {
    const [written] = await tx.insert(lead).values(row).returning()
    if (!written) throw new Error(`sales.lead: INSERT ${row.code} không trả về dòng nào`)
    return written
  }

  /** One row in `platform.audit` for one load. The batch record.
   *
   *  ------------------------------------------------------------------
   *  WHY NOT `AuditRepository.write`
   *  ------------------------------------------------------------------
   *  Two reasons, both about this exact call. It writes through the pool, so
   *  it cannot join the transaction that is writing the leads — a load that
   *  rolled back would leave a batch record for rows that do not exist. And it
   *  returns nothing, while `LeadImportCommitResponse.batchId` is the id of
   *  this very row. Same table, same append-only rule, one statement further
   *  in.
   *
   *  ------------------------------------------------------------------
   *  THE CODES GO IN THE NOTE, AND THAT IS A STOPGAP
   *  ------------------------------------------------------------------
   *  The contract says deleting a batch deletes exactly its rows. Nothing in
   *  `sales.lead` records which batch wrote a row — there is no `batch_id`
   *  column — so the only place that link can exist today is here. JSON rather
   *  than prose because something will eventually have to read it back. The
   *  real fix is a column, and a column is a migration. */
  async writeBatchNote(
    tx: Db,
    entry: { actorId: string; note: string },
  ): Promise<{ id: string; at: Date }> {
    const [row] = await tx
      .insert(audit)
      .values({ actorId: entry.actorId, action: 'sửa', note: entry.note })
      .returning({ id: audit.id, at: audit.at })

    if (!row) throw new Error('platform.audit: INSERT không trả về dòng nào')
    return row
  }
}
