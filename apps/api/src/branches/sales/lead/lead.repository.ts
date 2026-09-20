import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  notInArray,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { Inject, Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  LEAD_OPEN_STATES,
  LeadState,
  OWNER_NONE,
  type LeadBookQuery,
  type LeadFacetsQuery,
  type LeadSourceKind,
  type LeadTier,
  type LeadStateFilter,
} from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { contains } from '@api/platform/db/like'
import { actor } from '@api/platform/db/platform.schema'
import { configEntry } from '../config/config.schema'
import { leadSigned } from '../open-deal'
import { LEAD_GONE_STATES } from './lead-state'
import { touch } from '../touch/touch.schema'
import { lead } from './lead.schema'
import type {
  LeadMailEventRead,
  LeadMailTimelineRead,
  LeadProfileRead,
  LeadRead,
} from './lead.mapper'

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

/** The campaign a lead is attributed to, joined for its NAME.
 *
 *  `list = 'SOURCE'` is in the ON clause even though `config_entry.id` is the
 *  primary key and the six prefixes already keep the lists apart. It costs
 *  nothing and it states the rule: a `campaign_id` holding `ST-01` must come
 *  back with NO name rather than with a pipeline stage's name printed on the
 *  screen where a campaign belongs. The column has no foreign key yet — that
 *  debt is recorded on the column itself in `lead.schema.ts` — so this is the
 *  only place that mismatch can be caught.
 *
 *  A LEFT join, never inner: most leads have no campaign at all, and an inner
 *  join here would silently drop them out of the book.
 *
 *  Exported because the journey book prints the same name off the same lead row
 *  — a second spelling of this ON clause is a second thing to keep in step. */
export const CAMPAIGN_ON = and(eq(configEntry.id, lead.campaignId), eq(configEntry.list, 'SOURCE'))

/** One profile row, plus the verdict of the scope axis on it.
 *
 *  `inScope` travels beside the data rather than deciding whether the data
 *  comes back at all, and that is the whole difference between a book and a
 *  profile — see the docblock on `byCode()`. */
export type LeadProfileFound = LeadProfileRead & { inScope: boolean }

/** Whole days in the current `state` — computed in the query, not stored,
 *  because it changes with the clock while nobody touches the row. No stop at
 *  `exited_at` any more: `state_since` already restarts on every move, exit
 *  included (ADR 0058).
 *
 *  Through `epoch` rather than `EXTRACT(day FROM …)`: epoch is always the
 *  interval's total seconds, whatever way Postgres splits it into months. */
