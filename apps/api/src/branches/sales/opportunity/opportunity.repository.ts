import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  inArray,
  isNotNull,
  ne,
  not,
  sql,
  type SQL,
} from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  StageKey,
  type OpportunityBookQuery,
  type OpportunityFacetsQuery,
  type OpportunityOwner,
  type OpportunityProduct,
  type OpportunityStageBucket,
  type OpportunityStatus,
} from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { csvOf } from '@api/platform/db/book-filter'
import { directProbe, fuzzyAny, fuzzyRank, readsUnderFloor } from '@api/platform/db/fuzzy'
import { actor } from '@api/platform/db/platform.schema'
import { pinnedBy } from '@api/platform/pin/pinned'
import { configEntry } from '../config/config.schema'
import { contract } from '../contract/contract.schema'
import { lead } from '../lead/lead.schema'
import { leadLive } from '../lead/lead-scope'
import { LEAD_GONE_STATES } from '../lead/lead-state'
import { toVndSql } from '../money'
import { dealOpen, dealSignWaiting, leadDealsAllLost } from '../open-deal'
import { dealHeld, openHoldsOf, type HoldRead } from '../hold/hold.sql'
import {
  opportunity,
  opportunityOwner,
  opportunityProduct,
  opportunityStageEvent,
  type OpportunityRowDb,
  type OpportunityStageEventRowDb,
} from './opportunity.schema'
import { stageConfigOf } from '../ladder'
import { DAYS_IN_STAGE, dealScope, overdueIn } from './opportunity-book.sql'
import { ownerFilter, stagesOf } from './opportunity-filter.sql'
import {
  peopleOf,
  type OpportunityValues,
  type OwnerRow,
  type RefOwner,
} from './opportunity.mapper'
import { seqCodes } from '../code-seq'

/** Name, deal code or company: whichever the user pasted, for filter and rank. */
const SEARCHED = [opportunity.name, opportunity.code, lead.company]

/** Shared with the facets repository: one answer per book, over the deals the
 *  reader's book can ever show — live lead, deal scope. `onBoard` is a view. */
export const opportunityProbe = (who: Actor, scoped: boolean) => (q: string) =>
  directProbe(
    sql`${opportunity} JOIN ${lead} ON ${lead.code} = ${opportunity.leadCode}`,
    and(leadLive, dealScope(who, scoped)),
    SEARCHED,
    q,
  )

const GONE: ReadonlySet<string> = new Set(LEAD_GONE_STATES)

/** The acceptor's name, beside `accepted_by_id` (ADR 0071). A scalar subquery
 *  rather than a join so it rides a `FOR UPDATE` read too (the hand-over's). */
export const ACCEPTOR_NAME = sql<
  string | null
>`(SELECT acc.name FROM platform.actor acc WHERE acc.id = ${opportunity.acceptedById})`

/** Một dòng sổ đã nạp đủ thứ nó cần để ra mặt. */
export type OpportunityRead = {
  row: OpportunityRowDb
  account: string
  owners: OpportunityOwner[]
  /** The deal's holder (`holderOf`, ADR 0071 §5), read with the owners. */
  holder: RefOwner | null
  /** Who accepted the deal (ADR 0071 §3); `null` while it waits at `new`. */
  acceptedBy: RefOwner | null
  /** A seller stands on the SALE lane (`hasSellerOf`), read with the owners. */
  hasSeller: boolean
  /** Mọi hợp đồng đã ký của đơn, cũ nhất trước — một đơn thắng ký thêm được
   *  (ADR 0069 §5). `signed` là "danh sách không rỗng": hai trường, MỘT nguồn. */
  contractCodes: string[]
  signed: boolean
  /** An open hold lies on the deal (ADR 0097 §3): its moves are refused. */
  held: boolean
  /** Số ngày đơn đã đứng trong cột hiện tại. `null` = đơn đã ra khỏi bảng. */
  daysInStage: number | null
  /** What the deal is asking about, with labels already resolved from
   *  `config_entry`. */
  products: OpportunityProduct[]
}

/** One row about to be written to the column-history table.
 *
 *  `id` is absent because the table mints it. `at` is NOT absent even though
 *  the table also defaults it: writing the deal row and the history row has to
 *  carry exactly ONE instant, and letting `defaultNow()` run a second time
 *  gives two instants a few milliseconds apart — enough for the next row's
 *  `days_in_from` to be off by a day when the write lands on midnight. */
export type OpportunityStageEventInsert = Omit<typeof opportunityStageEvent.$inferInsert, 'id'>

/** Every contract of the deal, oldest first — a won deal may sign again (ADR
 *  0069 §5). A subquery, not a join: a join would print the deal once per paper
 *  while `total` counts it once. `ARRAY(…)` is `{}` when nothing is signed. */
/** Selected beside the row so every read — the lock re-read included — knows. */
const HELD = sql<boolean>`${dealHeld(opportunity.code)}`

const CONTRACT_CODES = sql<string[]>`ARRAY(
  SELECT k.code FROM ${contract} k
   WHERE k.opportunity_code = ${opportunity.code} AND k.lead_code = ${opportunity.leadCode}
   ORDER BY k.signed_at, k.code)`

/** The deal's value in dong, converted in SQL: ordering by money and the scorecard
 *  sums both sit under `LIMIT`, so converting in Node would sort raw amounts (5,000
 *  USD under 10,000,000 VND). An unknown currency or a blank amount is NULL, not 0;
 *  `opportunity_money_pair` keeps the two columns together, and the scorecard
 *  counts NULL apart as `openBlank`. */
const AMOUNT_VND = toVndSql(opportunity.amount, opportunity.currency)

/** The book's filters without paging — what the book and its facets share. */
export type BookFilters = OpportunityFacetsQuery & Pick<OpportunityBookQuery, 'state' | 'pinned'>

export type OpportunityBookPage = {
  rows: OpportunityRead[]
  total: number
  /** Số dòng trục phạm vi cắt đi — luật 7, và máy chủ phải đếm vì màn không
   *  đếm được thứ nó không nhận. */
  hidden: number
}

