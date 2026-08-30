import { and, asc, count, desc, eq, exists, ilike, inArray, or, sql, type SQL } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import type { ContractBookQuery } from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { contains } from '@api/platform/db/like'
import { actor } from '@api/platform/db/platform.schema'
import { lead } from '../lead/lead.schema'
import { opportunity, opportunityOwner } from '../opportunity/opportunity.schema'
import { contract, contractPaymentTerm, type ContractRowDb } from './contract.schema'
import type { ContractTermRowDb } from './contract.schema'

/** Một dòng hợp đồng kèm tên người ăn hoa hồng. */
export type ContractRead = {
  row: ContractRowDb
  ownerName: string | null
}

/** A contract row loaded with everything the book prints: the customer name and
 *  the instalment plan. */
export type ContractBookRead = ContractRead & {
  account: string
  terms: ContractTermRowDb[]
  /** Whoever stands on the DEAL, not whoever takes the contract's commission.
   *
   *  E2's scope axis asks "does this row stand in your name", and for a
   *  contract that question is answered on the deal — commission may land on
   *  somebody who never owned the deal, so `owner_id` cannot stand in for it.
   *  Same name `OpportunityService.book` feeds `ObjectRef.owner` with, and it
   *  has to be, or the two nets ask two different questions. */
  scopeOwner: string | null
}

export type ContractBookPage = {
  rows: ContractBookRead[]
  total: number
  hidden: number
}

/** Một số từ `sales.contract_code_seq`, in ra dạng `HĐ-%04d`.
 *
 *  Dãy khai ở `contract.schema.ts` để `drizzle-kit` sở hữu nó; Drizzle không có
 *  node biểu thức cho `nextval` nên tên phải viết lại đúng một lần ở đây — cùng
 *  đánh đổi mà `lead.repository.ts` và `opportunity.repository.ts` đã ghi.
 *
 *  Tiền tố có dấu, và nó nằm trong một chuỗi SQL. An toàn vì kết nối chạy
 *  UTF-8 hai đầu và chuỗi này là hằng số trong mã nguồn, không ghép từ dữ liệu
 *  người dùng — nhưng nó cũng chính là lý do `MaHopDong` phải là một primitive
 *  riêng thay vì `MaObject`, và lý do đó đã ghi ở hợp đồng. */
const NEXT_CODE = sql`SELECT 'HĐ-' || lpad(nextval('sales.contract_code_seq')::text, 4, '0') AS code`

/** Chỗ DUY NHẤT có SQL ghi vào `sales.contract`.
 *
 *  ------------------------------------------------------------------
 *  BẢNG NÀY ĐÃ CÓ HAI NGƯỜI ĐỌC TRƯỚC KHI CÓ NGƯỜI GHI
 *  ------------------------------------------------------------------
 *  `OpportunityRepository.signed()` và `LeadRepository.signed()` đều hỏi thẳng
 *  `contract` bằng `EXISTS`, và cả hai ra đời trước file này. Chúng KHÔNG được
 *  gọi qua đây và không nên: một `EXISTS` phải nằm trong chính câu truy vấn của
 *  sổ để đi cùng một lượt quét, còn gọi qua một repository khác là một vòng
 *  mạng thứ hai cho mỗi dòng.
 *
 *  Nên ranh giới ở đây là GHI, không phải bảng: ai cũng đọc được `contract`
 *  trong câu của mình, chỉ có một đường ghi vào nó. */
