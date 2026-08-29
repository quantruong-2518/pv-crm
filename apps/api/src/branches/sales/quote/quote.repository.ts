import { and, asc, count, eq, exists, ilike, inArray, ne, or, sql, type SQL } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import type { QuoteBookQuery, QuoteStatus } from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { contains } from '@api/platform/db/like'
import { lead } from '../lead/lead.schema'
import { opportunityOwner } from '../opportunity/opportunity.schema'
import { quote, quoteLine, type QuoteLineRowDb, type QuoteRowDb } from './quote.schema'
import type { QuoteLineValues, QuoteValues } from './quote.mapper'

/** One quote loaded with everything it needs to go on screen. */
export type QuoteRead = {
  row: QuoteRowDb
  account: string
  lines: QuoteLineRowDb[]
}

/** A book row, plus the two facts E2's second net needs to ask the SAME question
 *  the SQL just asked.
 *
 *  `inScope` is "is the reader standing on this quote's deal", and `ownerName`
 *  is who to name when they are not. Without the pair, the service would have to
 *  build an `ObjectRef` naming some owner or other, and the deal book has
 *  already recorded what that costs: E2 compares ONE name, so a reader who is on
 *  the deal beside somebody else gets their own row cut by the inner fence,
 *  `hidden` counts a row that is theirs, and the same row opens fine through the
 *  by-code door. Two definitions of "mine", disagreeing. */
export type QuoteBookRow = QuoteRead & { inScope: boolean; ownerName: string | null }

export type QuoteBookPage = {
  rows: QuoteBookRow[]
  total: number
  /** Rows the scope axis removed — rule 7, and the server has to count them
   *  because the screen cannot count what it never received. */
  hidden: number
}

/** One number from `sales.quote_code_seq`, printed as `BG-%04d`.
 *
 *  The sequence is declared in `quote.schema.ts` so `drizzle-kit` owns it;
 *  Drizzle has no expression node for `nextval`, so the name is written out
 *  exactly once here — the same trade the lead and deal repositories record. */
const NEXT_CODE = sql`SELECT 'BG-' || lpad(nextval('sales.quote_code_seq')::text, 4, '0') AS code`

/** The only place the quote module has SQL. Decides nothing about permissions —
 *  it ENFORCES the scope axis the endpoint declared with `@Need({ scoped })`. */
