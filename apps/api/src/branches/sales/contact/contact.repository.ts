import { and, asc, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import type { ContactBookQuery } from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { contains } from '@api/platform/db/like'
import { account } from '../account/account.schema'
import { lead } from '../lead/lead.schema'
import { contact, type ContactRowDb } from './contact.schema'
import type { ContactValues } from './contact.mapper'

/** A book row loaded with enough context to show its face: the person, the
 *  lead's company, and the real account if the lead has been attached. */
export type ContactBookRead = {
  row: ContactRowDb
  company: string
  accountCode: string | null
  accountName: string | null
}

const NEXT_CODE = sql`SELECT 'CT-' || lpad(nextval('sales.contact_code_seq')::text, 4, '0') AS code`

/** The five columns of `sales.lead` a primary contact mirrors into.
 *
 *  Named here rather than spelled inline at the call site so the set is visible
 *  as a set. Three of the five (`contact_title`, `phone`, `contact_channel`)
 *  are read by the GENERATED columns `required_filled` / `optional_filled`,
 *  which is the whole reason this mirror exists — see the contract's docblock. */
export type LeadContactMirror = {
  contactName: string
  contactTitle: string | null
  email: string
  phone: string | null
  contactChannel: ContactRowDb['channel']
}

@Injectable()
export class ContactRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  run<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(tx))
  }

  async nextCode(): Promise<string> {
    const r = (await this.db.execute(NEXT_CODE)) as { rows: { code: string }[] }
    const code = r.rows[0]?.code
    if (!code) throw new Error('sales.contact_code_seq trả về rỗng — migration đã chạy chưa?')
    return code
  }

  // ── read ─────────────────────────────────────────────────────────────────

  /** Primary first, then alphabetical. The person who answers the phone belongs
   *  at the top of the list, not wherever the alphabet puts them. */
  async byLead(leadCode: string): Promise<ContactRowDb[]> {
    return this.db
      .select()
      .from(contact)
      .where(eq(contact.leadCode, leadCode))
      .orderBy(desc(contact.isPrimary), asc(contact.name))
  }

  async byCode(code: string): Promise<ContactRowDb | null> {
    const [found] = await this.db.select().from(contact).where(eq(contact.code, code)).limit(1)
    return found ?? null
  }

  /** The whole contact book, cut by the LEAD's scope axis.
   *
   *  ------------------------------------------------------------------
   *  THE SCOPE AXIS RUNS THROUGH LEAD, BECAUSE A PERSON BELONGS TO NO ONE
   *  ------------------------------------------------------------------
   *  `sales.contact` has no owner column and never will: a contact is the
   *  CUSTOMER's person, not the salesperson's. What an `ownOnly` actor gets
   *  to see here is exactly the set of contacts hanging under the leads they
   *  get to see — the same rule `LeadService.guardByContact` enforces on the
   *  three single-row endpoints, written in SQL so the whole page is cut in
   *  one pass instead of loaded and then filtered.
   *
   *  Drop this axis and a directory screen turns into a data-export
   *  endpoint: every phone number of every customer in the department, for
   *  anyone who opens the screen.
   *
   *  Joins `sales.account` with LEFT JOIN, not INNER: a lead entered before
   *  the customer book existed may not have a company attached yet, and its
   *  contacts still have to show up in this book. The screen falls back to
   *  the lead's `company` when it's missing. */
  async book(
    who: Actor,
    q: ContactBookQuery,
    scoped: boolean,
  ): Promise<{ rows: ContactBookRead[]; total: number }> {
    /* The same predicate `LeadRepository.scopeOf` uses, rewritten here rather
       than borrowed: every repository in this branch keeps its own scope
       axis (the deal book also has its own `scopeOf`, cut through the table
       that joins the deal's owner). They are not three copies of one rule —
       they are three different questions over three different tables, and
       this one happens to go through the same column the lead book does
       because it JOINs that same table. */
    const scope = scoped && who.ownOnly ? eq(lead.ownerId, who.id) : undefined
    const where = and(...this.filtersOf(q), scope)

    const rows = await this.db
      .select({
        row: contact,
        company: lead.company,
        accountCode: lead.accountCode,
        accountName: account.name,
      })
      .from(contact)
      .innerJoin(lead, eq(lead.code, contact.leadCode))
      .leftJoin(account, eq(account.code, lead.accountCode))
      .where(where)
      .orderBy(...this.orderBy(q))
      .limit(q.size)
      .offset((q.page - 1) * q.size)

    const [tally] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(contact)
      .innerJoin(lead, eq(lead.code, contact.leadCode))
      .where(where)

    return { rows, total: tally?.n ?? 0 }
  }

  /** One contact, read with the EXACT same joins the book uses.
   *
   *  Same `select` and same two `JOIN`s as `book()` right above, plus a
   *  predicate on the code. Written out again rather than calling `book`
   *  with `size: 1`: `book` has no filter by code, so calling it that way
   *  would scan the whole book to find one row.
   *
   *  The scope axis is enforced RIGHT HERE rather than checked by the caller
   *  afterward: a `WHERE` that misses it and returns the row, only to be
   *  blocked after, is a row that has already left the database. */
  async oneWithContext(who: Actor, code: string, scoped: boolean): Promise<ContactBookRead | null> {
    const scope = scoped && who.ownOnly ? eq(lead.ownerId, who.id) : undefined

    const [found] = await this.db
      .select({
        row: contact,
        company: lead.company,
        accountCode: lead.accountCode,
        accountName: account.name,
      })
      .from(contact)
      .innerJoin(lead, eq(lead.code, contact.leadCode))
      .leftJoin(account, eq(account.code, lead.accountCode))
      .where(and(eq(contact.code, code), scope))
      .limit(1)

    return found ?? null
  }

  private filtersOf(q: ContactBookQuery): SQL[] {
    const parts: SQL[] = []

    if (q.q !== undefined) {
      const needle = contains(q.q)
      const hit = or(
        ilike(contact.name, needle),
        ilike(contact.email, needle),
        ilike(contact.phone, needle),
      )
      if (hit) parts.push(hit)
    }

    if (q.primary === '1') parts.push(eq(contact.isPrimary, true))
    if (q.account !== undefined) parts.push(eq(lead.accountCode, q.account))

    return parts
  }

  private orderBy(q: ContactBookQuery): SQL[] {
    const dir = q.dir === 'desc' ? desc : asc
    const column = {
      name: contact.name,
      company: lead.company,
      createdAt: contact.createdAt,
    }[q.sort]

    /* `code` settles the ranking, for the same reason the company book does:
       two people sharing a name at two different companies is ordinary, and
       without a tiebreaker they swap places between two page turns — the
       next page reprints one person and hides another. */
    return [dir(column), asc(contact.code)]
  }

  /** How many people are already recorded for this lead.
   *
   *  Read inside the write transaction, because the answer decides whether the
   *  row being written becomes primary — "the first contact is the primary one"
   *  is the half of the rule an index cannot state. Reading it outside would
   *  make two simultaneous first contacts both believe they are first, and the
   *  second would lose to `contact_primary_uniq` with a confusing message. */
  async countOf(tx: Db, leadCode: string): Promise<number> {
    const [row] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(contact)
      .where(eq(contact.leadCode, leadCode))
    return row?.n ?? 0
  }

  // ── write ────────────────────────────────────────────────────────────────

  async insert(tx: Db, row: ContactValues & { code: string }): Promise<ContactRowDb> {
    const [written] = await tx.insert(contact).values(row).returning()
    if (!written) throw new Error(`sales.contact: INSERT ${row.code} không trả về dòng nào`)
    return written
  }

  async patch(tx: Db, code: string, values: Partial<ContactValues>): Promise<ContactRowDb | null> {
    const [written] = await tx
      .update(contact)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(contact.code, code))
      .returning()
    return written ?? null
  }

  async remove(tx: Db, code: string): Promise<boolean> {
    const rows = await tx
      .delete(contact)
      .where(eq(contact.code, code))
      .returning({ code: contact.code })
    return rows.length > 0
  }

  /** Demote whoever currently holds the flag on this lead.
   *
   *  Must run BEFORE the promote in the same transaction. The other order dies
   *  on the partial unique index — which is exactly why promoting is an
   *  endpoint of its own rather than a field on `PATCH`, per the contract. */
  async demote(tx: Db, leadCode: string): Promise<void> {
    await tx
      .update(contact)
      .set({ isPrimary: false, updatedAt: new Date() })
      .where(and(eq(contact.leadCode, leadCode), eq(contact.isPrimary, true)))
  }

  async promote(tx: Db, code: string): Promise<void> {
    await tx
      .update(contact)
      .set({ isPrimary: true, updatedAt: new Date() })
      .where(eq(contact.code, code))
  }

  /** Copy the primary contact onto the lead's five columns.
   *
   *  THE ONLY WRITER of those five, and that is what makes the duplication
   *  survivable rather than a drift waiting to happen — the moment a second
   *  writer exists, the profile screen shows a person the contact list does not
   *  contain. See the contract's docblock for why the columns cannot simply be
   *  dropped instead.
   *
   *  `email` is `NOT NULL` on the lead and optional on a contact, so a primary
   *  with no mailbox leaves the lead's address alone rather than trying to
   *  clear it. That is not a special case bolted on: the lead's mailbox is a
   *  guarantee the MAS mail flow depends on, and promoting somebody who only
   *  answers Zalo must not take the branch's main flow down with it. */
  async mirrorOntoLead(tx: Db, leadCode: string, row: ContactRowDb): Promise<void> {
    await tx
      .update(lead)
      .set({
        contactName: row.name,
        contactTitle: row.title,
        phone: row.phone,
        contactChannel: row.channel,
        ...(row.email ? { email: row.email } : {}),
      })
      .where(eq(lead.code, leadCode))
  }
}
