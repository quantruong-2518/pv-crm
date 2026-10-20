import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  not,
  notInArray,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { Inject, Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  LEAD_ACTIVE_STATES,
  LEAD_OPEN_STATES,
  LeadState,
  OWNER_NONE,
  type LeadBookQuery,
  type LeadFacetsQuery,
  type LeadLabel,
  type LeadMotion,
  type LeadSourceKind,
  type LeadTier,
  type LeadStateFilter,
} from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import {
  directProbe,
  fuzzyAny,
  fuzzyHit,
  fuzzyRank,
  readsUnderFloor,
  underFloor,
} from '@api/platform/db/fuzzy'
import { actor } from '@api/platform/db/platform.schema'
import { pinnedBy } from '@api/platform/pin/pinned'
import { configEntry } from '../config/config.schema'
import { hold } from '../hold/hold.schema'
import { leadHeld, openHoldsOf } from '../hold/hold.sql'
import { leadOrigin } from '../lead-origin/lead-origin.schema'
import { partner } from '../partner/partner.schema'
import { leadDealHeldBy, leadSigned } from '../open-deal'
import { LEAD_GONE_STATES } from './lead-state'
import { touch } from '../touch/touch.schema'
import { contact } from '../contact/contact.schema'
import { lead, leadLabel } from './lead.schema'
import { labelsOf, leadLabelledAny } from './lead-label.sql'
import { leadLive, leadScope } from './lead-scope'
import type {
  LeadMailEventRead,
  LeadMailTimelineRead,
  LeadProfileRead,
  LeadRead,
} from './lead.mapper'
import { seqCodes } from '../code-seq'

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
const listOf = (csv: string) => csv.split(',').filter(Boolean)
const bdOwner = alias(actor, 'bd_owner')
const creator = alias(actor, 'creator')
const marketingOwner = alias(actor, 'marketing_owner')
/** The other live leads on one mailbox, for `duplicateOf` (ADR 0070). */
const twin = alias(lead, 'twin')

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
 *  profile — see the docblock on `byCode()`. `inScope` is the READ verdict
 *  (`readScopeOf`); `holds` is the edit one — only the holder edits the lead. */
export type LeadProfileFound = LeadProfileRead & { inScope: boolean; holds: boolean }

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

/** `n` numbers from `sales.lead_code_seq`, printed as `LD-%04d`, in ascending order
 *  (the outer ORDER BY: `nextval` evaluation order is not a promise).
 *
 *  The sequence is declared in `lead.schema.ts` (`leadCodeSeq`) so
 *  `drizzle-kit` owns it, but Drizzle has no expression node for `nextval`, so
 *  the name is written out once more here. Two spellings of one name is a
 *  small risk; the alternative is a code format nobody can read.
 *
 *  See the long note on `leadCodeSeq` for the rest. */
const NEXT_CODES = (n: number) => seqCodes('LD-', 'sales.lead_code_seq', n)

/** The box promises company or lead code, so it searches both (filter and rank). */
const SEARCHED = [lead.company, lead.legalName, lead.taxCode, lead.code]

/** Same two arms as `filtersOf`: a lead column, or a contact's name — both
 *  over the leads `fence` keeps (live or disabled view, plus scope). */
