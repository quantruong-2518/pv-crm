import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNull,
  notExists,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { Inject, Injectable } from '@nestjs/common'
import { DUE_NEAR_DAYS, type Actor } from '@pv/engines'
import {
  OWNER_NONE,
  type ContractBookQuery,
  type InstallmentDraft,
  type ContractParticipant,
  type ContractMonthPoint,
  type ContractSummary,
} from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { directProbe, fuzzyAny, fuzzyRank, readsUnderFloor } from '@api/platform/db/fuzzy'
import { actor } from '@api/platform/db/platform.schema'
import { notification } from '@api/platform/notification/notification.schema'
import { lead } from '../lead/lead.schema'
import { leadLive } from '../lead/lead-scope'
import { toVndSql } from '../money'
import { contractReadBy, contractTerminated } from '../open-deal'
import { fromDraft } from './contract.mapper'
import { opportunityOwner } from '../opportunity/opportunity.schema'
import { contractParticipant } from './contract-participant.schema'
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
import { seqCodes } from '../code-seq'
import {
  penaltySummary,
  terminationsOf,
  type TerminationRead,
} from './contract-termination.repository'

/** The payment PIC's name, joined beside the commission holder's. */
const collector = alias(actor, 'collector')

/** One contract row with the names of its commission owner and payment PIC. */
export type ContractRead = {
  row: ContractRowDb
  ownerName: string | null
  collectorName: string | null
  /** The deal's lanes frozen at signing (ADR 0086), SALE primary first. */
  participants: ContractParticipant[]
}

/** One book line: the row plus the LEAN schedule the table paints.
 *
 *  `customer` is not a column of the wire row — the book prints codes and
 *  money, not the account name. It is read anyway because the second E2 grid
 *  in the service needs an `ObjectRef` label, and a label that is the code
 *  again says nothing to whoever reads an audit line. */
export type ContractBookRead = ContractRead & {
  customer: string
  termination: TerminationRead | null
  installments: ContractInstallmentRowDb[]
}

/** One installment past due and unpaid, with one person to tell. */
export type OverdueInstallment = {
  contractCode: string
  no: number
  /** E4's occurrence, `<no>/<due day>`: spelled once, in the SQL that also reads it. */
  occurrence: string
  /** The recipient: the closer or the payment PIC, one row per person. */
  recipientId: string
  /** `<code> · <company>`: the bell copies a label at write time, never joins. */
  label: string
  due: Date
  amount: number
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
  /** NULL on an unpaid row and on one collected before the recorder was kept. */
  paidByName: string | null
  conditions: ContractConditionRowDb[]
  docs: ContractDocumentRowDb[]
  records: ContractRecordRowDb[]
  notes: ContractNoteRowDb[]
}