@Injectable()
export class ContractRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Giữ trước mã kế tiếp. Gọi TRƯỚC khi mở transaction — cùng lý do đầy đủ ở
   *  `OpportunityRepository.nextCode()`: hỏi dãy trong lúc transaction của mình
   *  đang giữ một kết nối là một request chiếm hai kết nối. */
  async nextCode(): Promise<string> {
    const r = (await this.db.execute(NEXT_CODE)) as { rows: { code: string }[] }
    const code = r.rows[0]?.code
    if (!code) {
      throw new Error('sales.contract_code_seq trả về rỗng — migration đã chạy chưa?')
    }
    return code
  }

  async insert(tx: Db, row: typeof contract.$inferInsert): Promise<ContractRowDb> {
    const [written] = await tx.insert(contract).values(row).returning()
    if (!written) throw new Error(`sales.contract: INSERT ${row.code} không trả về dòng nào`)
    return written
  }

  /** Hợp đồng của một cơ hội, nếu có.
   *
   *  Khớp CẢ HAI cột chứ không riêng mã đơn — cùng cặp mà `contract_opportunity_fk`
   *  neo, và đọc bằng cả cặp là cách câu truy vấn nói lại đúng bất biến bảng
   *  đang giữ (cùng lý lẽ với `OpportunityRepository.signed`). */
  async byOpportunity(opportunityCode: string, leadCode: string): Promise<ContractRead | null> {
    const [found] = await this.db
      .select({ row: contract, ownerName: actor.name })
      .from(contract)
      .leftJoin(actor, eq(actor.id, contract.ownerId))
      .where(and(eq(contract.opportunityCode, opportunityCode), eq(contract.leadCode, leadCode)))
      .limit(1)

    return found ?? null
  }

  // ── the contract book ────────────────────────────────────────────────────

  /** One page of the contract book. READ ONLY — pass 4 of the design has no
   *  write door on this table.
   *
   *  ------------------------------------------------------------------
   *  SCOPE READS THE DEAL'S OWNERS, NOT `owner_id`
   *  ------------------------------------------------------------------
   *  A contract has an `owner_id`, and using it here would be the obvious move
   *  and the wrong one: that column says whose commission it is, and the sign
   *  door lets it land on somebody who never stood on the deal. Scope is about
   *  "is this row mine to see", which on a contract means the deal behind it —
   *  the same `sales.opportunity_owner` predicate the Ops book uses, so both
   *  books hide and show the same rows for the same person.
   *
   *  `total` and `hidden` stay apart exactly as in the Ops book: `hidden` is the
   *  difference between two counts under the SAME filter, differing only on the
   *  scope axis, and the second count runs only when that axis is really
   *  cutting. Counting the whole table to print a zero is paying for a question
   *  nobody asked. */
  async book(who: Actor, q: ContractBookQuery, scoped: boolean): Promise<ContractBookPage> {
    const scope = this.scopeOf(who, scoped)
    const filter = this.filterOf(q)
    const where = and(filter, scope)

    const [scopedTotal, all] = await Promise.all([
      this.count(where),
      scope ? this.count(filter) : Promise.resolve(null),
    ])

    const rows = await this.readRows(where, this.orderBy(q), {
      limit: q.size,
      offset: (q.page - 1) * q.size,
    })

    return {
      rows,
      total: scopedTotal,
      hidden: all === null ? 0 : all - scopedTotal,
    }
  }

  /** One contract by code, carrying the scope axis' verdict on itself.
   *
   *  `inScope` travels WITH the data instead of filtering it out, the shape
   *  `OpportunityRepository.byCode` uses and for the same reason: 404 "there is
   *  no such contract" and 403 "that contract is not on your deal" are two
   *  different sentences, and a query already filtered by scope can only say
   *  the first one. */
  async byCode(
    who: Actor,
    code: string,
  ): Promise<(ContractBookRead & { inScope: boolean }) | null> {
    const [found] = await this.readRows(eq(contract.code, code), [], { limit: 1 })
    if (!found) return null

    const scope = this.scopeOf(who, true)
    if (!scope) return { ...found, inScope: true }

    const [seen] = await this.db
      .select({ code: contract.code })
      .from(contract)
      .innerJoin(opportunity, eq(opportunity.code, contract.opportunityCode))
      .where(and(eq(contract.code, code), scope))
      .limit(1)

    return { ...found, inScope: seen !== undefined }
  }

  /** The book's ONLY read path — both the page and the single row come through
   *  here.
   *
   *  One function rather than two because the row shape has to match: `byCode`
   *  returns exactly what `book` returns, so the contract card on a deal profile
   *  and the row in the book never read as two different things. They differ in
   *  `WHERE`, `ORDER BY` and `LIMIT`, which is what the caller passes in. */
  private async readRows(
    where: SQL | undefined,
    orderBy: SQL[],
    page: { limit: number; offset?: number },
  ): Promise<ContractBookRead[]> {
    const rows = await this.db
      .select({
        row: contract,
        ownerName: actor.name,
        account: lead.company,
      })
      .from(contract)
      .innerJoin(opportunity, eq(opportunity.code, contract.opportunityCode))
      .innerJoin(lead, eq(lead.code, contract.leadCode))
      .leftJoin(actor, eq(actor.id, contract.ownerId))
      .where(where)
      .orderBy(...orderBy)
      .limit(page.limit)
      .offset(page.offset ?? 0)

    const codes = rows.map((r) => r.row.code)
    const [terms, scopeOwners] = await Promise.all([
      this.termsOf(codes),
      this.scopeOwnersOf(rows.map((r) => r.row.opportunityCode)),
    ])

    return rows.map((r) => ({
      ...r,
      terms: terms.get(r.row.code) ?? [],
      scopeOwner: scopeOwners.get(r.row.opportunityCode) ?? null,
    }))
  }

  /** Every instalment on the page, in ONE read.
   *
   *  One query for the page rather than one per row — the move
   *  `OpportunityRepository.ownersOf` makes, for the reason it writes down: 50
   *  rows would be 50 round trips to Neon, and Neon bills for time awake. `IN`
   *  rides `contract_payment_term_pk`, whose leading column is
   *  `contract_code`. */
  private async termsOf(codes: string[]): Promise<Map<string, ContractTermRowDb[]>> {
    if (codes.length === 0) return new Map()

    const rows = await this.db
      .select()
      .from(contractPaymentTerm)
      .where(inArray(contractPaymentTerm.contractCode, codes))
      .orderBy(contractPaymentTerm.contractCode, contractPaymentTerm.termNo)

    const byCode = new Map<string, ContractTermRowDb[]>()
    for (const r of rows) {
      const list = byCode.get(r.contractCode)
      if (list) list.push(r)
      else byCode.set(r.contractCode, [r])
    }
    return byCode
  }

  /** One name per deal, for E2's scope axis.
   *
   *  `ObjectRef.owner` carries exactly ONE name, so this takes the first under
   *  the same order `ownersOf` uses (`role` then `name`) — two places sorting
   *  differently would give one deal two different owners on two screens. */
  private async scopeOwnersOf(opportunityCodes: string[]): Promise<Map<string, string>> {
    if (opportunityCodes.length === 0) return new Map()

    const rows = await this.db
      .select({ code: opportunityOwner.opportunityCode, name: actor.name })
      .from(opportunityOwner)
      .innerJoin(actor, eq(actor.id, opportunityOwner.actorId))
      .where(inArray(opportunityOwner.opportunityCode, opportunityCodes))
      .orderBy(opportunityOwner.role, actor.name)

    const byCode = new Map<string, string>()
    for (const r of rows) if (!byCode.has(r.code)) byCode.set(r.code, r.name)
    return byCode
  }

  /** Count under the same filter `book()` uses.
   *
   *  JOINS `lead` although it selects no column of it: the `q` filter reads
   *  `lead.company`, so a count without the join dies in Postgres with "missing
   *  FROM-clause entry". An inner join on a NOT NULL foreign key does not change
   *  the row count, so `total` stays the number it was. */
  private async count(where: SQL | undefined): Promise<number> {
    const [r] = await this.db
      .select({ n: count() })
      .from(contract)
      .innerJoin(opportunity, eq(opportunity.code, contract.opportunityCode))
      .innerJoin(lead, eq(lead.code, contract.leadCode))
      .where(where)
    return r?.n ?? 0
  }

  /** E2's third axis on this book — see the docblock on `book()`.
   *
   *  `EXISTS` rather than a `JOIN`, for the reason `OpportunityRepository.scopeOf`
   *  writes down: a deal with three owners would multiply its contract row by
   *  three, and the `COUNT` after it would count three. */
  private scopeOf(who: Actor, scoped: boolean): SQL | undefined {
    if (!scoped || !who.ownOnly) return undefined
    return exists(
      this.db
        .select({ one: sql`1` })
        .from(opportunityOwner)
        .where(
          and(
            eq(opportunityOwner.opportunityCode, contract.opportunityCode),
            eq(opportunityOwner.actorId, who.id),
          ),
        ),
    )
  }

  /** The search box, three columns. An empty box means no filter — the
   *  convention all three books follow.
   *
   *  The pattern is built with `contains()` rather than string concatenation:
   *  `%` and `_` typed by a user are LETTERS, not wildcards. */
  private filterOf(q: ContractBookQuery): SQL | undefined {
    if (!q.q) return undefined
    return or(
      ilike(contract.code, contains(q.q)),
      ilike(contract.opportunityCode, contains(q.q)),
      ilike(lead.company, contains(q.q)),
    )
  }

  /** The book's order. The chosen column, then ALWAYS `code`.
   *
   *  `code` breaks ties under every sort: without a tiebreaker Postgres is free
   *  to return two different orders for two calls on the same page, and a row
   *  then shows on both page 1 and page 2, or on neither.
   *
   *  `amount` is NULLABLE — the six older contracts carry no value — so its
   *  blanks sort LAST in BOTH directions. Postgres defaults to `NULLS FIRST` on
   *  `DESC`, which would put an unpriced contract at the top of "largest
   *  contracts". A blank is not an extreme value; it is the sentence "not
   *  known".
   *
   *  It does NOT convert `amount` to a single currency the way the Ops book
   *  does. No screen
   *  sorts this book by converted money yet, and a `CASE` over the rate table is
   *  code for a question nobody asked. The day this book grows a "signed this
   *  month" scorecard, here is where it opens, and `AMOUNT_VND` next door is the
   *  copy to work from. */
  private orderBy(q: ContractBookQuery): SQL[] {
    const dir = q.dir === 'asc' ? 'asc' : 'desc'
    const primary =
      q.sort === 'amount' ? contract.amount : q.sort === 'code' ? contract.code : contract.signedAt

    return [
      q.sort === 'amount'
        ? sql`${primary} ${sql.raw(`${dir} nulls last`)}`
        : dir === 'asc'
          ? asc(primary)
          : desc(primary),
      dir === 'asc' ? asc(contract.code) : desc(contract.code),
    ]
  }

  // ── payment instalments ──────────────────────────────────────────────────

  /** The next instalment number, read INSIDE the writing transaction.
   *
   *  `max(term_no) + 1` rather than a sequence, and the difference matters: this
   *  number is a position on ONE contract's paper, not a code for the whole
   *  system, so it has to restart at 1 per contract and must not have holes —
   *  which is exactly what a sequence gives up in exchange for never colliding.
   *  Read in the same transaction as the INSERT, so two people clicking at once
   *  do not read the same number; if they somehow do,
   *  `contract_payment_term_pk` refuses the second. */
  async nextTermNo(tx: Db, contractCode: string): Promise<number> {
    const [r] = await tx
      .select({ next: sql<number>`COALESCE(MAX(${contractPaymentTerm.termNo}), 0) + 1` })
      .from(contractPaymentTerm)
      .where(eq(contractPaymentTerm.contractCode, contractCode))
    return Number(r?.next ?? 1)
  }

  async insertTerm(tx: Db, row: typeof contractPaymentTerm.$inferInsert): Promise<void> {
    await tx.insert(contractPaymentTerm).values(row)
  }

  /** Update one instalment. Answers `false` when there is no such instalment —
   *  the door turns that into a 404 naming the number, rather than reporting
   *  success for a write that touched no row. */
  async updateTerm(
    tx: Db,
    contractCode: string,
    termNo: number,
    values: Partial<typeof contractPaymentTerm.$inferInsert>,
  ): Promise<boolean> {
    const written = await tx
      .update(contractPaymentTerm)
      .set(values)
      .where(
        and(
          eq(contractPaymentTerm.contractCode, contractCode),
          eq(contractPaymentTerm.termNo, termNo),
        ),
      )
      .returning({ termNo: contractPaymentTerm.termNo })

    return written.length > 0
  }

  run<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(tx))
  }
}
