import { and, asc, count, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import { CURRENCIES, type AccountBookQuery } from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { contains } from '@api/platform/db/like'
import { actor } from '@api/platform/db/platform.schema'
import { contract } from '../contract/contract.schema'
import { lead } from '../lead/lead.schema'
import { opportunity } from '../opportunity/opportunity.schema'
import { contact } from '../contact/contact.schema'
import { account, type AccountRowDb } from './account.schema'
import type { AccountValues } from './account.mapper'

/** `AC-0001`. Drizzle has no expression node for `nextval`, so the sequence name
 *  is written out once here — the same trade `opportunity.repository.ts` and
 *  `lead.repository.ts` already made. */
const NEXT_CODE = sql`SELECT 'AC-' || lpad(nextval('sales.account_code_seq')::text, 4, '0') AS code`

/** The four numbers that turn a name into a customer.
 *
 *  ------------------------------------------------------------------
 *  SCALAR SUBQUERIES, NOT JOINS WITH A `GROUP BY`
 *  ------------------------------------------------------------------
 *  Joining three child tables and grouping would multiply rows before it counts
 *  them — a company with two leads and three deals produces six rows, and every
 *  count on the page comes out inflated in a way that looks plausible. The
 *  classic fix is `count(DISTINCT …)` on each, which works and reads as if the
 *  duplication were intended rather than fought.
 *
 *  Each subquery answers exactly one question against one relation, so the
 *  numbers cannot contaminate each other. They are also individually indexed:
 *  `lead.account_code` and `opportunity.lead_code` both carry one.
 *
 *  All four are correlated on `sales.account.code` of the OUTER query, which is
 *  why they are declared here as expressions rather than built per call. */
const LEAD_COUNT = sql<number>`(
  SELECT count(*)::int FROM ${lead} WHERE ${lead.accountCode} = ${account.code}
)`

const OPEN_DEALS = sql<number>`(
  SELECT count(*)::int
  FROM ${opportunity}
  JOIN ${lead} ON ${lead.code} = ${opportunity.leadCode}
  WHERE ${lead.accountCode} = ${account.code} AND ${opportunity.closedAt} IS NULL
)`

/** Signed = a row exists in `sales.contract`. Counted from the contract side
 *  rather than from `opportunity.state`, because "won" is not a state of a deal
 *  in this schema — it is the existence of that row, and reading it any other
 *  way builds the second source of truth `opportunity.schema.ts` refuses. */
const SIGNED_DEALS = sql<number>`(
  SELECT count(*)::int
  FROM ${contract}
  JOIN ${lead} ON ${lead.code} = ${contract.leadCode}
  WHERE ${lead.accountCode} = ${account.code}
)`

/** Everything signed, converted to dong with the same rate table the deal book
 *  sorts by. Two sums about one company have to come from one table, or the
 *  account page and the deal page disagree about the same customer.
 *
 *  `COALESCE(…, 0)` because "this customer has signed nothing" is zero dong, not
 *  an unknown — unlike a single deal with no amount, where NULL is the honest
 *  answer and the deal book keeps it. */
const SIGNED_AMOUNT_VND = sql<number>`(
  SELECT COALESCE(SUM(CASE ${contract.currency} ${sql.join(
    CURRENCIES.map((c) => sql`WHEN ${c.code} THEN ${contract.amount} * ${sql.raw(String(c.rate))}`),
    sql` `,
  )} END), 0)::bigint
  FROM ${contract}
  JOIN ${lead} ON ${lead.code} = ${contract.leadCode}
  WHERE ${lead.accountCode} = ${account.code}
)`

/** The identity expression `account_identity_uniq` indexes, written a second
 *  time so a lookup can USE that index.
 *
 *  It has to match the index character for character — a lookup written even
 *  slightly differently silently falls back to a sequential scan and, worse,
 *  can disagree with the constraint about whether two rows are the same
 *  company. The index is declared in `account.schema.ts`; this is the only
 *  other place the expression may appear. */
const IDENTITY = sql`coalesce(nullif(btrim(${account.taxCode}), ''), lower(btrim(${account.name})))`

export type AccountRead = AccountRowDb & {
  leads: number
  openDeals: number
  signedDeals: number
  signedAmountVnd: number
}

export type AccountBookPage = {
  rows: AccountRead[]
  total: number
}

/** The only place in the account module with SQL. */
@Injectable()
export class AccountRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  run<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(tx))
  }

  /** Reserve the next code. Called BEFORE opening a transaction, for the reason
   *  spelled out at `opportunity.repository.ts#nextCode`: `nextval` runs on the
   *  pool, and asking for it while holding a transaction makes one request hold
   *  two connections. */
  nextCode(): Promise<string> {
    return this.nextCodeOn(this.db)
  }

  /** Same sequence, but on a handle the caller hands down from ABOVE.
   *
   *  ------------------------------------------------------------------
   *  WHY THE "CALL BEFORE OPENING A TRANSACTION" RULE DOES NOT APPLY HERE
   *  ------------------------------------------------------------------
   *  The other three repositories in this branch all require asking for a
   *  code before opening a transaction, and the reason is always the same:
   *  their `nextCode()` runs on `this.db`, which means asking for a SECOND
   *  connection while the transaction already holds the first — with a pool
   *  of ten, ten simultaneous requests lock each other out.
   *
   *  This function takes `tx`, so it runs on that SAME connection. There is
   *  no second connection, so there is nothing to lock against. That is what
   *  lets `resolveForLead` grant itself a code exactly when it knows it needs
   *  one — instead of forcing all three lead-writing paths to reserve a code
   *  that nine times out of ten goes unused (the company is already on
   *  file), and forcing the import path to reserve five thousand codes for
   *  five thousand rows of the same thirty companies.
   *
   *  `nextval` still does not listen to the transaction: a rolled-back
   *  attempt still burns its number. Gaps in the code sequence are normal —
   *  a code is not a counter. */
  async nextCodeOn(handle: Db): Promise<string> {
    const r = (await handle.execute(NEXT_CODE)) as { rows: { code: string }[] }
    const code = r.rows[0]?.code
    if (!code) {
      throw new Error('sales.account_code_seq trả về rỗng — migration đã chạy chưa?')
    }
    return code
  }

  // ── read ─────────────────────────────────────────────────────────────────

  async book(q: AccountBookQuery): Promise<AccountBookPage> {
    const where = this.filtersOf(q)

    const rows = await this.db
      .select({
        row: account,
        leads: LEAD_COUNT,
        openDeals: OPEN_DEALS,
        signedDeals: SIGNED_DEALS,
        signedAmountVnd: SIGNED_AMOUNT_VND,
      })
      .from(account)
      .where(where)
      .orderBy(...this.orderBy(q))
      .limit(q.size)
      .offset((q.page - 1) * q.size)

    const [tally] = await this.db.select({ n: count() }).from(account).where(where)

    return {
      rows: rows.map((r) => ({
        ...r.row,
        leads: r.leads,
        openDeals: r.openDeals,
        signedDeals: r.signedDeals,
        signedAmountVnd: Number(r.signedAmountVnd),
      })),
      total: tally?.n ?? 0,
    }
  }

  async byCode(code: string): Promise<AccountRead | null> {
    const [found] = await this.db
      .select({
        row: account,
        leads: LEAD_COUNT,
        openDeals: OPEN_DEALS,
        signedDeals: SIGNED_DEALS,
        signedAmountVnd: SIGNED_AMOUNT_VND,
      })
      .from(account)
      .where(eq(account.code, code))
      .limit(1)

    if (!found) return null
    return {
      ...found.row,
      leads: found.leads,
      openDeals: found.openDeals,
      signedDeals: found.signedDeals,
      signedAmountVnd: Number(found.signedAmountVnd),
    }
  }

  /** The enquiries under one company, newest first. */
  async leadsOf(code: string) {
    return this.db
      .select({
        code: lead.code,
        company: lead.company,
        tier: lead.tier,
        stage: lead.stage,
        ownerName: actor.name,
        createdAt: lead.createdAt,
      })
      .from(lead)
      .leftJoin(actor, eq(actor.id, lead.ownerId))
      .where(eq(lead.accountCode, code))
      .orderBy(desc(lead.createdAt))
  }

  /** Deals under one company — open and closed both, because "what have we
   *  tried to sell them" includes the attempts that failed. */
  async dealsOf(code: string) {
    return this.db
      .select({
        code: opportunity.code,
        name: opportunity.name,
        state: opportunity.state,
        amountVnd: sql<number | null>`CASE ${opportunity.currency} ${sql.join(
          CURRENCIES.map(
            (c) => sql`WHEN ${c.code} THEN ${opportunity.amount} * ${sql.raw(String(c.rate))}`,
          ),
          sql` `,
        )} END`,
        contractCode: contract.code,
        createdAt: opportunity.createdAt,
      })
      .from(opportunity)
      .innerJoin(lead, eq(lead.code, opportunity.leadCode))
      .leftJoin(contract, eq(contract.opportunityCode, opportunity.code))
      .where(eq(lead.accountCode, code))
      .orderBy(desc(opportunity.createdAt))
  }

  /** Everyone we know at the company, resolved THROUGH their leads — see the
   *  docblock of `contact.schema.ts` for why the contact row carries no account
   *  code of its own. */
  async contactsOf(code: string) {
    return this.db
      .select({
        code: contact.code,
        leadCode: contact.leadCode,
        name: contact.name,
        title: contact.title,
        email: contact.email,
        phone: contact.phone,
        isPrimary: contact.isPrimary,
      })
      .from(contact)
      .innerJoin(lead, eq(lead.code, contact.leadCode))
      .where(eq(lead.accountCode, code))
      .orderBy(desc(contact.isPrimary), asc(contact.name))
  }

  /** Find a company by the identity rule, using the index that enforces it.
   *
   *  Takes `tx` because the one caller that matters — attaching a company to a
   *  lead being written — must look and insert inside a single transaction, or
   *  two simultaneous enquiries from one factory both find nothing and both
   *  insert. */
  async byIdentity(tx: Db, identity: string): Promise<AccountRowDb | null> {
    const [found] = await tx
      .select()
      .from(account)
      .where(sql`${IDENTITY} = ${identity.toLowerCase()}`)
      .limit(1)
    return found ?? null
  }

  // ── write ────────────────────────────────────────────────────────────────

  async insert(tx: Db, row: AccountValues & { code: string }): Promise<AccountRowDb> {
    const [written] = await tx.insert(account).values(row).returning()
    if (!written) throw new Error(`sales.account: INSERT ${row.code} không trả về dòng nào`)
    return written
  }

  async update(tx: Db, code: string, values: AccountValues): Promise<AccountRowDb | null> {
    const [written] = await tx
      .update(account)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(account.code, code))
      .returning()
    return written ?? null
  }

  /** Point one enquiry at a company, or detach it. */
  async attachLead(tx: Db, leadCode: string, accountCode: string | null): Promise<boolean> {
    const rows = await tx
      .update(lead)
      .set({ accountCode })
      .where(eq(lead.code, leadCode))
      .returning({ code: lead.code })
    return rows.length > 0
  }

  /** Keep a deal's denormalised account in step with its lead's.
   *
   *  `opportunity.account_code` is not a second opinion about which company a
   *  deal belongs to — it is a copy of the lead's, kept so the deal book can
   *  filter by company without a join. Re-pointing a lead has to carry its
   *  deals along, or the two answers separate and only the deal book is wrong. */
  async syncDealsOfLead(tx: Db, leadCode: string, accountCode: string | null): Promise<void> {
    await tx.update(opportunity).set({ accountCode }).where(eq(opportunity.leadCode, leadCode))
  }

  // ── filters and ordering ────────────────────────────────────────────────

  private filtersOf(q: AccountBookQuery): SQL | undefined {
    const parts: SQL[] = []

    if (q.q !== undefined) {
      const needle = contains(q.q)
      const hit = or(
        ilike(account.name, needle),
        ilike(account.legalName, needle),
        ilike(account.taxCode, needle),
      )
      if (hit) parts.push(hit)
    }

    if (q.province !== undefined) parts.push(eq(account.province, q.province))
    if (q.category !== undefined) parts.push(eq(account.category, q.category))

    /* "Already bought" and "not yet bought" are the two frozen scenarios of
       this repo, asked of the live book: a company is a customer exactly when
       a contract exists under one of its leads. Written as EXISTS rather than
       as `SIGNED_DEALS > 0` so Postgres can stop at the first row instead of
       counting them all. */
    if (q.customer !== undefined) {
      const signed = sql`EXISTS (
        SELECT 1 FROM ${contract}
        JOIN ${lead} ON ${lead.code} = ${contract.leadCode}
        WHERE ${lead.accountCode} = ${account.code}
      )`
      parts.push(q.customer === 1 ? signed : sql`NOT ${signed}`)
    }

    return parts.length > 0 ? and(...parts) : undefined
  }

  private orderBy(q: AccountBookQuery): SQL[] {
    const dir = q.dir === 'desc' ? desc : asc

    const column = {
      name: account.name,
      province: account.province,
      createdAt: account.createdAt,
      leads: LEAD_COUNT,
      openDeals: OPEN_DEALS,
      signedDeals: SIGNED_DEALS,
      signedAmountVnd: SIGNED_AMOUNT_VND,
    }[q.sort]

    /* `code` as the tiebreaker on every sort, and it is not decoration: three
       of the seven sort keys are aggregates that tie constantly — a book where
       forty companies all have zero deals would otherwise shuffle between two
       requests for the same page, and the pager would show the same company
       twice while hiding another. */
    return [dir(column), asc(account.code)]
  }
}