export type ContractDetailRead = ContractRead & {
  customer: string
  termination: TerminationRead | null
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
 *  người dùng — nhưng nó cũng chính là lý do `ContractCode` phải là một primitive
 *  riêng thay vì `ObjectCode`, và lý do đó đã ghi ở hợp đồng. */
const NEXT_CODE = seqCodes('HĐ-', 'sales.contract_code_seq')

/** The signed value of a contract in dong. Shared expression, one rate table —
 *  see `../money.ts`. */
const CONTRACT_VND = toVndSql(contract.amount, contract.currency)

/** How far back the trend strip reaches. Twelve points including the current
 *  month, which is what `ContractSummary.byMonth` promises. */
const TREND_MONTHS = 12

/** A contract reaches its lead directly: `lead_code` is NOT NULL and the pair
 *  FK `contract_opportunity_fk` keeps it equal to its deal's. Every read joins
 *  through here and cuts on `leadLive` — a contract is off when its lead is. */
const ON_LEAD = eq(lead.code, contract.leadCode)

/** `contractReadBy` over this file's joins: the lead joined is the run's lead. */
const CONTRACT_REACH = {
  ownerId: contract.ownerId,
  collectorId: contract.collectorId,
  leadOwnerId: lead.ownerId,
  opportunityCode: contract.opportunityCode,
}

/** A terminated contract's unpaid installments are owed by nobody (ADR 0107):
 *  every money, status and overdue read below stands on live contracts only. */
const LIVE = sql`NOT ${contractTerminated(contract.code)}`

/** `EXISTS` over one contract's installments, optionally narrowed. A contract
 *  stores no state, so every status and the next-installment sort read these. */
const installmentExists = (narrow?: SQL) =>
  sql`EXISTS (SELECT 1 FROM sales.contract_installment ci WHERE ci.contract_code = ${contract.code}${narrow ? sql` AND ${narrow}` : sql``})`
const UNPAID = sql`ci.paid_at IS NULL`

/** Date of the earliest unpaid installment; NULL once everything is collected,
 *  and NULL on a terminated contract (owed by nobody, `LIVE`) — so the sort and
 *  the due-day filter read one expression. */
const NEXT_DUE = sql`(CASE WHEN ${LIVE} THEN (SELECT min(ci.due) FROM sales.contract_installment ci WHERE ci.contract_code = ${contract.code} AND ci.paid_at IS NULL) END)`

/** Start of today on the Vietnam calendar. "Overdue" is a due before it — due
 *  today is not yet late, the rule KPI and the overdue-reason door count by — and
 *  comparing the raw column keeps `due` indexable. */
const VN_TODAY_START = sql`((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')`

const listOf = (csv: string) => csv.split(',').filter(Boolean)

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
   *  đang giữ một kết nối là một request chiếm hai kết nối. The E3 applier
   *  passes its `tx`: it is already inside the transaction settling the request. */
  async nextCode(handle: Db = this.db): Promise<string> {
    const r = (await handle.execute(NEXT_CODE)) as { rows: { code: string }[] }
    const code = r.rows[0]?.code
    if (!code) {
      throw new Error('sales.contract_code_seq trả về rỗng — migration đã chạy chưa?')
    }
    return code
  }

  /** The ONE insert into `sales.contract`, so the one place the deal's lanes
   *  are frozen onto the paper (ADR 0086): same statement order, same `tx`.
   *  Nothing writes `contract_participant` afterwards. */
  async insert(tx: Db, row: typeof contract.$inferInsert): Promise<ContractRowDb> {
    const [written] = await tx.insert(contract).values(row).returning()
    if (!written) throw new Error(`sales.contract: INSERT ${row.code} không trả về dòng nào`)
    await tx.execute(
      sql`INSERT INTO ${contractParticipant} ("contract_code", "actor_id", "role", "is_primary")
          SELECT ${written.code}, w."actor_id", w."role", w."is_primary"
            FROM ${opportunityOwner} w
           WHERE w."opportunity_code" = ${written.opportunityCode}`,
    )
    return written
  }

  /** Participants of a batch of contracts, one query for the page: lane, then
   *  the primary, then name — the order `ownersOf` prints a deal's lanes in. */
  private async participantsOf(
    codes: readonly string[],
  ): Promise<Map<string, ContractParticipant[]>> {
    const byCode = new Map<string, ContractParticipant[]>()
    if (codes.length === 0) return byCode
    const rows = await this.db
      .select({
        code: contractParticipant.contractCode,
        id: contractParticipant.actorId,
        name: actor.name,
        role: contractParticipant.role,
        primary: contractParticipant.isPrimary,
      })
      .from(contractParticipant)
      .innerJoin(actor, eq(actor.id, contractParticipant.actorId))
      .where(inArray(contractParticipant.contractCode, [...codes]))
      .orderBy(contractParticipant.role, desc(contractParticipant.isPrimary), actor.name, actor.id)
    for (const { code, ...who } of rows) byCode.set(code, [...(byCode.get(code) ?? []), who])
    return byCode
  }

  /** Carry a signed deal's edited money or commission holder onto its contract
   *  (ADR 0057 §1). Returns the row as stored. */
  async updateTerms(
    tx: Db,
    code: string,
    patch: Partial<Pick<ContractRowDb, 'amount' | 'currency' | 'ownerId'>>,
  ): Promise<ContractRowDb> {
    const [written] = await tx
      .update(contract)
      .set(patch)
      .where(eq(contract.code, code))
      .returning()
    if (!written) throw new Error(`sales.contract: UPDATE ${code} không trả về dòng nào`)
    return written
  }

  /** Instalments 1..n for a contract that has none — the sign transaction's
   *  call. Replacing a live schedule goes through `ContractScheduleRepository`,
   *  which updates in place. */
  async insertInstallments(
    tx: Db,
    contractCode: string,
    drafts: InstallmentDraft[],
  ): Promise<void> {
    if (drafts.length === 0) return
    await tx
      .insert(contractInstallment)
      .values(drafts.map((draft, i) => fromDraft(contractCode, draft, i + 1)))
  }

  /** The scope axis' verdict on one contract, without loading it: `null` = no
   *  such contract (or its lead is off), `false` = not this reader's. */
  async inScope(who: Actor, code: string): Promise<boolean | null> {
    const [found] = await this.db
      .select({ inScope: this.inScopeValue(who) })
      .from(contract)
      .innerJoin(lead, ON_LEAD)
      .where(and(eq(contract.code, code), leadLive))
      .limit(1)
    return found ? found.inScope : null
  }

  /** `inScope` for many contracts in ONE read: the codes among `codes` that the
   *  contract door would open for this reader. */
  async inScopeAmong(who: Actor, codes: readonly string[]): Promise<Set<string>> {
    if (codes.length === 0) return new Set()
    const rows = await this.db
      .select({ code: contract.code, inScope: this.inScopeValue(who) })
      .from(contract)
      .innerJoin(lead, ON_LEAD)
      .where(and(inArray(contract.code, [...codes]), leadLive))
    return new Set(rows.filter((r) => r.inScope).map((r) => r.code))
  }

  /** Mọi hợp đồng của một cơ hội, cũ nhất trước — đơn thắng ký thêm được
   *  (ADR 0069 §5).
   *
   *  Khớp CẢ HAI cột chứ không riêng mã đơn — cùng cặp mà `contract_opportunity_fk`
   *  neo, và đọc bằng cả cặp là cách câu truy vấn nói lại đúng bất biến bảng
   *  đang giữ (cùng lý lẽ với `OpportunityRepository.signed`). */
  async byOpportunity(opportunityCode: string, leadCode: string): Promise<ContractRead[]> {
    const rows = await this.db
      .select({ row: contract, ownerName: actor.name, collectorName: collector.name })
      .from(contract)
      .leftJoin(actor, eq(actor.id, contract.ownerId))
      .leftJoin(collector, eq(collector.id, contract.collectorId))
      .where(and(eq(contract.opportunityCode, opportunityCode), eq(contract.leadCode, leadCode)))
      .orderBy(asc(contract.signedAt), asc(contract.code))
    const people = await this.participantsOf(rows.map((r) => r.row.code))
    return rows.map((r) => ({ ...r, participants: people.get(r.row.code) ?? [] }))
  }

  // -- read ------------------------------------------------------------------

  /** The book. Lean installments only, and one extra query for all of them.
   *
   *  A page of 50 contracts pulling its schedule row by row is 50 round trips
   *  to Neon, which bills for time awake; one `IN` over the page rides the
   *  installment primary key. The four child tables are NOT touched here —
   *  that is the whole difference between this door and the profile. */
  async book(who: Actor, q: ContractBookQuery, scoped: boolean): Promise<ContractBookPage> {
    const scope = this.scopeOf(who, scoped)
    const filters = and(...this.filtersOf(q))

    /* Count a second time only when the scope axis is actually cutting: for
       someone who sees the whole book `hidden` is always 0, and a full COUNT
       to print a zero is paying for a question nobody asked. Same trade the
       other two books took. */
    const total = (db: Db) => this.count(and(scope, filters), db)
    /* A value bound skips it too: `hidden` under one would let an ownOnly
       reader binary-search a colleague's amount or due day. */
    const valued = [q.amountMin, q.amountMax, q.dueFrom, q.dueTo].some((v) => v !== undefined)
    const wide = (db: Db) => (scope && !valued ? this.count(filters, db) : Promise.resolve(null))
    const page = (db: Db) =>
      db
        .select({
          row: contract,
          ownerName: actor.name,
          collectorName: collector.name,
          customer: lead.company,
        })
        .from(contract)
        .innerJoin(lead, ON_LEAD)
        .leftJoin(actor, eq(actor.id, contract.ownerId))
        .leftJoin(collector, eq(collector.id, contract.collectorId))
        .where(and(scope, filters, leadLive))
        .orderBy(...this.orderBy(q))
        .limit(q.size)
        .offset((q.page - 1) * q.size)
    const probe = probeOf(and(leadLive, scope))
    const [scopedTotal, all, rows] = await readsUnderFloor(this.db, q.q, probe, [
      total,
      wide,
      page,
    ] as const)

    const codes = rows.map((r) => r.row.code)
    const [schedule, people, ended] = await Promise.all([
      this.installmentsOf(codes),
      this.participantsOf(codes),
      terminationsOf(this.db, codes),
    ])

    return {
      rows: rows.map((r) => ({
        ...r,
        participants: people.get(r.row.code) ?? [],
        termination: ended.get(r.row.code) ?? null,
        installments: schedule.get(r.row.code) ?? [],
      })),
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
        collectorName: collector.name,
        customer: lead.company,
        contact: lead.contactName,
        contactRole: lead.contactTitle,
        inScope: this.inScopeValue(who),
      })
      .from(contract)
      .innerJoin(lead, ON_LEAD)
      .leftJoin(actor, eq(actor.id, contract.ownerId))
      .leftJoin(collector, eq(collector.id, contract.collectorId))
      .where(and(eq(contract.code, code), leadLive))
      .limit(1)

    if (!found) return null

    /* One query per child table for the WHOLE contract, then grouped in
       memory. Six installments times four tables is 24 round trips the other
       way, and every one of them rides the same index this one does. */
    const [schedule, people, ended, conditions, docs, records, notes] = await Promise.all([
      this.installmentsOf([code]),
      this.participantsOf([code]),
      terminationsOf(this.db, [code]),
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

    const rows = schedule.get(code) ?? []
    const payers = new Set(rows.flatMap((r) => (r.paidById ? [r.paidById] : [])))
    const payerNames = new Map<string, string>()
    if (payers.size > 0) {
      const named = await this.db
        .select({ id: actor.id, name: actor.name })
        .from(actor)
        .where(inArray(actor.id, [...payers]))
      for (const p of named) payerNames.set(p.id, p.name)
    }

    const byNo = {
      conditions: groupByInstallment(conditions),
      docs: groupByInstallment(docs),
      records: groupByInstallment(records),
      notes: groupByInstallment(notes),
    }

    return {
      ...found,
      participants: people.get(code) ?? [],
      termination: ended.get(code) ?? null,
      installments: rows.map((row) => ({
        row,
        paidByName: (row.paidById && payerNames.get(row.paidById)) || null,
        conditions: byNo.conditions.get(row.no) ?? [],
        docs: byNo.docs.get(row.no) ?? [],
        records: byNo.records.get(row.no) ?? [],
        notes: byNo.notes.get(row.no) ?? [],
      })),
    }
  }

  /** The whole book folded to one row — `GET /sales/contracts/summary`.
   *
   *  Five queries rather than one welded statement: they scan four different
   *  tables and one groups a series, so joining them would only push the
   *  same scans into the planner behind a shape nobody can read.
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
    const overdue = sql`${unpaid} AND ${due} < ${VN_TODAY_START}`
    /* Bounded on BOTH sides so an installment already late is counted as late
       and not a second time as near. `DUE_NEAR_DAYS` comes from the same
       `@pv/engines` ladder (left 0 is 'due', 1..14 'due-soon'). */
    const dueSoon = sql`${unpaid} AND ${due} >= ${VN_TODAY_START}
      AND ${due} < ${VN_TODAY_START} + ${sql.raw(String(DUE_NEAR_DAYS + 1))} * interval '1 day'`

    const [signed, schedule, late, byMonth, penalties] = await Promise.all([
      this.db
        .select({
          signedCount: count(),
          signedAmountVnd: sql<number | string>`COALESCE(SUM(${CONTRACT_VND}), 0)::bigint`,
          blankAmount: sql<number>`count(*) FILTER (WHERE ${contract.amount} IS NULL)::int`,
        })
        .from(contract)
        .innerJoin(lead, ON_LEAD)
        .where(and(leadLive, LIVE)),
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
        .from(contractInstallment)
        .innerJoin(contract, eq(contract.code, contractInstallment.contractCode))
        .innerJoin(lead, ON_LEAD)
        .where(and(leadLive, LIVE)),
      /* Late PAPERWORK, counted per CONDITION and not per contract: two unmet
         lines on one contract are two things to chase, which is what the tile
         has always printed. A separate question from `overdueCount` above —
         that one is money that did not land. */
      this.db
        .select({
          ours: sql<number>`count(*) FILTER (WHERE ${contractCondition.side} = 'ours')::int`,
          theirs: sql<number>`count(*) FILTER (WHERE ${contractCondition.side} = 'customer')::int`,
        })
        .from(contractCondition)
        .innerJoin(contract, eq(contract.code, contractCondition.contractCode))
        .innerJoin(lead, ON_LEAD)
        .where(
          and(
            isNull(contractCondition.doneAt),
            sql`${contractCondition.due} < ${VN_TODAY_START}`,
            leadLive,
            LIVE,
          ),
        ),
      this.trend(),
      penaltySummary(this.db),
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
      ...penalties,
      byMonth,
    }
  }

  /** Signing by month, oldest first, with the empty months present as zeros.
   *
   *  The months come out of `generate_series` and the contracts LEFT JOIN onto
   *  them, rather than being filled in afterwards: a month with no signature is
   *  a gap the sparkline has to draw. Both sides are cut on Vietnam time, the
   *  zone the book's date filters use, not on the session's (UTC). */
  private async trend(): Promise<ContractMonthPoint[]> {
    const back = sql.raw(String(TREND_MONTHS - 1))

    const r = (await this.db.execute(sql`
      SELECT to_char(m.at, 'YYYY-MM')                      AS month,
             count(${contract.code})::int                  AS signed_count,
             COALESCE(SUM(${CONTRACT_VND}), 0)::bigint     AS signed_amount_vnd
        FROM generate_series(
               date_trunc('month', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') - ${back} * interval '1 month',
               date_trunc('month', now() AT TIME ZONE 'Asia/Ho_Chi_Minh'),
               interval '1 month') AS m(at)
        LEFT JOIN (${contract} JOIN ${lead} ON ${ON_LEAD} AND ${leadLive} AND ${LIVE})
               ON date_trunc('month', ${contract.signedAt} AT TIME ZONE 'Asia/Ho_Chi_Minh') = m.at
       GROUP BY m.at
       ORDER BY m.at
    `)) as { rows: { month: string; signed_count: number; signed_amount_vnd: number | string }[] }

    return r.rows.map((row) => ({
      month: row.month,
      signedCount: row.signed_count,
      signedAmountVnd: Number(row.signed_amount_vnd),
    }))
  }

  async installmentsOf(codes: string[]): Promise<Map<string, ContractInstallmentRowDb[]>> {
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

  /** Overdue installments — `summary()`'s predicate, unpaid and due before
   *  `VN_TODAY_START` — whose contract owner or payment PIC holds no bell line
   *  for them yet (one row per person, one when they are the same), on live
   *  leads, live contracts and unlocked actors only. The anti-join is a saving; the ledger's UNIQUE
   *  (recipient, event key) is what refuses a duplicate. The key is spelled
   *  as E4's `plan` builds it (`<kind>/<code>/<occurrence>`): move both together.
   *  The occurrence carries the due day (ADR 0093 §5's anchor date), so a due
   *  date moved by a schedule edit rings again once the new day passes. */
  overdueUntold(tx: Db): Promise<OverdueInstallment[]> {
    const ci = contractInstallment
    const occurrence = sql<string>`${ci.no} || '/' || to_char(${ci.due} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`
    const eventKey = sql`'contract-installment-overdue/' || ${ci.contractCode} || '/' || ${occurrence}`
    return tx
      .select({
        contractCode: ci.contractCode,
        no: ci.no,
        occurrence,
        recipientId: actor.id,
        label: sql<string>`${contract.code} || ' · ' || ${lead.company}`,
        due: ci.due,
        amount: ci.amount,
      })
      .from(ci)
      .innerJoin(contract, eq(contract.code, ci.contractCode))
      .innerJoin(lead, ON_LEAD)
      .innerJoin(
        actor,
        and(
          or(eq(actor.id, contract.ownerId), eq(actor.id, contract.collectorId)),
          isNull(actor.disabledAt),
        ),
      )
      .where(
        and(
          isNull(ci.paidAt),
          sql`${ci.due} < ${VN_TODAY_START}`,
          leadLive,
          LIVE,
          notExists(
            tx
              .select({ one: sql`1` })
              .from(notification)
              .where(
                and(eq(notification.recipientId, actor.id), eq(notification.eventKey, eventKey)),
              ),
          ),
        ),
      )
      .orderBy(asc(ci.due), asc(ci.contractCode), asc(ci.no))
  }

  /** The chosen column first, then newest signature and the code — a book with
   *  no tie-break lets Postgres return one row on both page 1 and page 2, or on
   *  neither. `NULLS LAST` both ways: a blank is not the smallest value. */
  private orderBy(q: ContractBookQuery): SQL[] {
    const primary = {
      amount: CONTRACT_VND,
      nextDue: NEXT_DUE,
      signedAt: contract.signedAt,
      code: contract.code,
    }[q.sort]
    const dir = q.dir === 'asc' ? sql`ASC` : sql`DESC`
    const best = q.q ? [sql`${fuzzyRank(SEARCHED, q.q)} DESC`] : []
    return [...best, sql`${primary} ${dir} NULLS LAST`, desc(contract.signedAt), asc(contract.code)]
  }

  /** Every book filter, ANDed. Independent of the scope axis. */
  private filtersOf(q: ContractBookQuery): (SQL | undefined)[] {
    const live = (status: SQL) => and(LIVE, status)
    return [
      q.status === 'overdue'
        ? live(installmentExists(sql`${UNPAID} AND ci.due < ${VN_TODAY_START}`))
        : undefined,
      q.status === 'collected'
        ? live(sql`${installmentExists()} AND NOT ${installmentExists(UNPAID)}`)
        : undefined,
      q.status === 'open'
        ? live(sql`NOT (${installmentExists()} AND NOT ${installmentExists(UNPAID)})`)
        : undefined,
      q.status === 'terminated' ? contractTerminated(contract.code) : undefined,
      q.owner ? this.byOwner(q.owner) : undefined,
      q.signedFrom
        ? sql`${contract.signedAt} >= (${q.signedFrom}::date)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'`
        : undefined,
      q.signedTo
        ? sql`${contract.signedAt} < ((${q.signedTo}::date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')`
        : undefined,
      q.kind ? inArray(contract.kind, listOf(q.kind)) : undefined,
      /* The Vietnam day the book prints for `nextDue`; NULL (terminated, collected) drops out. */
      q.dueFrom
        ? sql`(${NEXT_DUE} AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= ${q.dueFrom}::date`
        : undefined,
      q.dueTo
        ? sql`(${NEXT_DUE} AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= ${q.dueTo}::date`
        : undefined,
      /* `!== undefined`: 0 is a real bound. NULL never compares, so a blank amount drops out. */
      q.amountMin !== undefined ? sql`${CONTRACT_VND} >= ${q.amountMin}` : undefined,
      q.amountMax !== undefined ? sql`${CONTRACT_VND} <= ${q.amountMax}` : undefined,
      q.q ? fuzzyAny(SEARCHED, q.q) : undefined,
    ]
  }

  /** `OWNER_NONE` among the ids also matches contracts nobody holds. */
  private byOwner(csv: string): SQL | undefined {
    const ids = listOf(csv)
    const named = ids.filter((id) => id !== OWNER_NONE)
    return ids.includes(OWNER_NONE)
      ? or(isNull(contract.ownerId), named.length ? inArray(contract.ownerId, named) : undefined)
      : inArray(contract.ownerId, named)
  }

  /** E2 axis 3 on this book: someone marked `ownOnly` sees only the contracts
   *  whose commission is theirs, or whose money they collect. One contract
   *  opens wider, see `inScopeValue`.
   *
   *  Two columns, no join table — a contract has one owner and one collector,
   *  unlike an opportunity where Sale and BD both stand on the row. A contract
   *  with neither matches nobody: an unassigned contract is not "everybody's". */
  private scopeOf(who: Actor, scoped: boolean): SQL | undefined {
    if (!scoped || !who.ownOnly) return undefined
    return or(eq(contract.ownerId, who.id), eq(contract.collectorId, who.id))
  }

  /** One contract's verdict, SELECTed instead of filtered on — see `byCode`.
   *  Wider than the book's `scopeOf` (ADR 0110 §2): a co-seller opens the
   *  paper read-only. COALESCE turns an unowned contract's NULL into `false`. */
  private inScopeValue(who: Actor): SQL<boolean> {
    if (!who.ownOnly) return sql<boolean>`true`
    const reach = contractReadBy(CONTRACT_REACH, who.id)
    return sql<boolean>`COALESCE(${reach}, false)`
  }

  private async count(where: SQL | undefined, db: Db = this.db): Promise<number> {
    const [r] = await db
      .select({ n: count() })
      .from(contract)
      .innerJoin(lead, ON_LEAD)
      .where(and(where, leadLive))
    return r?.n ?? 0
  }
}

/** The two columns the book's search box reads, probed inside the book's fence. */
const SEARCHED = [lead.company, contract.code]
const probeOf = (fence: SQL | undefined) => (q: string) =>
  directProbe(sql`${contract} JOIN ${lead} ON ${ON_LEAD}`, fence, SEARCHED, q)

function groupByInstallment<T extends { installmentNo: number }>(rows: T[]): Map<number, T[]> {
  const by = new Map<number, T[]>()
  for (const r of rows) {
    const list = by.get(r.installmentNo)
    if (list) list.push(r)
    else by.set(r.installmentNo, [r])
  }
  return by
}