const DAYS_HERE = sql<number>`GREATEST(0, FLOOR(
  EXTRACT(epoch FROM now() - ${lead.stateSince}) / 86400
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
    const filters = [...this.filtersOf(q), this.stateFilter(q.state)]

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
        campaignName: configEntry.name,
        daysHere: DAYS_HERE,
        signed: this.signedValue(),
      })
      .from(lead)
      .leftJoin(actor, eq(actor.id, lead.ownerId))
      .leftJoin(configEntry, CAMPAIGN_ON)
      .where(and(...filters, scope))
      .orderBy(...this.orderBy(q))
      .limit(q.size)
      .offset((q.page - 1) * q.size)

    return { rows, total: scoped_, hidden: all === null ? 0 : all - scoped_ }
  }

  /** Nửa "không chiến dịch" của ô lọc Nguồn — bốn `LeadSourceKind` nào đang
   *  THẬT SỰ đứng không kèm chiến dịch trong sổ, không phải cả bốn giá trị
   *  enum liệt kê sẵn. Đọc docblock `LeadFacets` (`@pv/contracts`) trước khi
   *  đụng vào chỗ này — nó nói lý do nửa chiến dịch KHÔNG nằm ở đây.
   *
   *  Cùng trục PHẠM VI với `book()`, cùng `scopeOf()`: một Sale `ownOnly` chỉ
   *  thấy sourceKind trong LEAD MÌNH GIỮ.
   *
   *  `isNull(campaignId)`: một lead CÓ chiến dịch không bao giờ in `kind` ra
   *  cột Nguồn (`SourceMark` ưu tiên tên chiến dịch), nên kind của nó không
   *  phải một lựa chọn lọc có ý nghĩa — liệt kê nó ra là vẽ thêm một mục ô lọc
   *  không khớp dòng nào khi chọn. */
  async sourceKindFacets(who: Actor): Promise<LeadSourceKind[]> {
    const scope = this.scopeOf(who, true)

    const rows = await this.db
      .selectDistinct({ kind: lead.sourceKind })
      .from(lead)
      .where(and(isNull(lead.campaignId), isNotNull(lead.sourceKind), scope))

    return rows.map((r) => r.kind as LeadSourceKind)
  }

  /** How many leads each state tab would show: the book's own filters and
   *  scope, minus `state`. Every state is present, zeros included. */
  async stateFacets(who: Actor, q: LeadFacetsQuery): Promise<Record<LeadState, number>> {
    const rows = await this.db
      .select({ state: lead.state, n: count() })
      .from(lead)
      .where(and(...this.filtersOf(q), this.scopeOf(who, true)))
      .groupBy(lead.state)
    const byState = Object.fromEntries(LeadState.options.map((s) => [s, 0])) as Record<
      LeadState,
      number
    >
    for (const r of rows) byState[r.state] = r.n
    return byState
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
        campaignName: configEntry.name,
        daysHere: DAYS_HERE,
        signed: this.signedValue(),
        inScope: scope ? sql<boolean>`COALESCE(${scope}, false)` : sql<boolean>`true`,
      })
      .from(lead)
      .leftJoin(actor, eq(actor.id, lead.ownerId))
      .leftJoin(bdOwner, eq(bdOwner.id, lead.bdOwnerId))
      .leftJoin(marketingOwner, eq(marketingOwner.id, lead.marketingOwnerId))
      .leftJoin(configEntry, CAMPAIGN_ON)
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

  /** EVERY BATCH THIS LEAD WAS POSTED IN, newest first — the lead side of MAS.
   *
   *  ------------------------------------------------------------------
   *  THE SCOPE AXIS IS NOT HERE, AND THAT IS NOT AN OMISSION
   *  ------------------------------------------------------------------
   *  No `scopeOf` in this query, unlike `book()` and `byCode()`. The reason is
   *  that the caller has already been through `byCode()` on this same request:
   *  `LeadService.mailTimeline` refuses with 404 or 403 before this runs, so
   *  by the time these rows are read the entitlement is settled. Repeating the
   *  join would cut on `owner_id` a second time and produce an EMPTY timeline
   *  where the correct answer is a refusal — a lead somebody else holds would
   *  read "chưa gửi lá thư nào", which is the failure `hidden` exists to
   *  prevent everywhere else in this file.
   *
   *  ------------------------------------------------------------------
   *  `mail_run_id IS NOT NULL` IS A FILTER ON WHO THE LETTER WAS FOR
   *  ------------------------------------------------------------------
   *  `email_delivery` is one ledger for both flows, and the lead-intake alert
   *  writes `aggregate_type='lead'` with this same code — but it is a letter
   *  ABOUT the lead, sent to our own inbox, not a letter TO them. It carries no
   *  run (`mail_run_id` is NULL for every one-off), which is exactly the
   *  distinction needed, and it is also what `LeadMailTimelineRow` requires:
   *  the row is built around a run's identity and there is none to report.
   *  Putting an internal alert on a customer's timeline would have somebody
   *  ask the customer about a mail they were never sent.
   *
   *  ------------------------------------------------------------------
   *  ONE ROW PER RUN, WITHOUT A GROUP BY OVER THE DELIVERY
   *  ------------------------------------------------------------------
   *  A lead can appear at most once in a run: `event_key` is
   *  `mas/lead/v1/<runId>:<leadCode>` and it is UNIQUE, so the join to
   *  `mail_run` cannot multiply rows. Only `mail_event` is many-per-delivery,
   *  and it is aggregated in a correlated subquery rather than a second join
   *  for the reason `MailRunRepository.list` states about its two passes:
   *  joining events into the same statement multiplies the delivery row by its
   *  events and quietly inflates anything counted beside them.
   *
   *  `count(*)` and NOT `count(DISTINCT …)`, opposite to the run list. There
   *  the question is "how many of the audience opened it" and one person
   *  opening six times must not read as six people; here the question is
   *  `LeadMailTimelineRow.openCount` — how many times THIS person opened it —
   *  and the six is the answer. Read that field's docblock before putting the
   *  number next to a word like "quan tâm": at single-lead scale the Apple MPP
   *  noise is proportionally far worse.
   *
   *  ------------------------------------------------------------------
   *  `mail_sequence_run`/`campaign` ARE LEFT JOINS, AND NULL IS A REAL ANSWER
   *  ------------------------------------------------------------------
   *  Quick MAS fires straight from the lead book with no campaign attached —
   *  `mail_sequence_run.mail_run_id` is unique but not required, so a run may
   *  match zero rows here. NULL on `campaign_code`/`campaign_name` means "sent
   *  on its own", not "data missing", and the mapper must read it that way.
   *  `subject_type = 'campaign'` sits in the ON and not the WHERE: a wave of a
   *  LEAD's own chain is a real row this timeline must still show, campaign-less. */
  async mailTimeline(code: string): Promise<LeadMailTimelineRead[]> {
    const r = (await this.db.execute(sql`
      SELECT r."id"                                          AS run_id,
             r."label"                                       AS label,
             r."state"                                       AS run_state,
             r."scheduled_at"                                AS scheduled_at,
             d."accepted_at"                                 AS sent_at,
             d."delivered_at"                                AS delivered_at,
             d."state"                                       AS delivery_state,
             d."last_error_summary"                          AS fail_reason,
             COALESCE(e.open_count, 0)::int                  AS open_count,
             e.last_open_at                                  AS last_open_at,
             COALESCE(e.click_count, 0)::int                 AS click_count,
             e.last_click_at                                 AS last_click_at,
             COALESCE(p.reply_count, 0)::int                 AS reply_count,
             p.last_reply_at                                 AS last_reply_at,
             c."code"                                        AS campaign_code,
             c."name"                                        AS campaign_name
        FROM "platform"."email_delivery" d
        JOIN "platform"."mail_run" r ON r."id" = d."mail_run_id"
        LEFT JOIN LATERAL (
              SELECT count(*) FILTER (WHERE m."kind" = 'OPEN')::int   AS open_count,
                     max(m."at") FILTER (WHERE m."kind" = 'OPEN')     AS last_open_at,
                     count(*) FILTER (WHERE m."kind" = 'CLICK')::int  AS click_count,
                     max(m."at") FILTER (WHERE m."kind" = 'CLICK')    AS last_click_at
                FROM "platform"."mail_event" m
               WHERE m."delivery_id" = d."id"
             ) e ON true
        LEFT JOIN LATERAL (
              SELECT count(*)::int      AS reply_count,
                     max(p."received_at") AS last_reply_at
                FROM "platform"."mail_reply" p
               WHERE p."delivery_id" = d."id"
             ) p ON true
        LEFT JOIN "sales"."mail_sequence_run" cr
               ON cr."mail_run_id" = r."id" AND cr."subject_type" = 'campaign'
        LEFT JOIN "sales"."campaign" c ON c."code" = cr."subject_code"
       WHERE d."aggregate_type" = 'lead'
         AND d."aggregate_id" = ${code}
         AND d."mail_run_id" IS NOT NULL
       ORDER BY r."created_at" DESC, r."id" DESC
    `)) as { rows: LeadMailTimelineRead[] }

    return r.rows
  }

  /** The full engagement history of ONE run's letter to this lead — opens,
   *  clicks, replies, in the order they happened. A second door beside
   *  `mailTimeline()` for the reason spelled out at `LeadMailEventRow` in
   *  `@pv/contracts`: the summary row is unpaged, and embedding every open a
   *  lead ever racked up into it would make the common case pay for the rare
   *  one.
   *
   *  Same scope discipline as `mailTimeline()`: the caller has already been
   *  through `LeadService`'s `byCode`/`inScope` guard for this request, so no
   *  `owner_id` cut repeats here — and this method additionally pins the
   *  delivery to BOTH `code` and `runId`, so a run id that belongs to some
   *  OTHER lead's letter returns an empty list rather than someone else's
   *  events. */
  async mailEvents(code: string, runId: string): Promise<LeadMailEventRead[]> {
    const r = (await this.db.execute(sql`
      WITH target AS (
        SELECT d."id"
          FROM "platform"."email_delivery" d
         WHERE d."aggregate_type" = 'lead'
           AND d."aggregate_id" = ${code}
           AND d."mail_run_id" = ${runId}
         LIMIT 1
      )
      SELECT 'OPEN'  AS kind, m."at" AS at, NULL::text AS detail, NULL::text AS from_address
        FROM "platform"."mail_event" m
        JOIN target t ON t."id" = m."delivery_id"
       WHERE m."kind" = 'OPEN'
      UNION ALL
      SELECT 'CLICK' AS kind, m."at" AS at, m."url" AS detail, NULL::text AS from_address
        FROM "platform"."mail_event" m
        JOIN target t ON t."id" = m."delivery_id"
       WHERE m."kind" = 'CLICK'
      UNION ALL
      SELECT 'REPLY' AS kind, p."received_at" AS at, p."subject" AS detail, p."from_address" AS from_address
        FROM "platform"."mail_reply" p
        JOIN target t ON t."id" = p."delivery_id"
      ORDER BY at ASC
    `)) as { rows: LeadMailEventRead[] }

    return r.rows
  }

  /** Signed = the lead holds a contract AND no deal of it is still open.
   *
   *  A lead may run several deals at once, so a signature on one must not file
   *  the lead as finished while a sibling deal is still being worked — that
   *  lead stays `running`. The rule itself lives in `../open-deal.ts`. */
  private signed(): SQL {
    return leadSigned(lead.code)
  }

  /** The same predicate as a SELECTED value rather than a filter.
   *
   *  Cast to `SQL<boolean>` because Drizzle's builders return an untyped `SQL`,
   *  while the SELECT list has to produce the `boolean` that `LeadRead.signed`
   *  declares. */
  private signedValue(): SQL<boolean> {
    return this.signed() as SQL<boolean>
  }

  /** The book's `state` filter: `open` is the five `LEAD_OPEN_STATES`, `live`
   *  is everything not gone, `all` is no condition, anything else is one state. */
  private stateFilter(state: LeadStateFilter): SQL | undefined {
    if (state === 'all') return undefined
    if (state === 'open') return inArray(lead.state, [...LEAD_OPEN_STATES])
    if (state === 'live') return notInArray(lead.state, [...LEAD_GONE_STATES])
    return eq(lead.state, state)
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

  /** Every filter but `state` — the half `stateFacets` shares with `book()`. */
  private filtersOf(q: LeadFacetsQuery): (SQL | undefined)[] {
    return [
      q.tier ? eq(lead.tier, q.tier) : undefined,
      q.category ? eq(lead.category, q.category) : undefined,
      /* Lead PIC. `OWNER_NONE` is the wire's word for "nobody has taken it" —
         the screen's own sentinel carries a NUL byte and must not travel, see
         the constant's docblock — so it asks the column for NULL rather than
         for an actor whose id is that word. ANDed with the rest like every
         other filter, and independent of the scope axis: for an `ownOnly`
         reader scope has already narrowed the book to them, which makes this a
         no-op, while for a head of sales it is the whole question. */
      q.owner
        ? q.owner === OWNER_NONE
          ? isNull(lead.ownerId)
          : eq(lead.ownerId, q.owner)
        : undefined,
      q.campaign ? eq(lead.campaignId, q.campaign) : undefined,
      /* `sourceKind` là nửa "không chiến dịch" của ô lọc Nguồn — đọc docblock
         `LeadFacets` (`@pv/contracts`) trước khi sửa. `isNull(campaignId)` bắt
         buộc đi kèm: một lead CÓ chiến dịch vẫn có thể mang một `sourceKind`
         cũ trong cột, nhưng cột Nguồn không bao giờ IN nó ra (`SourceMark` ưu
         tiên tên chiến dịch) — thiếu điều kiện này thì chọn "Web landing" sẽ
         kéo về cả những dòng đang hiện tên chiến dịch, không hiện "Web
         landing" ở đâu cả. */
      q.sourceKind ? and(isNull(lead.campaignId), eq(lead.sourceKind, q.sourceKind)) : undefined,
      /* Ô tìm hứa "tên công ty hoặc mã lead" (placeholder ở `pages/leads.tsx`)
         nên phải hỏi CẢ HAI cột, không riêng company — trước bản sửa này gõ
         `LD-0235` trả về rỗng dù dòng đó tồn tại, đúng nghĩa "search chưa gọi
         đúng API" mà lời hứa trên ô tìm đặt ra. Mẫu dựng bằng `contains()`,
         không ghép chuỗi: `%` và `_` gõ vào ô tìm là CHỮ, không phải ký tự
         đại diện — xem docblock hàm đó. Cùng mẫu với Ops book
         (`opportunity.repository.ts#filtersOf`) nên hai ô tìm không lệch
         nhau. */
      q.q ? or(ilike(lead.company, contains(q.q)), ilike(lead.code, contains(q.q))) : undefined,
    ]
  }

  /** Bốn con số của thẻ điểm, MỘT lượt đi tới database.
   *
   *  Bốn `SELECT count(*)` rời nhau là bốn vòng tới Neon cho một tấm thẻ, và
   *  Neon tính tiền theo lượt hỏi. Bốn truy vấn con vô hướng trong một câu thì
   *  planner chạy mỗi cái đúng một lần và trả về một dòng bốn cột.
   *
   *  `count(DISTINCT lead_code)` ở cột thứ hai là chỗ dễ viết sai nhất cả câu:
   *  một lead họp bốn lần vẫn là MỘT lead đã gặp. Bỏ `DISTINCT` thì tỉ lệ
   *  "first meeting / lead" vượt 100% ngay tuần đầu có người chăm ghi họp, và
   *  nó sai theo hướng trông như một tin tốt.
   *
   *  Đếm THÔ, không lọc `exit_reason`: mẫu số là mọi lead từng vào sổ, đúng như
   *  hằng `FUNNEL` đóng băng mà nó thay thế. Một lead đã rơi vẫn là một lead
   *  từng được đầu tư — bỏ nó ra khỏi mẫu số là tự nâng mọi tỉ lệ. */
  async scorecard(): Promise<{
    leads: number
    firstMeetings: number
    opportunities: number
    contracts: number
  }> {
    const r = (await this.db.execute(sql`
      SELECT
        (SELECT count(*)::int FROM "sales"."lead")                              AS leads,
        (SELECT count(DISTINCT "lead_code")::int FROM "sales"."meeting")        AS first_meetings,
        (SELECT count(*)::int FROM "sales"."opportunity")                       AS opportunities,
        (SELECT count(*)::int FROM "sales"."contract")                          AS contracts
    `)) as {
      rows: {
        leads: number
        first_meetings: number
        opportunities: number
        contracts: number
      }[]
    }

    const row = r.rows[0]
    return {
      leads: row?.leads ?? 0,
      firstMeetings: row?.first_meetings ?? 0,
      opportunities: row?.opportunities ?? 0,
      contracts: row?.contracts ?? 0,
    }
  }

  /** When the lead reached this tier: the latest `verified`/`tier-raised`
   *  touch naming it, or `null` when the ledger has none. */
  async tierSince(code: string, tier: LeadTier | null): Promise<Date | null> {
    if (tier === null) return null
    const [row] = await this.db
      .select({ at: touch.at })
      .from(touch)
      .where(
        and(
          eq(touch.subjectCode, code),
          inArray(touch.kind, ['verified', 'tier-raised']),
          eq(touch.toTier, tier),
        ),
      )
      .orderBy(desc(touch.at))
      .limit(1)
    return row?.at ?? null
  }

  /** The TIER list as configured, ACTIVE ONLY and in `ord` order — the two
   *  conditions `ladderConfigOf` pairs positions under.
   *
   *  The lead's own ladder. The deal side has the identical query for `STAGE`
   *  (`OpportunityRepository.stageRows`) and the two stay apart on purpose:
   *  a module reads its own branch's tables, and sharing the reader would mean
   *  one module reaching through another for a row it can select itself. What
   *  IS shared is the fence that pairs the rows with keys, because that is the
   *  part with a way to go quietly wrong (`../ladder.ts`). */
  tierRows(): Promise<{ name: string; limitDays: number | null }[]> {
    return this.db
      .select({ name: configEntry.name, limitDays: configEntry.limitDays })
      .from(configEntry)
      .where(and(eq(configEntry.list, 'TIER'), eq(configEntry.active, true)))
      .orderBy(asc(configEntry.ord))
  }
}