@Injectable()
export class QuoteRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  get readonlyHandle(): Db {
    return this.db
  }

  run<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(tx))
  }

  /** Reserve the next code. Called BEFORE the transaction opens.
   *
   *  Outside it because `nextval` runs on the pool: asking for a number while
   *  your own transaction holds a connection makes one request hold two, and
   *  with a pool of ten, ten simultaneous drafts wait forever on an eleventh
   *  that never comes. `nextval` deliberately ignores rollback — an abandoned
   *  draft burns its number and the next draft takes the one after. Gaps in the
   *  sequence are normal; two quotes with one code are not. */
  async nextCode(): Promise<string> {
    const r = (await this.db.execute(NEXT_CODE)) as { rows: { code: string }[] }
    const code = r.rows[0]?.code
    if (!code) throw new Error('sales.quote_code_seq trả về rỗng — migration đã chạy chưa?')
    return code
  }

  // ── read ─────────────────────────────────────────────────────────────────

  async book(who: Actor, q: QuoteBookQuery, scoped: boolean): Promise<QuoteBookPage> {
    const scope = this.scopeOf(who, scoped)
    const filters = this.filtersOf(q)
    const where = and(...filters, scope)

    /* Count a second time only when the scope axis is actually cutting: for a
       reader who sees the whole book `hidden` is always 0, and a full COUNT to
       print a zero is paying for a question nobody asked. Same move both other
       books make. */
    const [scopedTotal, all] = await Promise.all([
      this.count(where),
      scope ? this.count(and(...filters)) : Promise.resolve(null),
    ])

    const rows = await this.db
      .select({
        row: quote,
        account: lead.company,
        inScope: this.inScopeValue(who),
        ownerName: this.saleOwnerName(),
      })
      .from(quote)
      .innerJoin(lead, eq(lead.code, quote.leadCode))
      .where(where)
      .orderBy(...this.orderBy(q))
      .limit(q.size)
      .offset((q.page - 1) * q.size)

    const lines = await this.linesOf(
      this.db,
      rows.map((r) => r.row.code),
    )

    return {
      rows: rows.map((r) => ({ ...r, lines: lines.get(r.row.code) ?? [] })),
      total: scopedTotal,
      hidden: all === null ? 0 : all - scopedTotal,
    }
  }

  /** One quote by code, carrying the scope verdict ALONGSIDE the data.
   *
   *  Same shape as the deal book's `byCode`, and for the same reason: 404 "there
   *  is no such quote" and 403 "that quote is not yours" are two different
   *  sentences leading to two different next steps, and a query that has already
   *  filtered by scope can only say the first. */
  async byCode(
    who: Actor,
    code: string,
  ): Promise<(QuoteRead & { inScope: boolean; ownerName: string | null }) | null> {
    const [found] = await this.db
      .select({
        row: quote,
        account: lead.company,
        inScope: this.inScopeValue(who),
        ownerName: this.saleOwnerName(),
      })
      .from(quote)
      .innerJoin(lead, eq(lead.code, quote.leadCode))
      .where(eq(quote.code, code))
      .limit(1)

    if (!found) return null

    const lines = await this.linesOf(this.db, [code])
    return { ...found, lines: lines.get(code) ?? [] }
  }

  /** Every version of one deal, oldest first — what the quote card renders.
   *
   *  No scope axis: the caller has already been cleared against the PARENT DEAL,
   *  and a version list that hid some of its own versions would read as a
   *  shorter negotiation than actually happened. */
  async versionsOf(tx: Db, opportunityCode: string): Promise<QuoteRead[]> {
    const rows = await tx
      .select({ row: quote, account: lead.company })
      .from(quote)
      .innerJoin(lead, eq(lead.code, quote.leadCode))
      .where(eq(quote.opportunityCode, opportunityCode))
      .orderBy(asc(quote.version))

    const lines = await this.linesOf(
      tx,
      rows.map((r) => r.row.code),
    )
    return rows.map((r) => ({ ...r, lines: lines.get(r.row.code) ?? [] }))
  }

  /** Lines for a whole page, in ONE query.
   *
   *  One query per row would be fifty round trips to Neon for one page, and Neon
   *  bills by the time it is awake. `IN` over the page's codes rides the
   *  `quote_line_pk`. */
  private async linesOf(tx: Db, codes: string[]): Promise<Map<string, QuoteLineRowDb[]>> {
    if (codes.length === 0) return new Map()

    const rows = await tx
      .select()
      .from(quoteLine)
      .where(inArray(quoteLine.quoteCode, codes))
      .orderBy(quoteLine.quoteCode, quoteLine.lineNo)

    const byCode = new Map<string, QuoteLineRowDb[]>()
    for (const r of rows) {
      const list = byCode.get(r.quoteCode)
      if (list) list.push(r)
      else byCode.set(r.quoteCode, [r])
    }
    return byCode
  }

  /** The newest version of a deal, or `null` when this is its first quote.
   *
   *  Two things read this answer and they must read the SAME one: the version
   *  number to mint, and the node the new quote's edge hangs off. Asking twice
   *  would let a concurrent insert land between the two and produce a version 3
   *  linked behind version 1. Both callers take this one row, inside the
   *  transaction that writes.
   *
   *  `ORDER BY version DESC` rather than `max()` because the code is wanted too,
   *  and `version` carries the unique index that makes the order total. */
  async newestVersion(
    tx: Db,
    opportunityCode: string,
  ): Promise<{ code: string; version: number } | null> {
    const [row] = await tx
      .select({ code: quote.code, version: quote.version })
      .from(quote)
      .where(eq(quote.opportunityCode, opportunityCode))
      .orderBy(sql`${quote.version} desc`)
      .limit(1)

    return row ?? null
  }

  // ── write ────────────────────────────────────────────────────────────────

  async insertQuote(
    tx: Db,
    row: QuoteValues & { code: string; version: number },
  ): Promise<QuoteRowDb> {
    const [written] = await tx.insert(quote).values(row).returning()
    if (!written) throw new Error(`sales.quote: INSERT ${row.code} không trả về dòng nào`)
    return written
  }

  async updateQuote(tx: Db, code: string, values: Partial<QuoteValues>): Promise<QuoteRowDb> {
    const [written] = await tx.update(quote).set(values).where(eq(quote.code, code)).returning()
    if (!written) throw new Error(`sales.quote: UPDATE ${code} không trả về dòng nào`)
    return written
  }

  /** Replace the whole line table of one quote: delete, then insert.
   *
   *  Not a set difference. The compose modal sends the WHOLE table, so the
   *  question here is "what does the list look like now", not "what changed" —
   *  and computing the diff to emit the same result costs more code and one more
   *  place to be wrong. Same call `replaceOwners` makes one table over.
   *
   *  In the caller's transaction, so no reader ever sees a quote with half its
   *  lines. */
  async replaceLines(
    tx: Db,
    code: string,
    lines: readonly QuoteLineValues[],
  ): Promise<QuoteLineRowDb[]> {
    await tx.delete(quoteLine).where(eq(quoteLine.quoteCode, code))
    if (lines.length === 0) return []

    /* `returning()` because `line_total` is GENERATED: only the database knows
       it, and only after the insert. Rebuilding it in Node would be a second
       copy of an expression that already has one — and the copy is exactly what
       makes a printed cell differ from a stored one. */
    return tx
      .insert(quoteLine)
      .values(lines.map((l) => ({ ...l, quoteCode: code })))
      .returning()
  }

  /** Retire every OTHER live version of a deal, at the moment one is sent.
   *
   *  Only rows that actually left the building are touched — `da-gui` and
   *  `khach-chot`. A never-sent draft stays `nhap`, and it has to: the
   *  `quote_sent_pair` CHECK refuses `thay-the` on a row with no send timestamp,
   *  which is the table stating the same rule the design does. An already
   *  refused version stays refused; that is what the customer said.
   *
   *  Demoting a `khach-chot` row is the one that can FAIL, and failing is the
   *  point: once a contract points at that version, its composite foreign key
   *  pins the status, so this UPDATE comes back `23503` instead of quietly
   *  moving the money out from under a signed contract. */
  async supersede(tx: Db, opportunityCode: string, keepCode: string): Promise<QuoteRowDb[]> {
    /* `returning()` because each retired version also needs its `platform.object`
       snapshot refreshed, and the caller cannot refresh rows it does not know it
       changed. Without this the rail keeps printing a superseded draft as the
       live one — wrong on exactly the screen this whole chain exists to draw. */
    return tx
      .update(quote)
      .set({ status: 'thay-the' })
      .where(
        and(
          eq(quote.opportunityCode, opportunityCode),
          ne(quote.code, keepCode),
          inArray(quote.status, ['da-gui', 'khach-chot'] satisfies QuoteStatus[]),
        ),
      )
      .returning()
  }

  // ── the scope axis ───────────────────────────────────────────────────────

  /** E2's third axis on this book: a quote is visible to whoever stands on its
   *  DEAL.
   *
   *  A quote has no owner column of its own, and it must not grow one — the
   *  question "may I read this quote" is the question "may I read the deal it
   *  belongs to", and a second answer to it is a second answer that will one day
   *  differ. Reads both roles, the same as the deal book: cut it to `SALE` and
   *  the BD who opened the customer loses sight of the paper that came out of it.
   *
   *  `EXISTS` rather than a join: a deal with three people on it would multiply
   *  the quote row by three, and the COUNT behind it would then say three. */
  private scopeOf(who: Actor, scoped: boolean): SQL | undefined {
    if (!scoped || !who.ownOnly) return undefined
    return exists(
      this.db
        .select({ one: sql`1` })
        .from(opportunityOwner)
        .where(
          and(
            eq(opportunityOwner.opportunityCode, quote.opportunityCode),
            eq(opportunityOwner.actorId, who.id),
          ),
        ),
    )
  }

  /** The same predicate, SELECTED instead of filtered on — see `byCode`. */
  private inScopeValue(who: Actor): SQL<boolean> {
    const scope = this.scopeOf(who, true)
    return (scope ? sql`COALESCE(${scope}, false)` : sql`true`) as SQL<boolean>
  }

  /** Display name of one Sale standing on the parent deal, for the E1 mirror
   *  row — that table holds labels while the join table holds ids.
   *
   *  A correlated scalar subquery rather than another join, because a deal with
   *  two Sales would otherwise duplicate the quote row. `ORDER BY` makes the
   *  pick stable between two reads: a rail that names a different person each
   *  time it is opened reads as data that just changed. */
  private saleOwnerName(): SQL<string | null> {
    return sql<string | null>`(
      SELECT a.name FROM platform.actor a
        JOIN ${opportunityOwner} oo ON oo.actor_id = a.id
       WHERE oo.opportunity_code = ${quote.opportunityCode} AND oo.role = 'SALE'
       ORDER BY a.name
       LIMIT 1
    )`
  }

  // ── the book's own questions ─────────────────────────────────────────────

  /** Count rows under the same filters `book()` uses.
   *
   *  Joins `lead` even though it selects no column of it: the `q` filter reads
   *  `lead.company`, and a count without the join dies in Postgres with
   *  "missing FROM-clause entry". An inner join on a NOT NULL foreign key does
   *  not change the row count, so `total` is still the number it was. */
  private async count(where: SQL | undefined): Promise<number> {
    const [r] = await this.db
      .select({ n: count() })
      .from(quote)
      .innerJoin(lead, eq(lead.code, quote.leadCode))
      .where(where)
    return r?.n ?? 0
  }

  /** Order: the chosen column, then ALWAYS `code`.
   *
   *  `code` breaks ties on every sort key, not just the default one. Without a
   *  tiebreaker Postgres is free to return two different orders for two reads of
   *  one page, and a row then shows up on both page 1 and page 2, or on neither.
   *  Same warning the deal book's contract writes out. */
  private orderBy(q: QuoteBookQuery): SQL[] {
    const dir = q.dir === 'asc' ? 'asc' : 'desc'

    const primary =
      q.sort === 'validUntil'
        ? quote.validUntil
        : q.sort === 'total'
          ? quote.total
          : quote.createdAt

    return [sql`${primary} ${sql.raw(dir)}`, sql`${quote.code} ${sql.raw(dir)}`]
  }

  /** The USER's filters. The scope axis is not among them — see `book()`.
   *
   *  Every absent field returns `undefined` and Drizzle's `and()` drops it: "an
   *  empty box means no filter" is the convention of all three books, written in
   *  one place instead of an `if` per field. */
  private filtersOf(q: QuoteBookQuery): (SQL | undefined)[] {
    return [
      q.opportunityCode ? eq(quote.opportunityCode, q.opportunityCode) : undefined,
      q.leadCode ? eq(quote.leadCode, q.leadCode) : undefined,
      q.status ? eq(quote.status, q.status) : undefined,
      /* One box, three columns — a quote number pasted out of an email, half a
         company name, a word from the title. Pattern built with `contains()`
         rather than string concatenation: `%` and `_` typed by a user are
         LETTERS, not wildcards. */
      q.q
        ? or(
            ilike(quote.code, contains(q.q)),
            ilike(quote.title, contains(q.q)),
            ilike(lead.company, contains(q.q)),
          )
        : undefined,
    ]
  }
}
