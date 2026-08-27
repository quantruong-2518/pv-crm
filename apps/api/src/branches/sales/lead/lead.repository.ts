import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  ilike,
  isNotNull,
  isNull,
  not,
  sql,
  type SQL,
} from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { Inject, Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import { OWNER_NONE, type LeadBookQuery, type LeadStatus } from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { actor } from '@api/platform/db/platform.schema'
import { contract } from '../contract/contract.schema'
import { lead } from './lead.schema'
import type { LeadProfileRead, LeadRead } from './lead.mapper'

export type LeadBookPage = {
  rows: LeadRead[]
  /** Số dòng người này ĐƯỢC thấy, sau khi áp cả bộ lọc lẫn trục phạm vi. */
  total: number
  /** Số dòng bộ lọc khớp nhưng phạm vi cắt đi. Đây là con số màn hiện thành
   *  "Bị ẩn theo quyền của bạn" (luật 7) — nó phải do máy chủ đếm, vì màn
   *  không đếm được thứ nó không nhận. */
  hidden: number
}

/** The `actor` table, joined twice more.
 *
 *  One query cannot join the same table three times under one name, and the
 *  profile needs three different people out of it: the holder (the scope
 *  axis), the BD credited on the row, and the marketing owner credited on it.
 *  `alias()` is Drizzle's way of saying so; the SQL it prints is the ordinary
 *  `LEFT JOIN platform.actor "bd_owner" ON …`.
 *
 *  The holder keeps the bare `actor` name so `book()` and `byCode()` spell that
 *  join identically. */
const bdOwner = alias(actor, 'bd_owner')
const marketingOwner = alias(actor, 'marketing_owner')

/** One profile row, plus the verdict of the scope axis on it.
 *
 *  `inScope` travels beside the data rather than deciding whether the data
 *  comes back at all, and that is the whole difference between a book and a
 *  profile — see the docblock on `byCode()`. */
export type LeadProfileFound = LeadProfileRead & { inScope: boolean }

/** Số ngày lead nằm ở chỗ hiện tại.
 *
 *  Tính trong câu truy vấn chứ không đọc từ một cột: đây là con số đổi theo
 *  thời gian ngay cả khi không ai chạm vào dòng dữ liệu, nên một cột `days_here`
 *  chỉ đúng vào đêm job vừa chạy. Lead đã rơi thì đồng hồ dừng ở `exited_at`.
 *
 *  Qua `epoch` chứ không `EXTRACT(day FROM …)`: epoch luôn là tổng số giây của
 *  cả khoảng, không phụ thuộc cách Postgres cắt interval thành tháng/ngày. */
const DAYS_HERE = sql<number>`GREATEST(0, FLOOR(
  EXTRACT(epoch FROM COALESCE(${lead.exitedAt}, now()) - ${lead.stageSince}) / 86400
))::int`

/** One number from `sales.lead_code_seq`, printed as `LD-%04d`.
 *
 *  The sequence is declared in `lead.schema.ts` (`leadCodeSeq`) so
 *  `drizzle-kit` owns it, but Drizzle has no expression node for `nextval`, so
 *  the name is written out once more here. Two spellings of one name is a
 *  small risk; the alternative is a code format nobody can read.
 *
 *  `lpad(…, 4, '0')` pads, it does not truncate — lead 10 000 gets `LD-10000`.
 *  See the long note on `leadCodeSeq` for the rest. */
const NEXT_CODE = sql`SELECT 'LD-' || lpad(nextval('sales.lead_code_seq')::text, 4, '0') AS code`

/** Chỗ DUY NHẤT trong module lead có SQL.
 *
 *  Không quyết định gì về quyền: nó chỉ THI HÀNH trục phạm vi mà endpoint đã
 *  khai bằng `@Need({ scoped: true })`. Lọc ở SQL chứ không nạp cả sổ rồi cắt
 *  trong Node — một actor `ownOnly` gọi sổ 100 dòng mà nhận đủ 100 rồi mới lọc
 *  thì 100 dòng đó đã rời khỏi database, và đó là rò rỉ chứ không phải lãng
 *  phí. */
@Injectable()
export class LeadRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Reserve the next lead code. Call this BEFORE writing anything.
   *
   *  `code` is a `text` primary key with no DEFAULT, and it cannot get one:
   *  the key is also a foreign key into `platform.object`, so the mirror row
   *  has to be written first, which means the caller has to know the code
   *  first. The full argument is on `leadCodeSeq` in `lead.schema.ts`.
   *
   *  Every intake path calls this and then writes `platform.object` and
   *  `sales.lead` in ONE transaction.
   *
   *  `nextval` deliberately ignores transactions: a rolled-back insert burns
   *  its number and the next lead takes the one after it. Gaps in the code
   *  series are normal and cost nothing — two leads holding one code would
   *  cost a primary key, and that is the trade a sequence exists to make.
   *
   *  `Db` is driver-agnostic (see `create-db.ts`), so `execute()` cannot know
   *  the result shape: node-postgres returns `QueryResult`, PGlite returns
   *  `Results`. Both carry `.rows` — same hand-written cast
   *  `graph.repository.ts` explains at length. */
  async nextCode(): Promise<string> {
    const r = (await this.db.execute(NEXT_CODE)) as { rows: { code: string }[] }
    const code = r.rows[0]?.code
    /* An empty result here means the sequence is gone, not that a lead is
       missing. Failing loudly beats returning a code nobody generated. */
    if (!code) throw new Error('sales.lead_code_seq trả về rỗng — migration đã chạy chưa?')
    return code
  }

  async book(who: Actor, q: LeadBookQuery, scoped: boolean): Promise<LeadBookPage> {
    const filters = this.filtersOf(q)

    const scope = this.scopeOf(who, scoped)

    /* Chỉ đếm LẦN HAI khi trục phạm vi thật sự đang cắt. Với một actor nhìn
       được cả sổ, `hidden` luôn bằng 0 — chạy thêm một COUNT toàn bảng mỗi
       lần mở sổ chỉ để in ra số 0 là trả phí cho một câu không ai hỏi. */
    const [scoped_, all] = await Promise.all([
      this.count(and(...filters, scope)),
      scope ? this.count(and(...filters)) : Promise.resolve(null),
    ])

    const rows = await this.db
      .select({
        row: lead,
        ownerName: actor.name,
        ownerEmail: actor.email,
        daysHere: DAYS_HERE,
        signed: this.signedValue(),
      })
      .from(lead)
      .leftJoin(actor, eq(actor.id, lead.ownerId))
      .where(and(...filters, scope))
      .orderBy(...this.orderBy(q))
      .limit(q.size)
      .offset((q.page - 1) * q.size)

    return { rows, total: scoped_, hidden: all === null ? 0 : all - scoped_ }
  }

  /** Một lead theo mã — CẢ DÒNG, kể cả khi trục phạm vi không cho người này
   *  đọc nó.
   *
   *  ------------------------------------------------------------------
   *  WHY THE SCOPE AXIS IS SELECTED HERE INSTEAD OF FILTERING
   *  ------------------------------------------------------------------
   *  `book()` puts the scope predicate in the WHERE clause, and that is right
   *  for a book: a row the caller may not see must not leave the database at
   *  all, because a hundred rows filtered in Node are a hundred rows already
   *  leaked.
   *
   *  A profile is one row, and the same trick would answer the wrong question.
   *  With the predicate in the WHERE clause, "this lead does not exist" and
   *  "this lead is not yours" come back as the same empty result — so the
   *  endpoint would have to answer 404 to both, and a Sale who opens a
   *  colleague's lead would be told the lead is not in the book. That is a lie
   *  with a cost: the four deny reasons exist precisely so the screen can say
   *  "ask whoever holds it" instead of sending someone hunting for a row that
   *  is right there.
   *
   *  So the same predicate is SELECTED rather than applied, `scopeOf()` builds
   *  it exactly once for both callers, and the service turns `inScope: false`
   *  into a 403 `out-of-scope`. One row crosses the process boundary and is
   *  then dropped; nothing about it is ever serialised.
   *
   *  `COALESCE(…, false)` is not decoration. `owner_id = 'u-huy'` is NULL, not
   *  false, for a lead nobody has taken — and NULL reaching JavaScript as
   *  `null` would sail straight through an `if (!inScope)` written the obvious
   *  way. It also states the rule the book already applies: an unclaimed lead
   *  is out of scope for an `ownOnly` actor, which is why `u-huy` counts ten
   *  rows and not ten plus the common pool. */
  async byCode(who: Actor, code: string): Promise<LeadProfileFound | null> {
    const scope = this.scopeOf(who, true)

    const [row] = await this.db
      .select({
        row: lead,
        ownerName: actor.name,
        ownerEmail: actor.email,
        bdOwnerName: bdOwner.name,
        bdOwnerEmail: bdOwner.email,
        marketingOwnerName: marketingOwner.name,
        marketingOwnerEmail: marketingOwner.email,
        daysHere: DAYS_HERE,
        signed: this.signedValue(),
        inScope: scope ? sql<boolean>`COALESCE(${scope}, false)` : sql<boolean>`true`,
      })
      .from(lead)
      .leftJoin(actor, eq(actor.id, lead.ownerId))
      .leftJoin(bdOwner, eq(bdOwner.id, lead.bdOwnerId))
      .leftJoin(marketingOwner, eq(marketingOwner.id, lead.marketingOwnerId))
      .where(eq(lead.code, code))
      .limit(1)

    return row ?? null
  }

  /** Trục 3 · phạm vi. MỘT biểu thức, hai chỗ dùng.
   *
   *  So bằng `id`, KHÔNG bằng tên hiển thị. Đây là chỗ nợ số 2 được trả trước ở
   *  phía máy chủ: hai người trùng tên không thấy sổ của nhau, và không mở được
   *  hồ sơ của nhau.
   *
   *  Built here rather than spelled out at each call site because the book and
   *  the profile MUST agree: a lead readable in one and refused in the other is
   *  a bug nobody reports, they just stop trusting the screen. `book()` hands
   *  it to `where()`, `byCode()` selects it as a value — same predicate, two
   *  positions.
   *
   *  `undefined` means the axis is not cutting anything, which is what Drizzle
   *  reads as "no condition" inside `and(...)`. */
  private scopeOf(who: Actor, scoped: boolean): SQL | undefined {
    return scoped && who.ownOnly ? eq(lead.ownerId, who.id) : undefined
  }

  private async count(where: SQL | undefined): Promise<number> {
    const [r] = await this.db.select({ n: count() }).from(lead).where(where)
    return r?.n ?? 0
  }

  /** Has this lead been signed — one hop on one index, asked of `contract`
   *  directly through `lead_code`.
   *
   *  An earlier version read a `lead.contract_code` column. That column went
   *  away when lead → opportunity became 1-n: one column cannot carry a lead
   *  that signed twice, and a second column is exactly where two answers to one
   *  question start to disagree.
   *
   *  The predicate is stated in the POSITIVE — `EXISTS`, true when signed —
   *  and that is deliberate. It was briefly written as `NOT EXISTS` under this
   *  same name, which made every caller correct only because it negated the
   *  method back: `status='signed'` read `not(signed())`. The behaviour was
   *  right and the name was a lie, which is the shape of bug that survives
   *  review and then bites whoever adds the fifth caller. */
  private signed(): SQL {
    return exists(
      this.db
        .select({ one: sql`1` })
        .from(contract)
        .where(eq(contract.leadCode, lead.code)),
    )
  }

  /** The same predicate as a SELECTED value rather than a filter.
   *
   *  Cast to `SQL<boolean>` because Drizzle's builders return an untyped `SQL`,
   *  while the SELECT list has to produce the `boolean` that `LeadRead.signed`
   *  declares. */
  private signedValue(): SQL<boolean> {
    return this.signed() as SQL<boolean>
  }

  /** The four branches of the book's `status` filter — see `LeadStatus` in
   *  `@pv/contracts` for the full reasoning. Replaces the old two-valued
   *  `q.running`, which had no branch a SIGNED lead could ever match. */
  private statusFilter(status: LeadStatus): SQL | undefined {
    switch (status) {
      case 'running':
        /* "Còn chạy" = chưa rơi khỏi luồng và chưa ký. Định nghĩa này nằm ở
           `isRunning()` bên engine; ở đây là bản dịch sang SQL của cùng một câu,
           và bước B của doc bàn giao sẽ gộp chúng lại làm một. */
        return and(isNull(lead.exitReason), not(this.signed()))
      case 'signed':
        return this.signed()
      case 'exited':
        return isNotNull(lead.exitReason)
      case 'all':
        return undefined
    }
  }

  /** Sort column for `q.sort`, plus the tiebreaker every sort needs.
   *
   *  `code` is appended to EVERY order, not only when sorting by `createdAt`:
   *  any other column ties too, and without a final tiebreaker Postgres is
   *  free to hand back a different order on the next call for rows tied on
   *  the primary key — the same row then lands on page 1 and page 2, or on
   *  neither. `daysHere` is not a column, so it orders by the same
   *  `DAYS_HERE` expression the SELECT list above computes. */
  private orderBy(q: LeadBookQuery): SQL[] {
    const dir = q.dir === 'asc' ? asc : desc
    const primary =
      q.sort === 'company' ? lead.company : q.sort === 'daysHere' ? DAYS_HERE : lead.createdAt
    return [dir(primary), dir(lead.code)]
  }

  private filtersOf(q: LeadBookQuery): (SQL | undefined)[] {
    return [
      q.stage ? eq(lead.stage, q.stage) : undefined,
      q.tier ? eq(lead.tier, q.tier) : undefined,
      q.category ? eq(lead.category, q.category) : undefined,
      this.statusFilter(q.status),
      q.source ? eq(lead.source, q.source) : undefined,
      /* `OWNER_NONE` is the wire spelling of "nobody has taken it" — see the
         constant's docblock in `@pv/contracts`. It carries no actor id of its
         own, so it maps to `owner_id IS NULL` rather than an equality check. */
      q.owner
        ? q.owner === OWNER_NONE
          ? isNull(lead.ownerId)
          : eq(lead.ownerId, q.owner)
        : undefined,
      q.account ? eq(lead.company, q.account) : undefined,
      q.q ? ilike(lead.company, `%${q.q}%`) : undefined,
    ]
  }
}