const probeOf = (fence: SQL | undefined) => (q: string) =>
  sql`(${directProbe(sql`${lead}`, fence, SEARCHED, q)} OR ${directProbe(
    sql`${contact} JOIN ${lead} ON ${eq(lead.code, contact.leadCode)}`,
    fence,
    [contact.name],
    q,
  )})`

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
    const [code] = await this.nextCodes(1)
    /* An empty result here means the sequence is gone, not that a lead is
       missing. Failing loudly beats returning a code nobody generated. */
    if (!code) throw new Error('sales.lead_code_seq trả về rỗng — migration đã chạy chưa?')
    return code
  }

  /** `n` codes in ONE round trip for a batch import, ascending so the file's
   *  order is the code order. Same pool-not-`tx` and burned-gaps rules as
   *  `nextCode`. */
  async nextCodes(n: number): Promise<string[]> {
    if (n <= 0) return []
    const r = (await this.db.execute(NEXT_CODES(n))) as { rows: { code: string }[] }
    if (r.rows.length !== n) {
      throw new Error(`sales.lead_code_seq issued ${r.rows.length}/${n} codes`)
    }
    return r.rows.map((x) => x.code)
  }

  async book(
    who: Actor,
    q: LeadBookQuery,
    scoped: boolean,
    onlyDisabled = false,
  ): Promise<LeadBookPage> {
    /* `leadLive` is a FILTER, never scope: a disabled lead inside scope would be
       counted as `hidden`. The disabled view spans every state. */
    /* `pinned` here, not in `filtersOf`: the facets share that list and omit it. */
    const pinned = q.pinned ? pinnedBy(who.id, 'lead', lead.code) : undefined
    const filters = onlyDisabled
      ? [...this.filtersOf(q), pinned, isNotNull(lead.disabledAt)]
      : [
          ...this.filtersOf(q),
          pinned,
          this.stateFilter(q.state),
          q.states
            ? and(inArray(lead.state, listOf(q.states) as LeadState[]), not(leadHeld(lead.code)))
            : undefined,
          leadLive,
        ]

    const scope = this.scopeOf(who, scoped)

    const rowsQuery = (db: Db) =>
      db
        .select({
          row: lead,
          ownerName: actor.name,
          ownerEmail: actor.email,
          createdByName: creator.name,
          campaignName: configEntry.name,
          originName: leadOrigin.name,
          partnerName: partner.name,
          daysHere: DAYS_HERE,
          signed: this.signedValue(),
          duplicateOf: this.duplicatesOf(who, scoped),
        })
        .from(lead)
        .leftJoin(actor, eq(actor.id, lead.ownerId))
        .leftJoin(creator, eq(creator.id, lead.createdBy))
        .leftJoin(configEntry, CAMPAIGN_ON)
        .leftJoin(leadOrigin, eq(leadOrigin.id, lead.originId))
        .leftJoin(partner, eq(partner.code, lead.partnerCode))
        .where(and(...filters, scope))
        .orderBy(...this.orderBy(q))
        .limit(q.size)
        .offset((q.page - 1) * q.size)

    /* The second count only runs when scope really cuts (else `hidden` is 0).
       Plain pool reads run side by side; with `q` they share one tx in sequence. */
    const view = onlyDisabled ? isNotNull(lead.disabledAt) : leadLive
    const [scoped_, all, rows] = await readsUnderFloor(this.db, q.q, probeOf(and(view, scope)), [
      (db: Db) => this.count(and(...filters, scope), db),
      (db: Db) => (scope ? this.count(and(...filters), db) : Promise.resolve(null)),
      rowsQuery,
    ] as const)

    const codes = rows.map((r) => r.row.code)
    const [labels, holds] = await Promise.all([
      labelsOf(this.db, codes),
      openHoldsOf(this.db, 'lead', codes),
    ])
    return {
      rows: rows.map((r) => ({
        ...r,
        labels: labels.get(r.row.code) ?? [],
        hold: holds.get(r.row.code) ?? null,
      })),
      total: scoped_,
      hidden: all === null ? 0 : all - scoped_,
    }
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
      .where(and(isNull(lead.campaignId), isNotNull(lead.sourceKind), leadLive, scope))

    return rows.map((r) => r.kind as LeadSourceKind)
  }

  /** The motions and origins present in the caller's scoped book — the
   *  `sourceKindFacets` rule for the two-level origin filters. */
  async originFacets(
    who: Actor,
  ): Promise<{ motions: LeadMotion[]; origins: { id: string; name: string }[] }> {
    const scope = this.scopeOf(who, true)
    const [motions, origins] = await Promise.all([
      this.db
        .selectDistinct({ motion: lead.motion })
        .from(lead)
        .where(and(isNotNull(lead.motion), leadLive, scope)),
      this.db
        .selectDistinct({ id: leadOrigin.id, name: leadOrigin.name })
        .from(lead)
        .innerJoin(leadOrigin, eq(leadOrigin.id, lead.originId))
        .where(and(leadLive, scope))
        .orderBy(asc(leadOrigin.name)),
    ])
    return {
      motions: motions.flatMap((r) => (r.motion ? [r.motion] : [])),
      origins,
    }
  }

  /** How many leads each state tab would show: the book's own filters and
   *  scope, minus `state`. Every state is present, zeros included. A held lead
   *  counts in `held` only — the tab it is listed under (`stateFilter`). */
  async stateFacets(
    who: Actor,
    q: LeadFacetsQuery,
  ): Promise<{ byState: Record<LeadState, number>; held: number }> {
    /* One open hold per subject (`hold_open_subject_uq`), so the LEFT JOIN
       keeps one row per lead and the hold is looked up once, not per FILTER. */
    const fence = and(leadLive, this.scopeOf(who, true))
    const rows = await underFloor(this.db, q.q, probeOf(fence), (db) =>
      db
        .select({
          state: lead.state,
          n: sql<number>`count(*) FILTER (WHERE ${hold.subjectCode} IS NULL)::int`,
          held: sql<number>`count(*) FILTER (WHERE ${hold.subjectCode} IS NOT NULL)::int`,
        })
        .from(lead)
        .leftJoin(
          hold,
          and(eq(hold.subjectType, 'lead'), eq(hold.subjectCode, lead.code), isNull(hold.endedAt)),
        )
        .where(and(...this.filtersOf(q), fence))
        .groupBy(lead.state),
    )
    const byState = Object.fromEntries(LeadState.options.map((s) => [s, 0])) as Record<
      LeadState,
      number
    >
    let heldCount = 0
    for (const r of rows) {
      byState[r.state] = r.n
      heldCount += r.held
    }
    return { byState, held: heldCount }
  }

  /** The waiting labels in use on the scoped book under its other filters,
   *  `label` itself ignored — the rule `sourceKinds` follows. Catalogue order. */
  async labelFacets(who: Actor, q: LeadFacetsQuery): Promise<LeadLabel[]> {
    const fence = and(leadLive, this.scopeOf(who, true))
    return underFloor(this.db, q.q, probeOf(fence), (db) =>
      db
        .selectDistinct({ id: configEntry.id, name: configEntry.name, ord: configEntry.ord })
        .from(leadLabel)
        .innerJoin(lead, eq(lead.code, leadLabel.leadCode))
        .innerJoin(
          configEntry,
          and(eq(configEntry.id, leadLabel.labelId), eq(configEntry.list, leadLabel.list)),
        )
        .where(and(...this.filtersOf({ ...q, label: undefined }), fence))
        .orderBy(asc(configEntry.ord), asc(configEntry.id))
        .then((rows) => rows.map(({ id, name }) => ({ id, name }))),
    )
  }

  /** How many leads the "disabled" view would list — the book's filters and
   *  scope, every state. */
  disabledCount(who: Actor, q: LeadFacetsQuery): Promise<number> {
    const fence = and(isNotNull(lead.disabledAt), this.scopeOf(who, true))
    return underFloor(this.db, q.q, probeOf(fence), (db) =>
      this.count(and(...this.filtersOf(q), fence), db),
    )
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
   *  rows and not ten plus the common pool.
   *
   *  A disabled lead is absent (`null`) unless the caller asks `withDisabled`;
   *  even then `holds` is false, so no edit door built on this read opens. */
  async byCode(who: Actor, code: string, withDisabled = false): Promise<LeadProfileFound | null> {
    const [row] = await this.db
      .select({
        row: lead,
        ownerName: actor.name,
        ownerEmail: actor.email,
        createdByName: creator.name,
        bdOwnerName: bdOwner.name,
        bdOwnerEmail: bdOwner.email,
        marketingOwnerName: marketingOwner.name,
        marketingOwnerEmail: marketingOwner.email,
        campaignName: configEntry.name,
        originName: leadOrigin.name,
        partnerName: partner.name,
        daysHere: DAYS_HERE,
        signed: this.signedValue(),
        duplicateOf: this.duplicatesOf(who, true),
        ...this.accessValues(who),
      })
      .from(lead)
      .leftJoin(actor, eq(actor.id, lead.ownerId))
      .leftJoin(creator, eq(creator.id, lead.createdBy))
      .leftJoin(bdOwner, eq(bdOwner.id, lead.bdOwnerId))
      .leftJoin(marketingOwner, eq(marketingOwner.id, lead.marketingOwnerId))
      .leftJoin(configEntry, CAMPAIGN_ON)
      .leftJoin(leadOrigin, eq(leadOrigin.id, lead.originId))
      .leftJoin(partner, eq(partner.code, lead.partnerCode))
      .where(and(eq(lead.code, code), withDisabled ? undefined : leadLive))
      .limit(1)

    if (!row) return null
    const [labels, holds] = await Promise.all([
      labelsOf(this.db, [code]),
      openHoldsOf(this.db, 'lead', [code]),
    ])
    return { ...row, labels: labels.get(code) ?? [], hold: holds.get(code) ?? null }
  }

  /** The two verdicts of `byCode` and nothing else — what a 404/403 fence
   *  needs, without the profile's joins, twin subquery and label/hold reads.
   *  Same `withDisabled` rule, same `inScope`/`holds` as `byCode` by construction. */
  async accessOf(
    who: Actor,
    code: string,
    withDisabled = false,
  ): Promise<{ inScope: boolean; holds: boolean } | null> {
    const [row] = await this.db
      .select(this.accessValues(who))
      .from(lead)
      .where(and(eq(lead.code, code), withDisabled ? undefined : leadLive))
      .limit(1)
    return row ?? null
  }

  private accessValues(who: Actor) {
    const reads = this.readScopeOf(who)
    return {
      inScope: reads ? sql<boolean>`COALESCE(${reads}, false)` : sql<boolean>`true`,
      holds: sql<boolean>`COALESCE(${and(this.scopeOf(who, true), leadLive)}, false)`,
    }
  }

  /** Trục 3 · phạm vi. MỘT biểu thức, hai chỗ dùng.
   *
   *  By `id`, never by display name — the same axis E2 now compares (ADR 0070):
   *  two people sharing a name neither see each other's book nor open each
   *  other's profile.
   *
   *  Built here rather than spelled out at each call site because the book and
   *  the profile MUST agree: a lead readable in one and refused in the other is
   *  a bug nobody reports, they just stop trusting the screen. `book()` hands
   *  it to `where()`, `byCode()` selects it as a value — same predicate, two
   *  positions.
   *
   *  `undefined` means the axis is not cutting anything, which is what Drizzle
   *  reads as "no condition" inside `and(...)`. */
  private scopeOf(who: Pick<Actor, 'id' | 'ownOnly'>, scoped: boolean): SQL | undefined {
    return leadScope(who, scoped)
  }

  /** The one-lead READ axis: the holder, or someone standing on a live deal of
   *  this lead — they read and mail the customer they are selling to. The book
   *  and every edit stay on `scopeOf`: a deal does not hand over the lead. */
  private readScopeOf(who: Pick<Actor, 'id' | 'ownOnly'>): SQL | undefined {
    const holds = this.scopeOf(who, true)
    return holds ? or(holds, leadDealHeldBy(lead.code, who.id)) : undefined
  }

  /** Codes of the OTHER live leads on this row's mailbox — flagged, not refused,
   *  since ADR 0070 dropped the unique index. A twin outside the reader's scope
   *  comes back `null`: counted, not named. NULL for a disqualified row. */
  private duplicatesOf(who: Pick<Actor, 'id' | 'ownOnly'>, scoped: boolean) {
    /* `${twin}` inside raw `sql` prints "sales"."twin", not the aliased table,
       so the FROM spells `lead AS "twin"` out and the columns follow the alias. */
    const named =
      scoped && who.ownOnly ? sql`COALESCE(${twin.ownerId} = ${who.id}, false)` : sql`true`
    return sql<
      (string | null)[] | null
    >`CASE WHEN ${notInArray(lead.state, [...LEAD_GONE_STATES])} THEN (
      SELECT array_agg(CASE WHEN ${named} THEN ${twin.code} END ORDER BY ${twin.code})
        FROM ${lead} AS "twin"
       WHERE lower(${twin.email}) = lower(${lead.email})
         AND ${twin.code} <> ${lead.code}
         AND ${notInArray(twin.state, [...LEAD_GONE_STATES])}
         AND ${isNull(twin.disabledAt)}
    ) END`
  }

  private async count(where: SQL | undefined, db: Db = this.db): Promise<number> {
    const [r] = await db.select({ n: count() }).from(lead).where(where)
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
             r."subject"                                     AS subject,
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

  /** The book's `state` filter: `active` is the open states minus the waiting
   *  group, `open` is the five `LEAD_OPEN_STATES`, `live`
   *  is everything not gone, `all` is no condition, `held` the leads on hold,
   *  anything else is one state. A held lead leaves `open` and every single
   *  state (ADR 0097 §3), so the tabs never list one lead twice. */
  private stateFilter(state: LeadStateFilter): SQL | undefined {
    const held = leadHeld(lead.code)
    if (state === 'all') return undefined
    if (state === 'live') return notInArray(lead.state, [...LEAD_GONE_STATES])
    if (state === 'held') return held
    if (state === 'active') return and(inArray(lead.state, [...LEAD_ACTIVE_STATES]), not(held))
    if (state === 'open') return and(inArray(lead.state, [...LEAD_OPEN_STATES]), not(held))
    return and(eq(lead.state, state), not(held))
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
    const rank = q.q ? [desc(fuzzyRank(SEARCHED, q.q))] : []
    return [...rank, dir(primary), dir(lead.code)]
  }

  /** A comma list of actor ids on `column`; `OWNER_NONE` among them also
   *  matches the rows where the column is empty. */
  private byActor(
    column: typeof lead.ownerId | typeof lead.createdBy,
    csv: string,
  ): SQL | undefined {
    const ids = listOf(csv)
    const named = ids.filter((id) => id !== OWNER_NONE)
    return ids.includes(OWNER_NONE)
      ? or(isNull(column), named.length ? inArray(column, named) : undefined)
      : inArray(column, named)
  }

  /** Every filter but `state` — the half `stateFacets` shares with `book()`. */
  private filtersOf(q: LeadFacetsQuery & { codes?: string }): (SQL | undefined)[] {
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
      q.owner ? this.byActor(lead.ownerId, q.owner) : undefined,
      q.createdBy ? this.byActor(lead.createdBy, q.createdBy) : undefined,
      q.createdFrom
        ? sql`${lead.createdAt} >= (${q.createdFrom}::date)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'`
        : undefined,
      q.createdTo
        ? sql`${lead.createdAt} < ((${q.createdTo}::date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')`
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
      q.motion ? eq(lead.motion, q.motion) : undefined,
      q.origin ? inArray(lead.originId, listOf(q.origin)) : undefined,
      q.label ? leadLabelledAny(lead.code, listOf(q.label)) : undefined,
      q.codes ? inArray(lead.code, listOf(q.codes)) : undefined,
      /* The box promises contacts too; a contact hit ranks below a lead-column hit. */
      q.q
        ? or(
            fuzzyAny(SEARCHED, q.q),
            sql`EXISTS (SELECT 1 FROM ${contact} WHERE ${contact.leadCode} = ${lead.code} AND ${fuzzyHit(contact.name, q.q)})`,
          )
        : undefined,
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
      WITH live AS (SELECT "code" FROM "sales"."lead" WHERE "disabled_at" IS NULL)
      SELECT
        (SELECT count(*)::int FROM live)                                         AS leads,
        (SELECT count(DISTINCT m."subject_code")::int FROM "sales"."meeting" m
           JOIN live ON live."code" = m."subject_code"
          WHERE m."subject_code" LIKE 'LD-%' AND m."cancelled_at" IS NULL)     AS first_meetings,
        (SELECT count(*)::int FROM "sales"."opportunity" o
           JOIN live ON live."code" = o."lead_code")                            AS opportunities,
        (SELECT count(*)::int FROM "sales"."contract" c
           JOIN live ON live."code" = c."lead_code")                            AS contracts
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

  /** Our own bound on the payload, not a ratified number: past it the rarest
   *  tags stop being suggested, which is the wrong end to lose if it ever bites. */
  private static readonly INDUSTRY_TAGS_SHOWN = 200

  /** Industry tags typed on leads, case-folded, most used first then A-Z.
   *
   *  Folding on `lower()` keeps the commonest spelling so the typeahead pushes
   *  one industry toward one spelling; the cap bounds the payload. Ties break
   *  in codepoint order so PGlite and Neon cut the cap at the same tag. */
  async industryTags(): Promise<string[]> {
    const r = (await this.db.execute(sql`
      WITH spelled AS (
        SELECT tag, count(*) AS n
        FROM (SELECT unnest("industries") AS tag FROM "sales"."lead"
               WHERE "disabled_at" IS NULL) t
        GROUP BY tag
      ),
      folded AS (
        SELECT sum(n) AS total, (array_agg(tag ORDER BY n DESC, tag))[1] AS tag
        FROM spelled
        GROUP BY lower(tag)
      )
      SELECT tag FROM folded ORDER BY total DESC, lower(tag) COLLATE "C", tag COLLATE "C"
      LIMIT ${LeadRepository.INDUSTRY_TAGS_SHOWN}
    `)) as { rows: { tag: string }[] }
    return r.rows.map((row) => row.tag)
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
