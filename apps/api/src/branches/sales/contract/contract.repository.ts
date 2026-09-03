import { and, asc, count, desc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import { DUE_NEAR_DAYS, type Actor } from '@pv/engines'
import type { ContractMonthPoint, ContractSummary, PageQuery } from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import { lead } from '../lead/lead.schema'
import { dongOf } from '../money'
import {
  contract,
  contractCondition,
  contractDocument,
  contractInstallment,
  contractNote,
  contractRecord,
  type ContractConditionRowDb,
  type ContractDocumentRowDb,
  type ContractInstallmentRowDb,
  type ContractNoteRowDb,
  type ContractRecordRowDb,
  type ContractRowDb,
} from './contract.schema'

/** Một dòng hợp đồng kèm tên người ăn hoa hồng. */
export type ContractRead = {
  row: ContractRowDb
  ownerName: string | null
}

/** One book line: the row plus the LEAN schedule the table paints.
 *
 *  `customer` is not a column of the wire row — the book prints codes and
 *  money, not the account name. It is read anyway because the second E2 grid
 *  in the service needs an `ObjectRef` label, and a label that is the code
 *  again says nothing to whoever reads an audit line. */
export type ContractBookRead = ContractRead & {
  customer: string
  installments: ContractInstallmentRowDb[]
}

export type ContractBookPage = {
  rows: ContractBookRead[]
  /** Rows the scope axis cut. The screen has to print it (rule 7) and only the
   *  server can count what it did not send. */
  hidden: number
  total: number
}

/** One installment with its four child lists — the profile shape, never the
 *  book's. */
export type InstallmentRead = {
  row: ContractInstallmentRowDb
  conditions: ContractConditionRowDb[]
  docs: ContractDocumentRowDb[]
  records: ContractRecordRowDb[]
  notes: ContractNoteRowDb[]
}

export type ContractDetailRead = ContractRead & {
  customer: string
  contact: string
  /** NULL when the lead never carried a job title — the mapper decides what to
   *  print, because that is a display decision. */
  contactRole: string | null
  inScope: boolean
  installments: InstallmentRead[]
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

/** The signed value of a contract in dong. Shared expression, one rate table —
 *  see `../money.ts`. */
const CONTRACT_VND = dongOf(contract.amount, contract.currency)

/** How far back the trend strip reaches. Twelve points including the current
 *  month, which is what `ContractSummary.byMonth` promises. */
const TREND_MONTHS = 12

/** Chỗ DUY NHẤT có SQL của module hợp đồng — cả đường ghi lẫn đường đọc.
 *
 *  ------------------------------------------------------------------
 *  BẢNG NÀY ĐÃ CÓ HAI NGƯỜI ĐỌC TRƯỚC KHI CÓ NGƯỜI GHI, VÀ HỌ VẪN ĐỌC THẲNG
 *  ------------------------------------------------------------------
 *  `OpportunityRepository.signed()` và `LeadRepository.signed()` đều hỏi thẳng
 *  `contract` bằng `EXISTS`, và cả hai ra đời trước file này. Chúng KHÔNG được
 *  gọi qua đây và không nên: một `EXISTS` phải nằm trong chính câu truy vấn của
 *  sổ để đi cùng một lượt quét, còn gọi qua một repository khác là một vòng
 *  mạng thứ hai cho mỗi dòng.
 *
 *  Nên ranh giới của file KHÔNG phải "mọi lượt đọc bảng này": ai cũng đọc được
 *  `contract` trong câu của mình. Ranh giới là SỔ HỢP ĐỒNG — mọi thứ trả lời
 *  câu "hợp đồng này gồm những gì" — cộng với đường ghi duy nhất vào bảng.
 *
 *  Trục phạm vi không được quyết định ở đây: file này chỉ THI HÀNH cờ
 *  `scoped: true` mà endpoint đã khai. */
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

  // -- read ------------------------------------------------------------------

  /** The book. Lean installments only, and one extra query for all of them.
   *
   *  A page of 50 contracts pulling its schedule row by row is 50 round trips
   *  to Neon, which bills for time awake; one `IN` over the page rides the
   *  installment primary key. The four child tables are NOT touched here —
   *  that is the whole difference between this door and the profile. */
  async book(who: Actor, q: PageQuery, scoped: boolean): Promise<ContractBookPage> {
    const scope = this.scopeOf(who, scoped)

    /* Count a second time only when the scope axis is actually cutting: for
       someone who sees the whole book `hidden` is always 0, and a full COUNT
       to print a zero is paying for a question nobody asked. Same trade the
       other two books took. */
    const [scopedTotal, all] = await Promise.all([
      this.count(scope),
      scope ? this.count(undefined) : Promise.resolve(null),
    ])

    const rows = await this.db
      .select({ row: contract, ownerName: actor.name, customer: lead.company })
      .from(contract)
      .innerJoin(lead, eq(lead.code, contract.leadCode))
      .leftJoin(actor, eq(actor.id, contract.ownerId))
      .where(scope)
      /* Newest signature first, then the code — a book with no tie-break lets
         Postgres return one row on both page 1 and page 2, or on neither. */
      .orderBy(desc(contract.signedAt), asc(contract.code))
      .limit(q.size)
      .offset((q.page - 1) * q.size)

    const schedule = await this.installmentsOf(rows.map((r) => r.row.code))

    return {
      rows: rows.map((r) => ({ ...r, installments: schedule.get(r.row.code) ?? [] })),
      total: scopedTotal,
      hidden: all === null ? 0 : all - scopedTotal,
    }
  }

  /** One contract, fully nested, plus the scope axis' verdict on it.
   *
   *  `inScope` travels WITH the data instead of deciding whether data comes
   *  back — same shape as `OpportunityRepository.byCode` and for the same
   *  reason: "no such contract" and "not your contract" are two different
   *  answers, and a query already filtered by scope can only give the first. */
  async byCode(who: Actor, code: string): Promise<ContractDetailRead | null> {
    const [found] = await this.db
      .select({
        row: contract,
        ownerName: actor.name,
        customer: lead.company,
        contact: lead.contactName,
        contactRole: lead.contactTitle,
        inScope: this.inScopeValue(who),
      })
      .from(contract)
      .innerJoin(lead, eq(lead.code, contract.leadCode))
      .leftJoin(actor, eq(actor.id, contract.ownerId))
      .where(eq(contract.code, code))
      .limit(1)

    if (!found) return null

    /* One query per child table for the WHOLE contract, then grouped in
       memory. Six installments times four tables is 24 round trips the other
       way, and every one of them rides the same index this one does. */
    const [schedule, conditions, docs, records, notes] = await Promise.all([
      this.installmentsOf([code]),
      this.db
        .select()
        .from(contractCondition)
        .where(eq(contractCondition.contractCode, code))
        .orderBy(asc(contractCondition.due), asc(contractCondition.id)),
      this.db
        .select()
        .from(contractDocument)
        .where(eq(contractDocument.contractCode, code))
        .orderBy(asc(contractDocument.name), asc(contractDocument.id)),
      /* Newest first is how a chase history prints — the index on this table
         was declared carrying that order. The id breaks ties so two touches
         logged in the same second do not swap places between two reads. */
      this.db
        .select()
        .from(contractRecord)
        .where(eq(contractRecord.contractCode, code))
        .orderBy(desc(contractRecord.at), asc(contractRecord.id)),
      this.db
        .select()
        .from(contractNote)
        .where(eq(contractNote.contractCode, code))
        .orderBy(desc(contractNote.at), asc(contractNote.id)),
    ])

    const byNo = {
      conditions: groupByInstallment(conditions),
      docs: groupByInstallment(docs),
      records: groupByInstallment(records),
      notes: groupByInstallment(notes),
    }

    return {
      ...found,
      installments: (schedule.get(code) ?? []).map((row) => ({
        row,
        conditions: byNo.conditions.get(row.no) ?? [],
        docs: byNo.docs.get(row.no) ?? [],
        records: byNo.records.get(row.no) ?? [],
        notes: byNo.notes.get(row.no) ?? [],
      })),
    }
  }

  /** The whole book folded to one row — `GET /sales/contracts/summary`.
   *
   *  Four queries rather than one welded statement: they scan three different
   *  tables and the last groups a series, so joining them would only push the
   *  same four scans into the planner behind a shape nobody can read.
   *
   *  No `Actor` and no scope axis, the same call both scorecards made: these
   *  are the desk's numbers, and cutting them by who owns what makes everyone
   *  read a different figure under one label.
   *
   *  `SUM` returns `bigint`, which node-postgres hands back as a STRING while
   *  PGlite gives a number. `Number()` below takes both; casting to `int` in
   *  SQL would blow up on a book worth a few thousand billion dong. */
  async summary(): Promise<ContractSummary> {
    const due = contractInstallment.due
    const money = contractInstallment.amount
    const unpaid = sql`${contractInstallment.paidAt} IS NULL`
    const overdue = sql`${unpaid} AND ${due} < now()`
    /* Bounded on BOTH sides so an installment already late is counted as late
       and not a second time as near. `DUE_NEAR_DAYS` comes from the same
       `@pv/engines` ladder the contract book paints urgency with. */
    const dueSoon = sql`${unpaid} AND ${due} >= now()
      AND ${due} < now() + ${sql.raw(String(DUE_NEAR_DAYS))} * interval '1 day'`

    const [signed, schedule, late, byMonth] = await Promise.all([
      this.db
        .select({
          signedCount: count(),
          signedAmountVnd: sql<number | string>`COALESCE(SUM(${CONTRACT_VND}), 0)::bigint`,
          blankAmount: sql<number>`count(*) FILTER (WHERE ${contract.amount} IS NULL)::int`,
        })
        .from(contract),
      /* Installments carry no currency column — the schedule is drafted in
         dong — so these four sums add the column itself. */
      this.db
        .select({
          scheduledVnd: sql<number | string>`COALESCE(SUM(${money}), 0)::bigint`,
          collectedVnd: sql<
            number | string
          >`COALESCE(SUM(${money}) FILTER (WHERE ${contractInstallment.paidAt} IS NOT NULL), 0)::bigint`,
          overdueVnd: sql<
            number | string
          >`COALESCE(SUM(${money}) FILTER (WHERE ${overdue}), 0)::bigint`,
          overdueCount: sql<number>`count(*) FILTER (WHERE ${overdue})::int`,
          dueSoonVnd: sql<
            number | string
          >`COALESCE(SUM(${money}) FILTER (WHERE ${dueSoon}), 0)::bigint`,
          dueSoonCount: sql<number>`count(*) FILTER (WHERE ${dueSoon})::int`,
        })
        .from(contractInstallment),
      /* Late PAPERWORK, counted per CONDITION and not per contract: two unmet
         lines on one contract are two things to chase, which is what the tile
         has always printed. A separate question from `overdueCount` above —
         that one is money that did not land. */
      this.db
        .select({
          ours: sql<number>`count(*) FILTER (WHERE ${contractCondition.side} = 'ta')::int`,
          theirs: sql<number>`count(*) FILTER (WHERE ${contractCondition.side} = 'khách')::int`,
        })
        .from(contractCondition)
        .where(and(isNull(contractCondition.doneAt), sql`${contractCondition.due} < now()`)),
      this.trend(),
    ])

    const a = signed[0]
    const b = schedule[0]
    const c = late[0]

    return {
      signedCount: a?.signedCount ?? 0,
      signedAmountVnd: Number(a?.signedAmountVnd ?? 0),
      blankAmount: a?.blankAmount ?? 0,
      scheduledVnd: Number(b?.scheduledVnd ?? 0),
      collectedVnd: Number(b?.collectedVnd ?? 0),
      overdueVnd: Number(b?.overdueVnd ?? 0),
      overdueCount: b?.overdueCount ?? 0,
      dueSoonVnd: Number(b?.dueSoonVnd ?? 0),
      dueSoonCount: b?.dueSoonCount ?? 0,
      lateConditionsOurs: c?.ours ?? 0,
      lateConditionsTheirs: c?.theirs ?? 0,
      byMonth,
    }
  }

  /** Signing by month, oldest first, with the empty months present as zeros.
   *
   *  The months come out of `generate_series` and the contracts LEFT JOIN onto
   *  them, rather than being filled in afterwards: a month with no signature is
   *  a gap the sparkline has to draw, and a list built in Node would bucket by
   *  Node's clock while `date_trunc` buckets by the database session's. */
  private async trend(): Promise<ContractMonthPoint[]> {
    const back = sql.raw(String(TREND_MONTHS - 1))

    const r = (await this.db.execute(sql`
      SELECT to_char(m.at, 'YYYY-MM')                      AS month,
             count(${contract.code})::int                  AS signed_count,
             COALESCE(SUM(${CONTRACT_VND}), 0)::bigint     AS signed_amount_vnd
        FROM generate_series(date_trunc('month', now()) - ${back} * interval '1 month',
                             date_trunc('month', now()),
                             interval '1 month') AS m(at)
        LEFT JOIN ${contract} ON date_trunc('month', ${contract.signedAt}) = m.at
       GROUP BY m.at
       ORDER BY m.at
    `)) as { rows: { month: string; signed_count: number; signed_amount_vnd: number | string }[] }

    return r.rows.map((row) => ({
      month: row.month,
      signedCount: row.signed_count,
      signedAmountVnd: Number(row.signed_amount_vnd),
    }))
  }

  private async installmentsOf(codes: string[]): Promise<Map<string, ContractInstallmentRowDb[]>> {
    if (codes.length === 0) return new Map()

    const rows = await this.db
      .select()
      .from(contractInstallment)
      .where(inArray(contractInstallment.contractCode, codes))
      .orderBy(asc(contractInstallment.contractCode), asc(contractInstallment.no))

    const by = new Map<string, ContractInstallmentRowDb[]>()
    for (const r of rows) {
      const list = by.get(r.contractCode)
      if (list) list.push(r)
      else by.set(r.contractCode, [r])
    }
    return by
  }

  /** E2 axis 3 on this book: someone marked `ownOnly` sees only the contracts
   *  whose commission is theirs.
   *
   *  One column, no join table — a contract has exactly one owner, unlike an
   *  opportunity where Sale and BD both stand on the row. A contract with no
   *  owner at all matches nobody, which is the honest reading: an unassigned
   *  contract is not "everybody's". */
  private scopeOf(who: Actor, scoped: boolean): SQL | undefined {
    if (!scoped || !who.ownOnly) return undefined
    return eq(contract.ownerId, who.id)
  }

  /** Same predicate, SELECTed instead of filtered on — see `byCode`. The
   *  COALESCE is what turns the NULL of an unowned contract into `false`. */
  private inScopeValue(who: Actor): SQL<boolean> {
    const scope = this.scopeOf(who, true)
    return (scope ? sql`COALESCE(${scope}, false)` : sql`true`) as SQL<boolean>
  }

  private async count(where: SQL | undefined): Promise<number> {
    const [r] = await this.db.select({ n: count() }).from(contract).where(where)
    return r?.n ?? 0
  }
}

function groupByInstallment<T extends { installmentNo: number }>(rows: T[]): Map<number, T[]> {
  const by = new Map<number, T[]>()
  for (const r of rows) {
    const list = by.get(r.installmentNo)
    if (list) list.push(r)
    else by.set(r.installmentNo, [r])
  }
  return by
}