/** Sáu con số của thẻ điểm, đúng như `OpportunityScorecard` của hợp đồng gọi
 *  tên chúng. Repository trả số thô; service mới là chỗ dán hợp đồng lên. */
export type OpportunityScorecardRow = {
  total: number
  open: number
  openAmountVnd: number
  openBlank: number
  won: number
  lost: number
}

/** Một số từ `sales.opportunity_code_seq`, in ra dạng `OP-%04d`.
 *
 *  Dãy khai ở `opportunity.schema.ts` để `drizzle-kit` sở hữu nó; Drizzle không
 *  có node biểu thức cho `nextval` nên tên phải viết lại đúng một lần ở đây —
 *  cùng đánh đổi mà `lead.repository.ts` đã ghi. */
const NEXT_CODE = seqCodes('OP-', 'sales.opportunity_code_seq')

/** Chỗ DUY NHẤT của module cơ hội có SQL. Không quyết định gì về quyền — nó chỉ
 *  THI HÀNH trục phạm vi mà endpoint đã khai bằng `@Need({ scoped: true })`. */
@Injectable()
export class OpportunityRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  get readonlyHandle(): Db {
    return this.db
  }

  run<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(tx))
  }

  /** Giữ trước mã kế tiếp. Gọi TRƯỚC khi mở transaction.
   *
   *  Ngoài transaction vì `nextCode` chạy trên pool: hỏi nó trong lúc
   *  transaction của mình đang giữ một kết nối là một request chiếm hai kết
   *  nối, và với pool mười thì mười phiếu đồng thời chờ nhau một kết nối thứ
   *  mười một không bao giờ tới. `nextval` cố tình không nghe transaction —
   *  phiếu bị rollback đốt số của nó, phiếu sau lấy số kế tiếp. Thủng dãy mã là
   *  bình thường; hai đơn trùng mã thì không. */
  async nextCode(): Promise<string> {
    const r = (await this.db.execute(NEXT_CODE)) as { rows: { code: string }[] }
    const code = r.rows[0]?.code
    if (!code) {
      throw new Error('sales.opportunity_code_seq trả về rỗng — migration đã chạy chưa?')
    }
    return code
  }

  // ── đọc ──────────────────────────────────────────────────────────────────

  async book(who: Actor, q: OpportunityBookQuery, scoped: boolean): Promise<OpportunityBookPage> {
    const scope = this.scopeOf(who, scoped)

    /* Bộ lọc của người dùng và trục phạm vi ĐI RIÊNG, và phải đi riêng: `total`
       đếm theo cả hai, còn `hidden` là hiệu của hai phép đếm CÙNG bộ lọc, khác
       nhau đúng ở trục phạm vi. Gộp chúng làm một thì `hidden` của một lượt lọc
       theo lead sẽ đọc ra "số đơn cả sổ bạn không thấy", tức một con số đúng
       cho câu không ai hỏi. Tính chất đó không đổi khi bộ lọc mọc từ một ô lên
       sáu — `filtersOf` trả về một MẢNG, và trục phạm vi vẫn đứng ngoài nó. */
    const filters = [...(await this.filtersOf(q, who.id)), this.onBoard(q)]
    const where = and(...filters, scope)

    /* Chỉ đếm LẦN HAI khi trục phạm vi thật sự đang cắt — với người nhìn được
       cả sổ thì `hidden` luôn bằng 0, và một COUNT toàn bảng để in ra số 0 là
       trả phí cho câu không ai hỏi. Cùng phép mà sổ lead đang dùng. */
    const rowsOf = (db: Db) =>
      db
        .select({
          row: opportunity,
          account: lead.company,
          contractCodes: CONTRACT_CODES,
          held: HELD,
          daysInStage: DAYS_IN_STAGE,
          acceptorName: ACCEPTOR_NAME,
        })
        .from(opportunity)
        .innerJoin(lead, eq(lead.code, opportunity.leadCode))
        .where(where)
        .orderBy(...this.orderBy(q))
        .limit(q.size)
        .offset((q.page - 1) * q.size)

    const probe = opportunityProbe(who, scoped)
    const [scopedTotal, all, rows] = await readsUnderFloor(this.db, q.q, probe, [
      (db: Db) => this.count(where, db),
      (db: Db) => (scope ? this.count(and(...filters), db) : Promise.resolve(null)),
      rowsOf,
    ] as const)

    /* Two follow-up reads, in PARALLEL: they read two different join tables
       with the same list of codes, and neither needs the other's result.
       Queueing them adds a network round trip to every page turn. */
    const codes = rows.map((r) => r.row.code)
    const [owners, products] = await Promise.all([
      this.ownersOf(this.db, codes),
      this.productsOf(this.db, codes),
    ])

    return {
      rows: rows.map(({ acceptorName, ...r }) => ({
        ...r,
        signed: r.contractCodes.length > 0,
        ...peopleOf(r.row, acceptorName, owners.get(r.row.code)),
        products: products.get(r.row.code) ?? [],
      })),
      total: scopedTotal,
      hidden: all === null ? 0 : all - scopedTotal,
    }
  }

  /** Một đơn theo mã, kèm phán quyết của trục phạm vi trên chính nó.
   *
   *  `inScope` đi KÈM dữ liệu chứ không quyết định dữ liệu có về hay không —
   *  cùng hình với `LeadRepository.byCode`, và vì cùng lý do: 404 "không có đơn
   *  này" và 403 "đơn không phải của bạn" là hai câu khác nhau, mà một truy vấn
   *  đã lọc theo phạm vi thì chỉ trả lời được câu thứ nhất.
   *
   *  `who` null is the E3 applier: an approved request has no reader to scope,
   *  and it reads through the settling transaction's `handle`.
   *
   *  `leadLive` is FILTERED, unlike scope: a deal on a switched-off lead is not
   *  there for anyone, and every write door loads through here. */
  async byCode(
    who: Actor | null,
    code: string,
    handle: Db = this.db,
  ): Promise<(OpportunityRead & { inScope: boolean; pendingSign: boolean }) | null> {
    const [found] = await handle
      .select({
        row: opportunity,
        account: lead.company,
        contractCodes: CONTRACT_CODES,
        held: HELD,
        daysInStage: DAYS_IN_STAGE,
        acceptorName: ACCEPTOR_NAME,
        inScope: who ? this.inScopeValue(who) : sql<boolean>`true`,
        pendingSign: sql<boolean>`${dealSignWaiting(opportunity.code)}`,
      })
      .from(opportunity)
      .innerJoin(lead, eq(lead.code, opportunity.leadCode))
      .where(and(eq(opportunity.code, code), leadLive))
      .limit(1)

    if (!found) return null

    const [owners, products] = await Promise.all([
      this.ownersOf(handle, [code]),
      this.productsOf(handle, [code]),
    ])
    const { acceptorName, ...rest } = found
    return {
      ...rest,
      signed: found.contractCodes.length > 0,
      ...peopleOf(found.row, acceptorName, owners.get(code)),
      products: products.get(code) ?? [],
    }
  }

  /** The deal's lead code when the deal is on a live lead AND in `who`'s scope —
   *  the stop door needs it to lock the lead before the deal. */
  async scopedLeadCode(who: Actor, code: string): Promise<string | null> {
    const [found] = await this.db
      .select({ leadCode: opportunity.leadCode, inScope: this.inScopeValue(who) })
      .from(opportunity)
      .innerJoin(lead, eq(lead.code, opportunity.leadCode))
      .where(and(eq(opportunity.code, code), leadLive))
      .limit(1)
    return found?.inScope ? found.leadCode : null
  }

  /** Lock the deal `FOR UPDATE`, then read it back on the same handle. The read is
   *  a LATER statement, so under READ COMMITTED it sees whatever committed while
   *  the lock was awaited — `signed`, `pendingSign` and `inScope` included.
   *  Scope and `leadLive` sit in the locking WHERE so a caller who cannot see the
   *  deal never holds its lock; that and "no deal" are both `null`. */
  async lockedByCode(who: Actor | null, code: string, tx: Db) {
    /* `EXISTS`, not a join: a joined lead would be locked too (and `OF` is
       rendered schema-qualified, which Postgres refuses). Only the deal is locked. */
    const liveLead = tx
      .select({ one: sql`1` })
      .from(lead)
      .where(and(eq(lead.code, opportunity.leadCode), leadLive))
    const [locked] = await tx
      .select({ code: opportunity.code })
      .from(opportunity)
      .where(
        and(
          eq(opportunity.code, code),
          exists(liveLead),
          who ? this.scopeOf(who, true) : undefined,
        ),
      )
      .for('update')
    return locked ? this.byCode(who, code, tx) : null
  }

  /** The deal's open hold, for the profile. */
  async openHold(code: string): Promise<HoldRead | null> {
    return (await openHoldsOf(this.db, 'opportunity', [code])).get(code) ?? null
  }

  /** Người đứng đơn của một loạt đơn, đọc MỘT lần cho cả trang.
   *
   *  Một truy vấn cho cả trang chứ không một truy vấn mỗi dòng: 50 dòng là 50
   *  vòng tới Neon, và Neon tính tiền theo thời gian thức. `IN` với 50 mã thì
   *  đi đúng `opportunity_owner_pk`.
   *
   *  Thứ tự trong mỗi đơn là thứ tự cố định (`role` rồi `name`) vì màn in ra
   *  một hàng avatar — hai lần mở cùng một đơn mà hàng đó đảo chỗ thì đọc như
   *  dữ liệu vừa đổi. */
  async ownersOf(tx: Db, codes: string[]): Promise<Map<string, OwnerRow[]>> {
    if (codes.length === 0) return new Map()

    const rows = await tx
      .select({
        code: opportunityOwner.opportunityCode,
        id: opportunityOwner.actorId,
        name: actor.name,
        role: opportunityOwner.role,
        primary: opportunityOwner.isPrimary,
        roleIds: actor.roleIds,
      })
      .from(opportunityOwner)
      .innerJoin(actor, eq(actor.id, opportunityOwner.actorId))
      .where(inArray(opportunityOwner.opportunityCode, codes))
      .orderBy(opportunityOwner.role, desc(opportunityOwner.isPrimary), actor.name, actor.id)

    const byCode = new Map<string, OwnerRow[]>()
    for (const r of rows) byCode.set(r.code, [...(byCode.get(r.code) ?? []), r])
    return byCode
  }

  /** Tên khách của một lead. Sổ in tên chứ không in mã.
   *
   *  Null = không có lead đó, và cửa ghi biến null thành 404 — khoá ngoại
   *  `opportunity_lead_code_lead_code_fk` cũng chặn, nhưng nó ném ra một 500
   *  không gọi tên ô nào. */
  async leadCompany(
    tx: Db,
    code: string,
  ): Promise<{
    company: string
    workstreamCode: string | null
    exited: boolean
    ownerId: string | null
  } | null> {
    const [row] = await tx
      .select({
        company: lead.company,
        workstreamCode: lead.workstreamCode,
        ownerId: lead.ownerId,
        exited: sql<boolean>`${inArray(lead.state, [...LEAD_GONE_STATES])}`,
      })
      .from(lead)
      .where(and(eq(lead.code, code), leadLive))
      .limit(1)
    return row ?? null
  }

  /** Một đơn, đọc cho BỘ DỰNG THÂN MAIL. Không có trục phạm vi.
   *
   *  Không nhận `Actor`, và đó là chủ ý chứ không phải thiếu sót: người gọi là
   *  worker, và worker không hành động thay ai cả — nó thực hiện một lời hứa
   *  mà nhánh đã ghi vào sổ gửi lúc còn biết người bấm là ai. Nhét một actor
   *  giả vào đây để "cho có kiểm" là dựng một hàng rào không chặn gì mà đọc
   *  như có chặn.
   *
   *  Hàng rào thật nằm ở chỗ khác và đã đứng rồi: dòng sổ gửi chỉ tồn tại nếu
   *  `POST /sales/opportunities` đi qua `@Need({ permission: 'opportunity.create' })`,
   *  và địa chỉ nhận là hộp thư của chính công ty, khai trong env — không phải
   *  thứ ai gọi được cũng đặt được. */
  async forMail(code: string): Promise<(OpportunityRead & { daysOpen: number }) | null> {
    const [found] = await this.db
      .select({
        row: opportunity,
        account: lead.company,
        contractCodes: CONTRACT_CODES,
        /* Số ngày đơn sống. Tính trong câu truy vấn chứ không đọc từ cột: đây
           là con số đổi theo thời gian ngay cả khi không ai chạm vào dòng. Qua
           `epoch` để không phụ thuộc cách Postgres cắt interval. */
        daysOpen: sql<number>`GREATEST(0, FLOOR(
          EXTRACT(epoch FROM COALESCE(${opportunity.closedAt}, now()) - ${opportunity.createdAt}) / 86400
        ))::int`,
        daysInStage: DAYS_IN_STAGE,
        acceptorName: ACCEPTOR_NAME,
        held: HELD,
      })
      .from(opportunity)
      .innerJoin(lead, eq(lead.code, opportunity.leadCode))
      .where(and(eq(opportunity.code, code), leadLive))
      .limit(1)

    if (!found) return null

    const [owners, products] = await Promise.all([
      this.ownersOf(this.db, [code]),
      this.productsOf(this.db, [code]),
    ])
    const { acceptorName, ...rest } = found
    return {
      ...rest,
      signed: found.contractCodes.length > 0,
      ...peopleOf(found.row, acceptorName, owners.get(code)),
      products: products.get(code) ?? [],
    }
  }

  /** Tên hiển thị của một loạt actor, cho dòng gương E1 và cho câu trả lời.
   *
   *  Đọc trước khi ghi vì `platform.object` chở NHÃN còn bảng nối chở id. Ai
   *  không có trong sổ nhân sự thì vắng
   *  mặt trong Map — và insert vào bảng nối sẽ chết ở
   *  `opportunity_owner_actor_id_actor_id_fk` ngay sau đó, đúng hàng rào giữ
   *  cho MỌI cửa chứ không riêng cửa nào nhớ kiểm. */
  async actorNames(tx: Db, ids: readonly string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map()
    const rows = await tx
      .select({ id: actor.id, name: actor.name })
      .from(actor)
      .where(inArray(actor.id, [...ids]))
    return new Map(rows.map((r) => [r.id, r.name]))
  }

  /** The label of a `LOSS_REASON` row, retired rows included — a deal stopped
   *  under a reason since switched off still says why. `null` = no such row. */
  async lossReasonName(id: string): Promise<string | null> {
    const [row] = await this.db
      .select({ name: configEntry.name })
      .from(configEntry)
      .where(and(eq(configEntry.list, 'LOSS_REASON'), eq(configEntry.id, id)))
      .limit(1)
    return row?.name ?? null
  }

  /** The open deals of ONE lead with their owners, oldest first, in one
   *  statement — what the live-deal door needs to build an E2 ref per deal.
   *  Owners keep `ownersOf`'s order (role, primary first, then name). */
  async liveDealsWithOwners(
    leadCode: string,
  ): Promise<{ row: OpportunityRowDb; owners: OpportunityOwner[] }[]> {
    const rows = await this.db
      .select({
        row: opportunity,
        id: opportunityOwner.actorId,
        name: actor.name,
        role: opportunityOwner.role,
        primary: opportunityOwner.isPrimary,
      })
      .from(opportunity)
      .innerJoin(lead, eq(lead.code, opportunity.leadCode))
      .leftJoin(opportunityOwner, eq(opportunityOwner.opportunityCode, opportunity.code))
      .leftJoin(actor, eq(actor.id, opportunityOwner.actorId))
      .where(and(eq(opportunity.leadCode, leadCode), this.live(), leadLive))
      .orderBy(
        opportunity.createdAt,
        opportunity.code,
        opportunityOwner.role,
        desc(opportunityOwner.isPrimary),
        actor.name,
      )

    const deals = new Map<string, { row: OpportunityRowDb; owners: OpportunityOwner[] }>()
    for (const r of rows) {
      const deal = deals.get(r.row.code) ?? { row: r.row, owners: [] }
      if (r.id !== null && r.name !== null && r.role !== null) {
        deal.owners.push({ id: r.id, name: r.name, role: r.role, primary: r.primary ?? false })
      }
      deals.set(r.row.code, deal)
    }
    return [...deals.values()]
  }

  // ── ghi ──────────────────────────────────────────────────────────────────

  /** Ghi đơn. Dòng gương phải đã nằm trong CHÍNH transaction này.
   *
   *  `returning()` vì `stage` là cột SINH: chỉ database biết nó, và chỉ sau khi
   *  insert xong. Dựng lại ở Node là dựng bản thứ hai của một biểu thức đã có
   *  một bản. */
  async insertOpportunity(
    tx: Db,
    row: OpportunityValues & { code: string },
  ): Promise<OpportunityRowDb> {
    const [written] = await tx.insert(opportunity).values(row).returning()
    if (!written) throw new Error(`sales.opportunity: INSERT ${row.code} không trả về dòng nào`)
    return written
  }

  /** Ghi người đứng đơn. Một câu cho cả danh sách. */
  async insertOwners(
    tx: Db,
    rows: readonly (typeof opportunityOwner.$inferInsert)[],
  ): Promise<void> {
    if (rows.length === 0) return
    await tx.insert(opportunityOwner).values([...rows])
  }

  /** Adds owners and never removes one — the accept door's union (ADR 0071).
   *  Someone already standing in that lane is a row already there, so skipped. */
  async addOwners(
    tx: Db,
    rows: readonly { opportunityCode: string; actorId: string; role: 'SALE' | 'BD' }[],
  ): Promise<void> {
    if (rows.length === 0) return
    await tx
      .insert(opportunityOwner)
      .values([...rows])
      .onConflictDoNothing()
  }

  /** Moves the SALE primary of a lane already written (ADR 0086). Two
   *  statements, clear then set: `opportunity_owner_one_primary_idx` is checked
   *  per row, so one UPDATE could meet two primaries midway. */
  async setSalePrimary(tx: Db, code: string, actorId: string | null): Promise<void> {
    const onDeal = eq(opportunityOwner.opportunityCode, code)
    await tx.update(opportunityOwner).set({ isPrimary: false }).where(onDeal)
    if (actorId === null) return
    await tx
      .update(opportunityOwner)
      .set({ isPrimary: true })
      .where(and(onDeal, eq(opportunityOwner.actorId, actorId), eq(opportunityOwner.role, 'SALE')))
  }

  /** Lock one deal `FOR UPDATE`, then re-read what the doors decided on before
   *  the transaction: signed, and a sign request waiting. Two statements on
   *  purpose — in READ COMMITTED the second takes a fresh snapshot, so it sees
   *  whatever committed while this one waited for the lock. `null` = no deal.
   *
   *  The waiting request is read off `platform.approval` directly because
   *  `ApprovalService.pendingOn` cannot join a transaction handle (PGlite would
   *  deadlock); same predicate as `approval_contract_sign_waiting_uq`. */
  async lockDeal(
    tx: Db,
    code: string,
  ): Promise<{ signed: boolean; pendingSign: boolean; lost: boolean } | null> {
    const [locked] = await tx
      .select({ code: opportunity.code, state: opportunity.state })
      .from(opportunity)
      .where(eq(opportunity.code, code))
      .for('update')
    if (!locked) return null

    const [state] = await tx
      .select({
        signed: sql<boolean>`EXISTS (SELECT 1 FROM ${contract} WHERE ${contract.opportunityCode} = ${code})`,
        pendingSign: sql<boolean>`${dealSignWaiting(sql`${code}`)}`,
      })
      .from(sql`(SELECT 1) AS one`)
    return state ? { ...state, lost: locked.state === 'lost' } : null
  }

  /** Every deal of the lead is lost and nothing is signed (`../open-deal.ts`),
   *  read on the stop's own `tx` so it sees the stop it just wrote. */
  async allLost(tx: Db, leadCode: string): Promise<boolean> {
    const [r] = await tx
      .select({ lost: sql<boolean>`${leadDealsAllLost(sql`${leadCode}`)}` })
      .from(sql`(SELECT 1) AS one`)
    return r?.lost === true
  }

  /** Lock leads `FOR NO KEY UPDATE` and answer, per lead, whether it has exited
   *  and who holds it — so a deal write cannot land on a lead exiting or
   *  changing hands in the same instant. Not `FOR SHARE`: the same tx then
   *  UPDATEs the lead to `converted`, and two share-holders upgrading at once
   *  deadlock. The deal's FK takes KEY SHARE, which this mode allows;
   *  `ORDER BY code` keeps batch locks ordered. A switched-off lead comes back
   *  in no row: Postgres re-checks the WHERE once the lock is granted. */
  async lockLeads(tx: Db, leadCodes: readonly string[]) {
    if (leadCodes.length === 0) return []
    const rows = await tx
      .select({
        code: lead.code,
        state: lead.state,
        company: lead.company,
        ownerId: lead.ownerId,
        accountCode: lead.accountCode,
        workstreamCode: lead.workstreamCode,
      })
      .from(lead)
      .where(and(inArray(lead.code, [...leadCodes]), leadLive))
      .orderBy(asc(lead.code))
      .for('no key update')
    return rows.map((r) => ({ ...r, exited: GONE.has(r.state) }))
  }

  /** Sửa một đơn. Trả về dòng SAU khi sửa. */
  async updateOpportunity(
    tx: Db,
    code: string,
    values: Partial<OpportunityValues>,
  ): Promise<OpportunityRowDb> {
    const [written] = await tx
      .update(opportunity)
      .set(values)
      .where(eq(opportunity.code, code))
      .returning()
    if (!written) throw new Error(`sales.opportunity: UPDATE ${code} không trả về dòng nào`)
    return written
  }

  /** Thay TOÀN BỘ danh sách người đứng đơn: xoá hết rồi ghi lại.
   *
   *  ------------------------------------------------------------------
   *  XOÁ-RỒI-GHI CHỨ KHÔNG SO SÁNH HAI TẬP HỢP
   *  ------------------------------------------------------------------
   *  Cửa `PATCH` nhận CẢ danh sách chứ không nhận "thêm ai bớt ai", nên câu hỏi
   *  ở đây là "danh sách mới trông thế nào", không phải "đã đổi những gì". Tính
   *  hiệu hai tập rồi phát ra vài câu INSERT/DELETE cho ra đúng kết quả đó,
   *  bằng nhiều code hơn và thêm một chỗ để sai.
   *
   *  Cùng transaction với lượt UPDATE dòng đơn, nên không có khoảnh khắc nào
   *  một đơn tồn tại mà không ai đứng tên: người đọc thứ hai hoặc thấy danh
   *  sách cũ, hoặc thấy danh sách mới. Ngoài transaction thì đây đúng là khoảng
   *  trống mà một lượt đọc chen vào được. */
  async replaceOwners(
    tx: Db,
    code: string,
    rows: readonly (typeof opportunityOwner.$inferInsert)[],
  ): Promise<void> {
    await tx.delete(opportunityOwner).where(eq(opportunityOwner.opportunityCode, code))
    await this.insertOwners(tx, rows)
  }

  async insertProducts(
    tx: Db,
    rows: readonly { opportunityCode: string; productId: string; list: 'PRODUCT' }[],
  ): Promise<void> {
    if (rows.length === 0) return
    await tx.insert(opportunityProduct).values([...rows])
  }

  /** Delete then re-insert — the same reasoning as `replaceOwners` above, and
   *  cheaper here: the table has only two meaningful columns, so diffing the
   *  two sets would save nothing beyond a few rows rewritten identically. */
  async replaceProducts(
    tx: Db,
    code: string,
    rows: readonly { opportunityCode: string; productId: string; list: 'PRODUCT' }[],
  ): Promise<void> {
    await tx.delete(opportunityProduct).where(eq(opportunityProduct.opportunityCode, code))
    await this.insertProducts(tx, rows)
  }

  async insertStageEvent(tx: Db, row: OpportunityStageEventInsert): Promise<void> {
    await tx.insert(opportunityStageEvent).values(row)
  }

  /** One deal's column history, newest first.
   *
   *  NOT paged — see `OpportunityStageHistory` in the contract. `at` descending
   *  then `id` descending: two column moves inside one millisecond is something
   *  an import run can produce, and without a tiebreaker their order flips
   *  between two opens of the same profile. */
  async stageEventsOf(code: string): Promise<OpportunityStageEventRowDb[]> {
    return this.db
      .select()
      .from(opportunityStageEvent)
      .where(eq(opportunityStageEvent.opportunityCode, code))
      .orderBy(desc(opportunityStageEvent.at), desc(opportunityStageEvent.id))
  }

  /** Who made the deal's oldest column move (its entry), or `null`. The `id`
   *  tiebreak mirrors `stageEventsOf`, so this is that list's last row. */
  async openerOf(code: string): Promise<string | null> {
    const [first] = await this.db
      .select({ byId: opportunityStageEvent.byId })
      .from(opportunityStageEvent)
      .where(eq(opportunityStageEvent.opportunityCode, code))
      .orderBy(asc(opportunityStageEvent.at), asc(opportunityStageEvent.id))
      .limit(1)
    return first?.byId ?? null
  }

  /** The products of a set of deals, ONE query for the whole page.
   *
   *  Same shape as `ownersOf` and for the same reason: one `IN` for fifty rows
   *  instead of fifty round trips. Labels come from `config_entry` right here,
   *  so no screen has to consult a second table to turn 'PD-02' into a name.
   *
   *  Ordered by the catalog's `ord` rather than by name: entry order IS
   *  business order (rule 1 of `config.ts`), so two deals that picked the same
   *  three products print the same three chips in the same order. */
  async productsOf(tx: Db, codes: string[]): Promise<Map<string, OpportunityProduct[]>> {
    if (codes.length === 0) return new Map()

    const rows = await tx
      .select({
        code: opportunityProduct.opportunityCode,
        id: opportunityProduct.productId,
        name: configEntry.name,
        ord: configEntry.ord,
      })
      .from(opportunityProduct)
      .innerJoin(configEntry, eq(configEntry.id, opportunityProduct.productId))
      .where(inArray(opportunityProduct.opportunityCode, codes))
      .orderBy(configEntry.ord)

    const byCode = new Map<string, OpportunityProduct[]>()
    for (const r of rows) {
      const list = byCode.get(r.code)
      const item = { id: r.id, name: r.name }
      if (list) list.push(item)
      else byCode.set(r.code, [item])
    }
    return byCode
  }

  // ── trục phạm vi và câu hỏi "đã thắng chưa" ──────────────────────────────

  /** Trục 3 của E2 trên sổ này: người `ownOnly` chỉ thấy đơn mình đứng tên.
   *
   *  "Đứng tên" đọc CẢ HAI vai — Sale chốt và BD mở cửa. Chỉ đọc `SALE` thì
   *  người BD mở được khách mất luôn đơn của chính mình khỏi sổ, và họ là người
   *  duy nhất biết đơn đó bắt đầu từ đâu.
   *
   *  `EXISTS` chứ không `JOIN`: một đơn có ba người thì join nhân dòng đó lên
   *  ba, và `COUNT` sau đó đếm ba. */
  scopeOf(who: Actor, scoped: boolean): SQL | undefined {
    return dealScope(who, scoped)
  }

  /** Cùng vị từ, nhưng ĐƯỢC CHỌN RA thay vì đem đi lọc — xem `byCode`. */
  private inScopeValue(who: Actor): SQL<boolean> {
    const scope = this.scopeOf(who, true)
    return (scope ? sql`COALESCE(${scope}, false)` : sql`true`) as SQL<boolean>
  }

  /** Đếm dòng sổ theo cùng bộ lọc mà `book()` dùng.
   *
   *  NỐI `lead` dù không chọn cột nào của nó, và đó không phải thừa: hai bộ lọc
   *  (`account`, `q`) đọc `lead.company`, nên một câu đếm không nối sẽ chết ở
   *  Postgres với "missing FROM-clause entry". Nối trong (`innerJoin`) trên một
   *  khoá ngoại NOT NULL không đổi số dòng, nên `total` vẫn là con số cũ. */
  private async count(where: SQL | undefined, db: Db = this.db): Promise<number> {
    const [r] = await db
      .select({ n: count() })
      .from(opportunity)
      .innerJoin(lead, eq(lead.code, opportunity.leadCode))
      .where(where)
    return r?.n ?? 0
  }

  /** Thứ tự sổ. Cột chính theo `sort`, rồi LUÔN LUÔN `code`.
   *
   *  Mặc định vẫn là mới nhất trước: thứ vừa tạo mà phải lật sang trang ba mới
   *  thấy thì người dùng tưởng nút không ăn.
   *
   *  `code` phá hoà ở MỌI kiểu sắp, không riêng `createdAt` — cột nào cũng hoà
   *  được, và không có mốc phá hoà thì Postgres tự do trả về hai thứ tự khác
   *  nhau cho hai lượt gọi cùng một trang: một dòng hiện ở cả trang 1 lẫn trang
   *  2, hoặc không ở trang nào. `OpportunityBookQuery.sort` ghi đúng cảnh báo
   *  này trong hợp đồng.
   *
   *  `NULLS LAST` ở HAI cột nhận NULL, và ở CẢ HAI CHIỀU: mặc định của Postgres
   *  là `NULLS FIRST` khi `DESC`, tức một đơn chưa moi được tiền sẽ đứng đầu
   *  bảng "đơn to nhất" và một đơn chưa đặt ngày đóng sẽ đứng đầu bảng "sắp
   *  đóng nhất". Ô trống không phải một giá trị cực trị — nó là câu "chưa
   *  biết", và chỗ của câu đó là cuối sổ dù sắp chiều nào. Màn đang làm đúng
   *  thế khi còn sắp trong trình duyệt; đây là chính tính chất ấy, viết lại
   *  bằng SQL.
   *
   *  `amount` sắp theo `AMOUNT_VND` chứ không theo cột — xem docblock của biểu
   *  thức đó. */
  private orderBy(q: OpportunityBookQuery): SQL[] {
    const rank = q.q ? [desc(fuzzyRank(SEARCHED, q.q))] : []
    return [...rank, ...this.baseOrder(q)]
  }

  private baseOrder(q: OpportunityBookQuery): SQL[] {
    const dir = q.dir === 'asc' ? 'asc' : 'desc'
    const nullable = q.sort === 'amount' || q.sort === 'expectedClose'

    const primary =
      q.sort === 'name'
        ? opportunity.name
        : q.sort === 'account'
          ? lead.company
          : q.sort === 'amount'
            ? AMOUNT_VND
            : q.sort === 'expectedClose'
              ? opportunity.expectedClose
              : opportunity.createdAt

    return [
      sql`${primary} ${sql.raw(nullable ? `${dir} nulls last` : dir)}`,
      sql`${opportunity.code} ${sql.raw(dir)}`,
    ]
  }

  /** Bộ lọc của NGƯỜI DÙNG. Trục phạm vi không có mặt ở đây — xem `book()`.
   *
   *  Mỗi ô vắng mặt trả `undefined`, và `and()` của Drizzle bỏ qua chúng: "ô
   *  trống nghĩa là không lọc" là quy ước của cả hai sổ, và nó nằm ở đúng một
   *  chỗ thay vì một `if` mỗi ô. `actorId` is the reader, for `pinned` alone. */
  async filtersOf(q: BookFilters, actorId: string): Promise<(SQL | undefined)[]> {
    const ladder = q.overdue ? stageConfigOf(await this.stageRows()) : null
    return [
      /* Not a user filter, and here on purpose: a deal on a switched-off lead is
         absent, so it must leave BOTH counts `hidden` is the difference of. */
      leadLive,
      ladder ? overdueIn(ladder) : undefined,
      q.pinned ? pinnedBy(actorId, 'opportunity', opportunity.code) : undefined,
      q.leadCode ? eq(opportunity.leadCode, q.leadCode) : undefined,
      this.stateFilter(q.state),
      q.stopReason ? eq(opportunity.stopReason, q.stopReason) : undefined,
      /* A lost or won deal stands in no column (`stage` NULL), so it drops out. */
      q.stage ? inArray(opportunity.stage, stagesOf(q.stage)) : undefined,
      /* Accepted = past `new` on the board (ADR 0071); `false` = the `new` queue. */
      q.accepted === undefined
        ? undefined
        : q.accepted
          ? and(isNotNull(opportunity.stage), ne(opportunity.stage, 'new'))
          : eq(opportunity.stage, 'new'),
      ownerFilter(this.db, 'SALE', q.sale),
      ownerFilter(this.db, 'BD', q.bd),
      q.account ? inArray(lead.company, csvOf(q.account)) : undefined,
      q.q ? fuzzyAny(SEARCHED, q.q) : undefined,
    ]
  }

  /** A held deal is off the book and the board (ADR 0097 §3) — except in a
   *  per-lead list (`leadCode`), which answers "what deals does this lead have".
   *  Not in `filtersOf`: the facets count `held` under those same filters. */
  onBoard(q: Pick<BookFilters, 'leadCode'>): SQL | undefined {
    return q.leadCode ? undefined : not(dealHeld(opportunity.code))
  }

  /** Lọc theo trạng thái, và trạng thái thứ BA không có cột.
   *
   *  `won` là SỰ TỒN TẠI của một dòng `sales.contract` — cột `state` chỉ chở hai
   *  giá trị, đúng như `opportunity_state_known` ép. Nên lọc "đơn đã thắng" là
   *  hỏi `EXISTS`, và lọc hai giá trị kia phải kèm `NOT EXISTS`: một đơn đã ký
   *  vẫn lưu `state = 'open'` và ra sổ dưới nhãn `won` (đường đọc gấp lại như
   *  thế ở `opportunity.mapper.ts#toContract`), nên để nó lọt vào lượt lọc
   *  `open` là in ra một dòng mang nhãn người dùng vừa bảo đừng hiện. Bộ lọc
   *  phải gấp giống hệt đường đọc, nếu không sổ tự cãi mình. */
  private stateFilter(state: OpportunityStatus | undefined): SQL | undefined {
    if (!state) return undefined
    if (state === 'won') return this.signed()
    return and(eq(opportunity.state, state), not(this.signed()))
  }

  /** Sáu con số của thẻ điểm, MỘT lượt đi tới database.
   *
   *  Sáu `SELECT count(*)` rời nhau là sáu vòng tới Neon cho một tấm thẻ, và
   *  Neon tính tiền theo lượt hỏi. `FILTER (WHERE …)` cho phép sáu phép gộp
   *  khác điều kiện chạy trên MỘT lượt quét bảng — cùng thứ mà sổ lead làm bằng
   *  bốn truy vấn con vô hướng, hình khác vì ở đây sáu câu hỏi đều hỏi về cùng
   *  một bảng.
   *
   *  KHÔNG nhận `Actor` và không nhận bộ lọc: thẻ điểm là điểm của CẢ SỔ. Lý do
   *  đầy đủ ở `OpportunityService.scorecard`.
   *
   *  ------------------------------------------------------------------
   *  "ĐANG MỞ" ĐỌC TỪ `stage`, KHÔNG ĐỌC TỪ `state`
   *  ------------------------------------------------------------------
   *  `stage IS NOT NULL` là định nghĩa của "còn đứng trong bốn cột", và nó đúng
   *  cho cả hai đầu cuối: cửa dừng và cửa ký lần đầu đều đặt `stage` về
   *  NULL. Đọc `state` thay vào đó sẽ đếm nhầm một đơn đã ký, vì đơn thắng vẫn
   *  lưu `state = 'open'`.
   *
   *  `SUM` ra kiểu `bigint`, mà `bigint` về tới Node là CHUỖI với node-postgres
   *  (PGlite thì trả số). `Number()` ở dưới nuốt cả hai; ép `::int` ở đây thì
   *  một pipeline vài nghìn tỷ đồng tràn `int4` và câu truy vấn nổ. */
  async scorecard(): Promise<OpportunityScorecardRow> {
    /* A held deal is off the board (ADR 0097 §3), so off its open count and
       the total too: total stays open + won + lost. */
    const open = sql`${opportunity.stage} IS NOT NULL AND NOT ${dealHeld(opportunity.code)}`

    const [r] = await this.db
      .select({
        total: sql<number>`count(*) FILTER (WHERE NOT ${dealHeld(opportunity.code)})::int`,
        open: sql<number>`count(*) FILTER (WHERE ${open})::int`,
        openAmountVnd: sql<
          number | string
        >`COALESCE(SUM(${AMOUNT_VND}) FILTER (WHERE ${open} AND ${opportunity.amount} IS NOT NULL), 0)::bigint`,
        openBlank: sql<number>`count(*) FILTER (WHERE ${open} AND ${opportunity.amount} IS NULL)::int`,
        won: sql<number>`count(*) FILTER (WHERE ${this.signed()})::int`,
        /* Đã dừng = cột `state` nói `lost` VÀ chưa ký. Vế thứ hai giữ cho `won`
           và `lost` không cùng đếm một dòng — đường đọc gấp `signed` đè lên
           `state`, nên thẻ điểm đếm mỗi đơn đúng một lần, ở đúng ô của nó. */
        lost: sql<number>`count(*) FILTER (WHERE ${opportunity.state} = 'lost' AND NOT ${this.signed()})::int`,
      })
      .from(opportunity)
      .innerJoin(lead, eq(lead.code, opportunity.leadCode))
      .where(leadLive)

    return {
      total: r?.total ?? 0,
      open: r?.open ?? 0,
      openAmountVnd: Number(r?.openAmountVnd ?? 0),
      openBlank: r?.openBlank ?? 0,
      won: r?.won ?? 0,
      lost: r?.lost ?? 0,
    }
  }

  /** The open pipeline split across the columns it is standing in —
   *  `GET /sales/opportunities/histogram`.
   *
   *  Two queries, and the order matters: the configured limits are read FIRST
   *  because the "rotting" predicate is built out of them. They cannot be
   *  joined in SQL — `config_entry` stores no stage key, so the pairing is by
   *  ordinal position and that lives in `../ladder.ts` behind its fence.
   *
   *  Unscoped like the scorecard, and open reads from `stage IS NOT NULL` for
   *  the same reason stated there: won and lost deals have left the board. */
  async histogram(): Promise<OpportunityStageBucket[]> {
    const config = stageConfigOf(await this.stageRows())
    const rotting = overdueIn(config)

    const rows = await this.db
      .select({
        stage: opportunity.stage,
        count: count(),
        amountVnd: sql<number | string>`COALESCE(SUM(${AMOUNT_VND}), 0)::bigint`,
        blank: sql<number>`count(*) FILTER (WHERE ${opportunity.amount} IS NULL)::int`,
        rotting: sql<number>`count(*) FILTER (WHERE ${rotting})::int`,
        rottingAmountVnd: sql<
          number | string
        >`COALESCE(SUM(${AMOUNT_VND}) FILTER (WHERE ${rotting}), 0)::bigint`,
      })
      .from(opportunity)
      .innerJoin(lead, eq(lead.code, opportunity.leadCode))
      .where(and(isNotNull(opportunity.stage), leadLive, not(dealHeld(opportunity.code))))
      .groupBy(opportunity.stage)

    const tally = new Map(rows.map((r) => [r.stage, r]))

    /* Emitted in the board's own column order rather than the order Postgres
       grouped them in, and an empty column is left out entirely — the screen
       decides whether to draw a zero bar or a gap. */
    return StageKey.options.flatMap((stage) => {
      const r = tally.get(stage)
      if (!r) return []
      const c = config.get(stage)

      return [
        {
          stage,
          label: c?.label ?? stage,
          count: r.count,
          amountVnd: Number(r.amountVnd),
          blank: r.blank,
          rotting: r.rotting,
          rottingAmountVnd: Number(r.rottingAmountVnd),
          limitDays: c?.limitDays ?? null,
        },
      ]
    })
  }

  /** The STAGE list as configured, ACTIVE ONLY and in `ord` order — the two
   *  conditions `stageConfigOf` reads positions under. */
  /** The STAGE list as `stageConfigOf` needs it. Public since the profile door
   *  reads the ladder too: `pipelinePosition` is given the phases and their
   *  clocks, and a second loader would be a second chance to read the list in a
   *  different order — which is the one thing `../ladder.ts` fences. */
  stageRows(): Promise<{ name: string; limitDays: number | null }[]> {
    return this.db
      .select({ name: configEntry.name, limitDays: configEntry.limitDays })
      .from(configEntry)
      .where(and(eq(configEntry.list, 'STAGE'), eq(configEntry.active, true)))
      .orderBy(asc(configEntry.ord))
  }

  /* "Đã thắng" có hai hình, cố ý: ĐỌC RA là `CONTRACT_CODES` (một mảng, vì đơn
     thắng ký thêm được và một `LEFT JOIN` sẽ nhân dòng sổ lên), ĐEM ĐI LỌC là
     `signed` (`EXISTS`). Cả hai khớp CẢ HAI cột mà `contract_opportunity_fk` neo. */

  /** Mệnh đề khớp `contract` với đơn, cho vị từ `signed` bên dưới. */
  private signedOn(): SQL {
    return and(
      eq(contract.opportunityCode, opportunity.code),
      eq(contract.leadCode, opportunity.leadCode),
    ) as SQL
  }

  /** "Still open": not lost, not signed — the branch's one rule, `../open-deal.ts`. */
  private live(): SQL {
    return dealOpen(opportunity.code, opportunity.state)
  }

  /** Same question in PREDICATE shape, for `WHERE` and `FILTER`: `stateFilter`
   *  (the fifth state) and `scorecard` (won deals) need a boolean, not a code. */
  signed(): SQL {
    return exists(
      this.db
        .select({ one: sql`1` })
        .from(contract)
        .where(this.signedOn()),
    )
  }
}
