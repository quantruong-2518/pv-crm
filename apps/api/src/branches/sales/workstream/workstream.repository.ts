import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  sql,
  type AnyColumn,
  type SQL,
} from 'drizzle-orm'
import { dealHeld, leadHeld } from '../hold/hold.sql'
import { alias } from 'drizzle-orm/pg-core'
import { Inject, Injectable } from '@nestjs/common'
import { WORKSTREAM_PRIORITY_LADDER, type Actor, type WorkstreamPriorityRung } from '@pv/engines'
import {
  OWNER_NONE,
  SELLER_ROLES,
  WorkstreamChannel,
  type WorkstreamBookQuery,
  type WorkstreamCloseReason,
  type WorkstreamFootprint,
  type WorkstreamPeriodFigures,
  type WorkstreamStandKind,
} from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { createdWithin, csvOf } from '@api/platform/db/book-filter'
import { directProbe, fuzzyAny, fuzzyRank, readsUnderFloor } from '@api/platform/db/fuzzy'
import { actor } from '@api/platform/db/platform.schema'
import { account } from '../account/account.schema'
import { configEntry } from '../config/config.schema'
import { contract } from '../contract/contract.schema'
import { contractReadBy, contractTerminated, dealStoodBy, journeyInGrowth } from '../open-deal'
import { CAMPAIGN_ON } from '../lead/lead.repository'
import { leadLive } from '../lead/lead-scope'
import { lead, type LeadRowDb } from '../lead/lead.schema'
import {
  opportunity,
  opportunityOwner,
  type OpportunityRowDb,
} from '../opportunity/opportunity.schema'
import type { OwnerRow, RefOwner } from '../opportunity/opportunity.mapper'
import { workstream, type WorkstreamRowDb } from './workstream.schema'
import { syncClosed } from './workstream-sync'
import { seqCodes } from '../code-seq'

/** The only SQL of the workstream module. It decides nothing about permission
 *  — it only ENFORCES the axis the endpoint declared with `@Need`.
 *
 *  Two properties worth knowing before editing, each argued where it is used:
 *  the communication footprint is gathered from three ledgers in ONE statement
 *  for the whole page (`FOOTPRINT`), and every follow-up read takes the page's
 *  codes at once. A book over four ledgers asked row by row is `4n` round
 *  trips to Neon, which is what makes this screen affordable or not. */
type RunKey = {
  accountCode: AnyColumn | string
  openedAt: AnyColumn | Date
  code: AnyColumn | string
}

/** `other` is a run of `run`'s account opened before it in `(opened_at, code)`
 *  order — the order `ordinalOf` numbers runs in; `orSelf` counts `run` itself.
 *  The ONE copy: the deal row's ordinal and its "won before" both call it. */
export const runBefore = (
  other: { accountCode: AnyColumn; openedAt: AnyColumn; code: AnyColumn },
  run: RunKey,
  orSelf: boolean,
): SQL | undefined =>
  and(
    eq(other.accountCode, run.accountCode),
    or(
      lt(other.openedAt, run.openedAt),
      and(eq(other.openedAt, run.openedAt), (orSelf ? lte : lt)(other.code, run.code)),
    ),
  )

@Injectable()
export class WorkstreamRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Reserve the next code. Outside any transaction, for the reason
   *  `OpportunityRepository.nextCode` writes out: `nextval` deliberately does
   *  not listen to transactions, and one request holding two connections is
   *  how a pool deadlocks itself. `seed.ts` mints with the same formula. */
  async nextCode(): Promise<string> {
    const [code] = await this.nextCodes(1)
    if (!code)
      throw new Error('sales.workstream_code_seq returned nothing — has the migration run?')
    return code
  }

  /** `n` codes in ONE round trip, for the lead write doors that open one run per
   *  lead. Outside any transaction for `nextCode`'s reason; a rolled-back batch
   *  burns its numbers, and a gap in `WS-` is harmless. */
  async nextCodes(n: number): Promise<string[]> {
    if (n <= 0) return []
    const r = (await this.db.execute(NEXT_CODES(n))) as { rows: { code: string }[] }
    if (r.rows.length !== n) {
      throw new Error(`sales.workstream_code_seq issued ${r.rows.length}/${n} codes`)
    }
    return r.rows.map((x) => x.code)
  }

  /** Open runs inside the caller's transaction, so a run never outlives the lead
   *  row that anchors it. One statement: `MAX_IMPORT_ROWS` × 3 columns stays far
   *  under Postgres's 65,535 bind-parameter ceiling. */
  async insertOpened(
    tx: Db,
    rows: readonly { code: string; accountCode: string | null; openedAt: Date }[],
  ): Promise<void> {
    if (rows.length === 0) return
    await tx.insert(workstream).values(
      rows.map((r) => ({
        code: r.code,
        accountCode: r.accountCode,
        openedAt: r.openedAt,
        closedAt: null,
        closeReason: null,
      })),
    )
  }

  /** Re-derive how these runs stand from their lead, inside the caller's
   *  transaction, so a run's end is written with the row that caused it.
   *
   *  WON when the lead is signed (`leadSigned`, the lead book's rule) at its
   *  latest live signature; else LOST when no deal is open and nothing live is
   *  signed on a PARKED lead or one with a terminated contract (ADR 0107), or a
   *  lead with no deal is `nurturing`; else OPEN — which
   *  also REOPENS a closed run. The statement is `./workstream-sync.ts`. The date is floored at `opened_at` for
   *  `workstream_closed_after_opened`; `CHURNED` is never derived. Only rows
   *  whose pair actually changes are written.
   *
   *  Called by every door that can move the answer: deal create, import, a
   *  state change, sign, contract termination; a lead park or claim. No door
   *  deletes a contract today — the day one does, it calls this too. */
  syncClosed(tx: Db, workstreamCodes: readonly string[]): Promise<void> {
    return syncClosed(tx, workstreamCodes)
  }

  async book(who: Actor, q: WorkstreamBookQuery, scoped: boolean): Promise<WorkstreamBookPage> {
    const scope = this.scopeOf(who, scoped)
    const stand = this.standPair(who, scoped)
    const filters = this.filtersOf(q, stand)

    /* Count a SECOND time only while the scope axis cuts (else `hidden` is 0),
       and never under `owner`: `hidden` there would tell an ownOnly reader how
       many runs a colleague holds. The page reads the same filters. */
    const probe = probeOf(and(leadLive, scope))
    const [scopedTotal, all, rows] = await readsUnderFloor(this.db, q.q, probe, [
      (db: Db) => this.count(and(...filters, scope), db),
      (db: Db) => (scope && !q.owner ? this.count(and(...filters), db) : Promise.resolve(null)),
      (db: Db) => this.page(and(...filters, scope), q, stand, this.inScopeValue(who, scoped), db),
    ] as const)

    return { rows, total: scopedTotal, hidden: all === null ? 0 : all - scopedTotal }
  }

  /** One run by code, carrying the scope axis's verdict ON ITSELF.
   *
   *  `inScope` is SELECTED rather than filtered on, the shape `LeadRepository
   *  .byCode` and `OpportunityRepository.byCode` both hold: a query that has
   *  already filtered by scope can only answer "no such row", and the service
   *  needs the two answers apart before it picks a status code. */
  async byCode(who: Actor, code: string): Promise<(WorkstreamRead & { inScope: boolean }) | null> {
    const [found] = await this.db
      .select({ ...READ_COLUMNS, inScope: this.inScopeValue(who) })
      .from(workstream)
      .innerJoin(lead, ANCHOR_ON)
      .leftJoin(account, eq(account.code, workstream.accountCode))
      .leftJoin(SALE_ACTOR, eq(SALE_ACTOR.id, lead.ownerId))
      .leftJoin(BD_ACTOR, eq(BD_ACTOR.id, lead.bdOwnerId))
      .leftJoin(configEntry, CAMPAIGN_ON)
      .where(and(eq(workstream.code, code), leadLive))
      .limit(1)

    return found ? { ...toRead(found), inScope: found.inScope } : null
  }

  /** Which run of its company this is, counting from 1 in `(opened_at, code)`
   *  order. A run with no company yet is its own first. */
  async ordinalOf(run: WorkstreamRowDb): Promise<number> {
    if (run.accountCode === null) return 1
    const [r] = await this.db
      .select({ n: count() })
      .from(workstream)
      .where(
        runBefore(
          workstream,
          { accountCode: run.accountCode, openedAt: run.openedAt, code: run.code },
          true,
        ),
      )
    return r?.n ?? 1
  }

  /** Every deal of a page of runs, in ONE statement.
   *
   *  Ordered by code DESCENDING, which is "newest deal first" without joining a
   *  date column: the code sequence advances with time. The holder rule reads
   *  the first entry, so the order is load-bearing rather than cosmetic. */
  async dealsOf(codes: readonly string[]): Promise<Map<string, OpportunityRowDb[]>> {
    if (codes.length === 0) return new Map()

    const rows = await this.db
      .select()
      .from(opportunity)
      .where(inArray(opportunity.workstreamCode, [...codes]))
      .orderBy(desc(opportunity.code))

    const byWorkstream = new Map<string, OpportunityRowDb[]>()
    for (const row of rows) {
      if (row.workstreamCode === null) continue
      const list = byWorkstream.get(row.workstreamCode)
      if (list) list.push(row)
      else byWorkstream.set(row.workstreamCode, [row])
    }
    return byWorkstream
  }

  /** Who stands on a batch of deals. Same shape, same table and same stable
   *  ordering as `OpportunityRepository.ownersOf` — one question, one answer.
   *  The roles ride along: `holderOf` picks the holder by it. */
  async dealOwnersOf(codes: readonly string[]): Promise<Map<string, OwnerRow[]>> {
    if (codes.length === 0) return new Map()

    const rows = await this.db
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
      .where(inArray(opportunityOwner.opportunityCode, [...codes]))
      .orderBy(opportunityOwner.role, desc(opportunityOwner.isPrimary), actor.name)

    const byDeal = new Map<string, OwnerRow[]>()
    for (const r of rows) {
      const owner = { id: r.id, name: r.name, role: r.role, primary: r.primary, roleIds: r.roleIds }
      const list = byDeal.get(r.code)
      if (list) list.push(owner)
      else byDeal.set(r.code, [owner])
    }
    return byDeal
  }

  /** Who accepted each deal (ADR 0071) — the holder's fallback after a seller. */
  async dealAcceptorsOf(codes: readonly string[]): Promise<Map<string, RefOwner>> {
    if (codes.length === 0) return new Map()
    const rows = await this.db
      .select({ code: opportunity.code, id: actor.id, name: actor.name })
      .from(opportunity)
      .innerJoin(actor, eq(actor.id, opportunity.acceptedById))
      .where(inArray(opportunity.code, [...codes]))
    return new Map(rows.map((r) => [r.code, { id: r.id, name: r.name }]))
  }

  /** Every signature of a page of runs, NEWEST first per run, each with the
   *  deal it signed: `stand` prints the first one the reader may open, and that
   *  code has to be the same on two reads. The closer and the termination ride
   *  along for the row's `inCharge` (ADR 0110 §4). */
  async contractsOf(codes: readonly string[]): Promise<Map<string, RunContract[]>> {
    if (codes.length === 0) return new Map()

    const rows = await this.db
      .select({
        ws: contract.workstreamCode,
        code: contract.code,
        deal: contract.opportunityCode,
        ownerId: contract.ownerId,
        collectorId: contract.collectorId,
        ownerName: actor.name,
        terminated: sql<boolean>`${contractTerminated(contract.code)}`,
      })
      .from(contract)
      .leftJoin(actor, eq(actor.id, contract.ownerId))
      .where(inArray(contract.workstreamCode, [...codes]))
      .orderBy(desc(contract.signedAt), desc(contract.code))

    const byWorkstream = new Map<string, RunContract[]>()
    for (const { ws, ...signed } of rows) {
      if (ws !== null) byWorkstream.set(ws, [...(byWorkstream.get(ws) ?? []), signed])
    }
    return byWorkstream
  }

  /** The communication footprint of a WHOLE PAGE, in exactly one statement.
   *
   *  One statement rather than one per row, and that is what makes the screen
   *  affordable: three ledgers times fifty rows is a hundred and fifty round
   *  trips. All the gathering happens in SQL; Node only rebuilds the record of
   *  seven counters. The shape of the three ledgers — and of the fourth one
   *  left out — is argued at `FOOTPRINT` below. */
  async footprintOf(codes: readonly string[]): Promise<Map<string, WorkstreamFootprint>> {
    const footprints = new Map<string, WorkstreamFootprint>()
    if (codes.length === 0) return footprints

    const r = (await this.db.execute(FOOTPRINT(codes))) as {
      rows: { ws: string; channel: string; n: number; last_at: string | Date | null }[]
    }

    for (const row of r.rows) {
      const channel = WorkstreamChannel.safeParse(row.channel)
      /* A channel outside the seven is DROPPED, never re-bucketed: a miss means
         the two vocabularies have drifted, and folding it into a neighbour
         would hide exactly the drift worth seeing. */
      if (!channel.success) continue

      const found = footprints.get(row.ws) ?? blankFootprint()
      found.byChannel[channel.data] = Number(row.n)
      const at = row.last_at === null ? null : new Date(row.last_at).toISOString()
      if (at !== null && (found.lastContactedAt === null || at > found.lastContactedAt)) {
        found.lastContactedAt = at
      }
      footprints.set(row.ws, found)
    }
    return footprints
  }

  /** Both ladders of the branch in ONE statement, split in Node.
   *
   *  `config_entry` carries no phase key, so the pairing is by ordinal position
   *  and only `../ladder.ts` may make it. The one job here is to read under the
   *  conditions that function assumes: active rows only, in `ord` order. */
  async ladderRows(): Promise<{ stage: LadderRow[]; tier: LadderRow[] }> {
    const rows = await this.db
      .select({ list: configEntry.list, name: configEntry.name, limitDays: configEntry.limitDays })
      .from(configEntry)
      .where(and(inArray(configEntry.list, ['STAGE', 'TIER']), eq(configEntry.active, true)))
      .orderBy(asc(configEntry.ord))

    const of = (list: string): LadderRow[] =>
      rows.filter((r) => r.list === list).map(({ name, limitDays }) => ({ name, limitDays }))

    return { stage: of('STAGE'), tier: of('TIER') }
  }

  private page(
    where: SQL | undefined,
    q: WorkstreamBookQuery,
    stand: StandPair,
    inScope: SQL<boolean>,
    db: Db = this.db,
  ): Promise<WorkstreamPageRow[]> {
    return db
      .select({ ...READ_COLUMNS, inScope, inChargeIds: inChargeIds(stand) })
      .from(workstream)
      .innerJoin(lead, ANCHOR_ON)
      .leftJoin(account, eq(account.code, workstream.accountCode))
      .leftJoin(SALE_ACTOR, eq(SALE_ACTOR.id, lead.ownerId))
      .leftJoin(BD_ACTOR, eq(BD_ACTOR.id, lead.bdOwnerId))
      .leftJoin(configEntry, CAMPAIGN_ON)
      .where(where)
      .orderBy(...this.orderBy(q, stand))
      .limit(q.size)
      .offset((q.page - 1) * q.size)
      .then((rows) =>
        rows.map((r) => ({ ...toRead(r), inScope: r.inScope, inChargeIds: r.inChargeIds })),
      )
  }

  /** Counts under the same joins `page()` uses, so both numbers describe the
   *  same set. `account` is joined without a column selected because the search
   *  box reads `account.name`; without it Postgres refuses the statement. */
  private async count(where: SQL | undefined, db: Db = this.db): Promise<number> {
    const [r] = await db
      .select({ n: count() })
      .from(workstream)
      .innerJoin(lead, ANCHOR_ON)
      .leftJoin(account, eq(account.code, workstream.accountCode))
      .where(where)
    return r?.n ?? 0
  }

  /** "My run" (ADR 0110 §3): I hold the lead that opened it, OR I stand on
   *  any of its deals (`dealStoodBy`), OR I closed or collect any of its
   *  contracts.
   *
   *  The lead arm stays first and alone covers a run with no deal yet — most
   *  of the funnel. The other two key on `workstream_code`, the column
   *  `dealsOf` and `contractsOf` read, so the fence and the rows agree. */
  private scopeOf(who: Actor, scoped: boolean): SQL | undefined {
    return scoped && who.ownOnly ? runReachedBy(who.id) : undefined
  }

  /** The same predicate, SELECTED instead of filtered on — see `byCode`. */
  private inScopeValue(who: Actor, scoped = true): SQL<boolean> {
    const scope = this.scopeOf(who, scoped)
    return (scope ? sql`COALESCE(${scope}, false)` : sql`true`) as SQL<boolean>
  }

  /** WHERE the run stands, AS THIS READER MAY SEE IT — one expression, used by
   *  the book's filter and by the board's `GROUP BY` so the two cannot drift.
   *
   *  A reader who sees the whole book compares the bare columns and the partial
   *  index answers. An `ownOnly` reader must not find a card at the rung of an
   *  object they cannot open — a deal OR a signature, since the service cuts
   *  both on the same axis — so that card falls back to the lead's own rung,
   *  the column 0056 materialized for exactly this, never a third fold.
   *
   *  The deadline rides the same fence: a folded row must not keep the deadline
   *  of the deal it no longer shows, or card, filter and sort would count a
   *  colleague's late deal under a lead pill. Three expressions mean three
   *  hashed SubPlans; one record-returning `CASE` would cost the board its
   *  `GROUP BY`. Correctness over a hash build. */
  private standPair(who: Actor, scoped: boolean): StandPair {
    if (!scoped || !who.ownOnly) {
      return {
        kind: sql<WorkstreamStandKind>`${workstream.standKind}`,
        key: sql<string>`${workstream.standKey}`,
        due: sql`${workstream.standDueAt}`,
      }
    }

    /* `= 'LD'` rather than `<> 'OP'`: a lead is the one kind that has no deal
       behind it, so it is the one kind nobody needs to prove they may open. */
    const keep = sql`(${workstream.standKind} = 'LD' OR ${this.opensStand(who)})`
    return {
      kind: sql<WorkstreamStandKind>`CASE WHEN ${keep} THEN ${workstream.standKind} ELSE 'LD' END`,
      key: sql<string>`CASE WHEN ${keep} THEN ${workstream.standKey} ELSE ${workstream.standLeadKey} END`,
      due: sql`CASE WHEN ${keep} THEN ${workstream.standDueAt} END`,
    }
  }

  /** "May this reader open the object the run stands on": a deal by the deal
   *  book's own predicate (`dealStoodBy`); at the signature rung, ANY contract
   *  of the run the contract door opens (`contractReadBy`, ADR 0110 §2), since
   *  the newest may be a colleague's. The mapper's `opensStand` is the twin. */
  private opensStand(who: Actor): SQL {
    const paper = contractReadBy(
      {
        ownerId: sql`ws_s.owner_id`,
        collectorId: sql`ws_s.collector_id`,
        leadOwnerId: lead.ownerId,
        opportunityCode: sql`ws_s.opportunity_code`,
      },
      who.id,
    )
    return sql`(CASE WHEN ${workstream.standKind} = 'HĐ'
      THEN EXISTS (SELECT 1 FROM sales.contract ws_s WHERE ws_s.workstream_code = ${workstream.code} AND ${paper})
      ELSE ${dealStoodBy(STAND_DEAL, who.id)} END)`
  }

  /** THE USER's filters. The scope axis stands outside them — see `book()`.
   *  `leadLive` rides here, not in scope: a run whose lead is switched off is
   *  absent from every count, `hidden` included. */
  private filtersOf(q: BookFilters, stand: StandPair): (SQL | undefined)[] {
    return [
      leadLive,
      q.status === 'open'
        ? isNull(workstream.closedAt)
        : q.status === 'closed'
          ? isNotNull(workstream.closedAt)
          : undefined,
      q.accountCode ? eq(workstream.accountCode, q.accountCode) : undefined,
      q.owner ? inChargeAny(stand, q.owner) : undefined,
      /* One box, three columns: a run code pasted out of a chat, half the legal
         name, or the customer as the seller says it. */
      q.q ? fuzzyAny(SEARCHED, q.q) : undefined,
      q.closeReason ? eq(workstream.closeReason, q.closeReason) : undefined,
      /* Half a pair still narrows: the two are independent in the contract, so
         each answers on its own. ANY listed kind; one is the board's column. */
      q.standKind ? sql`${stand.kind} = ANY(${textArray(csvOf(q.standKind))})` : undefined,
      q.standKey ? sql`${stand.key} = ${q.standKey}` : undefined,
      /* `false` does not filter: "not overdue" is not a card, and the contract
         only promises the set the overdue card counts. */
      q.overdue === true ? overdueOpen(stand.due) : undefined,
      /* Same unset-means-no-filter rule as `overdue`; the set is the card's. */
      q.stopped === true ? inArray(workstream.closeReason, STOPPED_REASONS) : undefined,
      /* Open at ANY moment of the span: opened by its end, not closed before
         its start. Each half rides the shared Vietnam-day fence. */
      ...createdWithin(workstream.openedAt, undefined, q.liveTo),
      q.liveFrom
        ? or(isNull(workstream.closedAt), ...createdWithin(workstream.closedAt, q.liveFrom))
        : undefined,
      ...createdWithin(workstream.closedAt, q.closedFrom, q.closedTo),
      ...createdWithin(workstream.openedAt, q.openedFrom, q.openedTo),
    ]
  }

  /** Primary column by `sort`, then ALWAYS `code`.
   *
   *  The tie-break is not decoration: without a stable second key Postgres is
   *  free to return two different orders for two reads of the same page, and a
   *  row then appears on page 1 and page 2 — or on neither.
   *
   *  `priority` carries its own directions (the ladder's) and ignores `dir`:
   *  the engine declares which way each rung reads, and a URL must not be able
   *  to invert half a ladder. `lastContactedAt` never reaches here: the door
   *  refuses a key the book cannot sort on rather than answer in some other
   *  order — see the book door, and `rungSql` for which rungs are missing. */
  private orderBy(q: WorkstreamBookQuery, stand: StandPair): SQL[] {
    /* Best match first, or a typo'd hit could bury the exact one on page 2. */
    const best = q.q ? [sql`${fuzzyRank(SEARCHED, q.q)} desc`] : []
    if (q.sort === 'priority') {
      return [...best, ...priorityOrder(stand), sql`${workstream.code} desc`]
    }

    const dir = q.dir === 'asc' ? 'asc' : 'desc'
    const primary = q.sort === 'customer' ? CUSTOMER : OPENED_AT
    return [...best, sql`${primary} ${sql.raw(dir)}`, sql`${workstream.code} ${sql.raw(dir)}`]
  }

  /** The three cards and the per-rung counts above the book, over the reader's
   *  whole book.
   *
   *  Same `leadLive` and `scopeOf` fence as `book()` and NO user filter, so the
   *  cards equal the book's totals under `status` open / closed. Overdue is
   *  `overdueOpen` on the reader's own deadline, the very fragment the book's
   *  `overdue` filter uses.
   *
   *  `stages` is a second statement because a `GROUP BY` cannot share the
   *  single-row pass; it rides the same fence and the reader's `standPair`, so
   *  a count opens exactly the rows the `standKind`/`standKey` filter returns. */
  async scorecard(
    who: Actor,
    scoped: boolean,
    spans: readonly DayRange[] = [],
  ): Promise<WorkstreamScorecardTotals> {
    const closedWith = (...reasons: WorkstreamCloseReason[]) =>
      sql<number>`count(*) FILTER (WHERE ${inArray(workstream.closeReason, reasons)})::int`

    const fence = and(leadLive, this.scopeOf(who, scoped))
    const stand = this.standPair(who, scoped)
    /* Each period figure is the book's own filter (`filtersOf`) as a FILTER on
       this one pass: the same rows `count()` would total, no round trip each. */
    const figure = (q: BookFilters) =>
      sql<number>`count(*) FILTER (WHERE ${and(...this.filtersOf(q, stand))})::int`
    const periods = Object.fromEntries(
      spans.flatMap((span, i) =>
        PERIOD_FIGURES.map((key) => [`${key}${i}`, figure(periodQuery(key, span))]),
      ),
    )
    const [[r], stages] = await Promise.all([
      this.db
        .select({
          overdue: sql<number>`count(*) FILTER (WHERE ${overdueOpen(stand.due)})::int`,
          won: closedWith('WON'),
          stopped: closedWith(...STOPPED_REASONS),
          ...periods,
        })
        .from(workstream)
        .innerJoin(lead, ANCHOR_ON)
        .where(fence),
      this.standTotals(and(fence, isNull(workstream.closedAt)), stand),
    ])
    const read = r as Record<string, number> | undefined
    return {
      overdue: r?.overdue ?? 0,
      won: r?.won ?? 0,
      stopped: r?.stopped ?? 0,
      stages,
      periods: spans.map(
        (_, i) =>
          Object.fromEntries(
            PERIOD_FIGURES.map((key) => [key, read?.[`${key}${i}`] ?? 0]),
          ) as WorkstreamPeriodFigures,
      ),
    }
  }

  /** The board's three counts, under the book door's joins, filters and scope —
   *  so a column header and the column's own first page report one number.
   *
   *  TWO of them are counted under `status: 'closed'` whatever the view is on,
   *  and for one reason: signing a run CLOSES it with `WON`, so the signature
   *  rung and every close reason live on the closed side of the book. Asked
   *  under `open` they would read zero for ever. The column says which status
   *  it was counted under, so the screen asks the book door the same way. */
  async boardTotals(
    who: Actor,
    q: WorkstreamFilters,
    scoped: boolean,
  ): Promise<WorkstreamBoardTotals> {
    const scope = this.scopeOf(who, scoped)
    const stand = this.standPair(who, scoped)
    const closed = and(...this.filtersOf({ ...q, status: 'closed' }, stand), scope)
    const liveWhere = and(...this.filtersOf(q, stand), scope)
    const probe = probeOf(and(leadLive, scope))
    const [live, signed, dropped] = await readsUnderFloor(this.db, q.q, probe, [
      (db: Db) => this.standTotals(liveWhere, stand, db),
      (db: Db) => this.standTotals(closed, stand, db),
      (db: Db) => this.reasonTotals(closed, db),
    ] as const)
    return { stand: live, signed, closeReason: dropped }
  }

  /** Grouped BY ORDINAL, never by repeating the two expressions: a scoped
   *  reader's pair carries an `EXISTS`, and Postgres matches no subquery node
   *  to another — the same text in `GROUP BY` comes back as ungrouped. */
  private standTotals(
    where: SQL | undefined,
    stand: StandPair,
    db: Db = this.db,
  ): Promise<StandTotal[]> {
    return db
      .select({ kind: stand.kind, key: stand.key, n: count() })
      .from(workstream)
      .innerJoin(lead, ANCHOR_ON)
      .leftJoin(account, eq(account.code, workstream.accountCode))
      .where(where)
      .groupBy(sql`1`, sql`2`)
  }

  private reasonTotals(where: SQL | undefined, db: Db = this.db): Promise<CloseReasonTotal[]> {
    return db
      .select({ closeReason: workstream.closeReason, n: count() })
      .from(workstream)
      .innerJoin(lead, ANCHOR_ON)
      .leftJoin(account, eq(account.code, workstream.accountCode))
      .where(and(where, isNotNull(workstream.closeReason)))
      .groupBy(workstream.closeReason)
      .then((rows) =>
        rows.map((r) => ({ closeReason: r.closeReason as WorkstreamCloseReason, n: r.n })),
      )
  }
}

/** One book row with everything READ FROM TABLES loaded. The rest — where the
 *  run stands, its position on a ladder, its footprint — is assembled by the
 *  service, because each of those needs an engine or a second statement. */
export type WorkstreamRead = {
  row: WorkstreamRowDb
  /** The lead that OPENED the run — see `ANCHOR_ON`. */
  lead: LeadRowDb
  accountName: string | null
  saleName: string | null
  bdName: string | null
  /** The campaign the anchor lead is attributed to, by NAME — the lead lane
   *  prints it and a `SR-09` on screen is an id nobody can read. */
  campaignName: string | null
  /** The run stands on a held lead or deal (`STAND_HELD`): never overdue. */
  held: boolean
  /** Every live contract is collected (ADR 0121 §1): derived here, not stored,
   *  so an undone payment needs no clean-up of `stand_key`. */
  growth: boolean
}

/** A book row plus the scope verdict E2's second grid is built from, and the
 *  ids `inChargeOf` names — `inChargeIds`, the `owner` filter's own expression. */
export type WorkstreamPageRow = WorkstreamRead & { inScope: boolean; inChargeIds: string[] }

/** One signature of a run, as the book row reads it. */
export type RunContract = {
  code: string
  deal: string
  ownerId: string | null
  collectorId: string
  ownerName: string | null
  terminated: boolean
}

/** What BOTH doors narrow by — the book's query minus paging and sorting, which
 *  change which rows come back and never how many match. Borrowed from the
 *  contract rather than declared a second time. */
export type WorkstreamFilters = Pick<
  WorkstreamBookQuery,
  'status' | 'accountCode' | 'owner' | 'q' | 'standKind' | 'standKey' | 'closeReason'
>

/** Every filter `filtersOf` reads: the board's plus the book's own cards. */
type BookFilters = WorkstreamFilters &
  Pick<
    WorkstreamBookQuery,
    | 'overdue'
    | 'stopped'
    | 'liveFrom'
    | 'liveTo'
    | 'closedFrom'
    | 'closedTo'
    | 'openedFrom'
    | 'openedTo'
  >

/** The rung as THIS reader sees it — see `standPair`. */
type StandPair = { kind: SQL<WorkstreamStandKind>; key: SQL<string>; due: SQL }

/** What the repository counts for the cards; the service names the rungs.
 *  `periods` follows the order of the spans asked for. */
export type WorkstreamScorecardTotals = {
  overdue: number
  won: number
  stopped: number
  stages: StandTotal[]
  periods: WorkstreamPeriodFigures[]
}

/** Vietnam days, both ends inclusive. */
export type DayRange = { first: string; last: string }

const PERIOD_FIGURES = ['live', 'opened', 'won', 'stopped', 'closed'] as const

/** The book filter each period card opens (`WorkstreamPeriodFigures`). */
function periodQuery(key: (typeof PERIOD_FIGURES)[number], span: DayRange): BookFilters {
  const closed = { closedFrom: span.first, closedTo: span.last }
  switch (key) {
    case 'live':
      return { status: 'all', liveFrom: span.first, liveTo: span.last }
    case 'opened':
      return { status: 'all', openedFrom: span.first, openedTo: span.last }
    case 'won':
      return { status: 'closed', closeReason: 'WON', ...closed }
    case 'stopped':
      return { status: 'closed', stopped: true, ...closed }
    case 'closed':
      return { status: 'closed', ...closed }
  }
}

export type StandTotal = { kind: WorkstreamStandKind; key: string; n: number }
export type CloseReasonTotal = { closeReason: WorkstreamCloseReason; n: number }

/** One `GROUP BY` per question the board asks, each counted over the WHOLE
 *  book — never over a page, which is what the screen already holds.
 *
 *  `stand` is counted under the view's own status and `signed` under `closed`;
 *  the catalogue reads the signature rung out of the second one — see
 *  `boardTotals` for why that rung has no other side. */
export type WorkstreamBoardTotals = {
  stand: StandTotal[]
  signed: StandTotal[]
  closeReason: CloseReasonTotal[]
}

export type WorkstreamBookPage = {
  rows: WorkstreamPageRow[]
  total: number
  /** Rows the scope axis cut away — law 7, and the server has to count them
   *  because the screen cannot count what it never received. */
  hidden: number
}

export type LadderRow = { name: string; limitDays: number | null }

/** `n` numbers off `sales.workstream_code_seq`, printed as `WS-%04d`.
 *
 *  The sequence is declared in `workstream.schema.ts` so `drizzle-kit` owns it;
 *  Drizzle has no expression node for `nextval`, so the name is written out
 *  once here; `seqCodes` pads like migration 0045's backfill, without truncating. */
const NEXT_CODES = (n: number): SQL => seqCodes('WS-', 'sales.workstream_code_seq', n)

/** The three columns the book's search box reads, probed inside the book's fence. */
const SEARCHED = [workstream.code, lead.company, account.name]
const probeOf = (fence: SQL | undefined) => (q: string) =>
  directProbe(
    sql`${workstream} JOIN ${lead} ON ${ANCHOR_ON} LEFT JOIN ${account} ON ${eq(account.code, workstream.accountCode)}`,
    fence,
    SEARCHED,
    q,
  )

const SALE_ACTOR = alias(actor, 'sale_actor')
const BD_ACTOR = alias(actor, 'bd_actor')

/** ONE run, ONE lead — the invariant migration 0045 established and every
 *  write door that opens a run (lead create, lead import) keeps by minting one
 *  run per lead.
 *
 *  That invariant is why this is an `innerJoin` and not a `LATERAL … LIMIT 1`:
 *  a plain join reads, and the lead is also the only row the scope axis can cut
 *  on (`lead.owner_id`). A door that lets two leads share a run would print
 *  that run twice — so it keeps the invariant or turns this into a lateral. */
const ANCHOR_ON = eq(lead.workstreamCode, workstream.code)

/** `scopeOf`'s three arms, aliased so an outer `opportunity` or `contract`
 *  is never captured — the rule `../open-deal.ts` writes out. */
const runReachedBy = (actorId: string): SQL =>
  sql`(${eq(lead.ownerId, actorId)}
    OR EXISTS (SELECT 1 FROM sales.opportunity ws_o WHERE ws_o.workstream_code = ${workstream.code} AND ${dealStoodBy(sql`ws_o.code`, actorId)})
    OR EXISTS (SELECT 1 FROM sales.contract ws_k WHERE ws_k.workstream_code = ${workstream.code} AND (ws_k.owner_id = ${actorId} OR ws_k.collector_id = ${actorId})))`

/** The customer name on the row: the COMPANY once somebody has said which
 *  company this run belongs to, and the lead's own wording until then.
 *
 *  In that order because `sales.account` is the merged company book while
 *  `lead.company` is a string one person typed on one form — two enquiries from
 *  one factory can spell it two ways. A null `account_code` is the normal path
 *  (see the column's docblock), so the second branch is not a fallback. */
const CUSTOMER = sql<string>`COALESCE(${account.name}, ${lead.company})`

const OPENED_AT = sql`${workstream.openedAt}`

/** The DEAL behind whatever the run stands on: a signature names its own
 *  (`opportunity_code` is NOT NULL and carries a foreign key), a deal names
 *  itself, and a lead names a code no owner row can ever match — which is the
 *  honest answer, since `stand_kind = 'LD'` never asks. */
const STAND_DEAL = sql`COALESCE(
  (SELECT ${contract.opportunityCode} FROM ${contract} WHERE ${contract.code} = ${workstream.standCode}),
  ${workstream.standCode})`

/** What the `stopped` card counts and the book's `stopped` filter opens. */
const STOPPED_REASONS: WorkstreamCloseReason[] = ['LOST', 'CHURNED']

/** The deadline's calendar day: what `overdueBy` counts from, shared by the
 *  priority ladder below and by the overdue card and filter so "late" has one
 *  definition. `due` is the reader's `StandPair.due`, never the bare column.
 *
 *  `AT TIME ZONE 'UTC'` because `daysUntil` truncates in UTC and a bare
 *  `date_trunc` follows the session TimeZone, so the two would split at night. */
const dueDay = (due: SQL): SQL => sql`date_trunc('day', (${due}) AT TIME ZONE 'UTC')`

/** The run stands on a held lead or deal: its clock is stopped (ADR 0097 §3),
 *  so it is never late. A lead stand's code IS the lead's. */
const STAND_HELD = sql<boolean>`(${dealHeld(STAND_DEAL)} OR ${leadHeld(workstream.standCode)})`

/** "Open and past its deadline" — the ONE predicate behind the overdue card and
 *  the book's `overdue` filter, so the card opens exactly the rows it counts. */
const overdueOpen = (due: SQL): SQL =>
  sql`(${isNull(workstream.closedAt)} AND ${dueDay(due)} < date_trunc('day', now() AT TIME ZONE 'UTC') AND NOT ${STAND_HELD})`

/** Each rung of `WORKSTREAM_PRIORITY_LADDER` as a column — or `null` while the
 *  fact is not one. TWO OF THE FOUR ARE NULL TODAY, and they are named here so
 *  nobody later reads this as a two-rung ladder:
 *
 *   · `waitingOverdue` — E3's inbox lives in `platform.approval`, and platform
 *     does not get to know a branch, so no trigger may derive it.
 *   · `lastContactedAt` — three ledgers folded per page; a column for it would
 *     have needed a trigger on `comms.message`, same fence.
 *
 *  `inverted` marks a column that counts the OTHER WAY from its rung:
 *  `stand_due_at` holds the DEADLINE, while the rung reads the LATENESS, so
 *  the ladder's `desc` becomes `asc` here. Truncated to the day because
 *  `overdueBy` is whole calendar days (`daysUntil`): two runs due the same day
 *  must TIE at this rung and let the next one decide, and a raw timestamp
 *  would break that tie earlier than the engine does. */
const rungSql = (
  stand: StandPair,
): Record<WorkstreamPriorityRung['key'], { at: SQL; inverted: boolean } | null> => ({
  overdueBy: {
    at: sql`CASE WHEN ${STAND_HELD} THEN NULL ELSE ${dueDay(stand.due)} END`,
    inverted: true,
  },
  waitingOverdue: null,
  lastContactedAt: null,
  openedAt: { at: OPENED_AT, inverted: false },
})

/** The ladder translated MECHANICALLY: one term per rung, in the engine's
 *  order, with the engine's direction and null side. A rung with no column
 *  contributes nothing — never a stand-in, which would be a second ladder. */
const priorityOrder = (stand: StandPair): SQL[] => {
  const columns = rungSql(stand)
  return WORKSTREAM_PRIORITY_LADDER.flatMap((rung) => {
    const column = columns[rung.key]
    if (column === null) return []
    const dir = column.inverted === (rung.dir === 'desc') ? 'asc' : 'desc'
    return [sql`${column.at} ${sql.raw(dir)} nulls ${sql.raw(rung.nulls)}`]
  })
}

/** `text[]` literal of bound ids: Drizzle spreads a bare JS array into a `($1, $2)` list. */
const textArray = (ids: readonly string[]): SQL =>
  sql`ARRAY[${sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  )}]::text[]`

/** The ids of `inCharge.people`: the book's page SELECTS this and `inChargeOf`
 *  (`./workstream-seat.ts`) only names them, so the cell and the `owner` filter
 *  read one expression. Seat by the READER's `stand.kind` (`inChargeOf` labels
 *  it on the same three branches): the lead's PIC; the deal's holder by
 *  `holderOf`'s rule (primary seller, first seller, the acceptor, first BD —
 *  JS code-unit order, hence `COLLATE "C"`); else every closer of a live
 *  contract, newest signature first. An absent actor is no person. */
const inChargeIds = (stand: StandPair): SQL<string[]> => sql<string[]>`(CASE
  WHEN ${stand.kind} = 'LD' AND ${workstream.standKind} <> 'HĐ'
    THEN ARRAY(SELECT ic_l.id FROM platform.actor ic_l WHERE ic_l.id = ${lead.ownerId})
  WHEN ${stand.kind} = 'OP' THEN ARRAY(SELECT h.id FROM (
      SELECT ic_a.id, ic_a.name, o.is_primary AS lead_seat,
             CASE WHEN o.role = 'SALE' THEN 1 ELSE 3 END AS rung
        FROM sales.opportunity_owner o JOIN platform.actor ic_a ON ic_a.id = o.actor_id
       WHERE o.opportunity_code = ${workstream.standCode}
         AND (o.role = 'BD' OR ic_a.role_ids && ${textArray(SELLER_ROLES)})
      UNION ALL
      SELECT ic_p.id, ic_p.name, false, 2 FROM sales.opportunity d
        JOIN platform.actor ic_p ON ic_p.id = d.accepted_by_id
       WHERE d.code = ${workstream.standCode}
    ) h ORDER BY h.rung, (h.rung = 1 AND h.lead_seat) DESC, h.name COLLATE "C", h.id COLLATE "C" LIMIT 1)
  ELSE ARRAY(SELECT k.owner_id FROM (
      SELECT DISTINCT ON (ic_k.owner_id) ic_k.owner_id, ic_k.signed_at, ic_k.code
        FROM sales.contract ic_k JOIN platform.actor ic_c ON ic_c.id = ic_k.owner_id
       WHERE ic_k.workstream_code = ${workstream.code} AND NOT ${contractTerminated(sql`ic_k.code`)}
       ORDER BY ic_k.owner_id, ic_k.signed_at DESC, ic_k.code DESC
    ) k ORDER BY k.signed_at DESC, k.code DESC)
END)`

/** The book's `owner` filter: ANY listed id in `inCharge.people`, `OWNER_NONE` = nobody. */
const inChargeAny = (stand: StandPair, csv: string): SQL | undefined => {
  const ids = csvOf(csv)
  const named = ids.filter((id) => id !== OWNER_NONE)
  return or(
    ids.includes(OWNER_NONE) ? sql`cardinality(${inChargeIds(stand)}) = 0` : undefined,
    named.length ? sql`${inChargeIds(stand)} && ${textArray(named)}` : undefined,
  )
}

const READ_COLUMNS = {
  row: workstream,
  lead,
  accountName: account.name,
  saleName: SALE_ACTOR.name,
  bdName: BD_ACTOR.name,
  campaignName: configEntry.name,
  held: STAND_HELD,
  growth: sql<boolean>`${journeyInGrowth(workstream.code)}`,
}

function toRead(r: {
  row: WorkstreamRowDb
  lead: LeadRowDb
  accountName: string | null
  saleName: string | null
  bdName: string | null
  campaignName: string | null
  held: boolean
  growth: boolean
}): WorkstreamRead {
  return {
    row: r.row,
    lead: r.lead,
    accountName: r.accountName,
    saleName: r.saleName,
    bdName: r.bdName,
    campaignName: r.campaignName,
    held: r.held,
    growth: r.growth,
  }
}

/** EVERY channel, including the ones that never fired — the contract promises
 *  seven cells so no screen has to default one to zero itself. */
export const blankFootprint = (): WorkstreamFootprint => ({
  byChannel: Object.fromEntries(WorkstreamChannel.options.map((c) => [c, 0])) as Record<
    (typeof WorkstreamChannel.options)[number],
    number
  >,
  lastContactedAt: null,
})

/** AN ALLOW LIST, NOT A DENY LIST — the mail leg of the footprint.
 *
 *  `platform.email_delivery.aggregate_type` carries no foreign key and no
 *  CHECK, so `<> 'opportunity'` would silently admit whatever third value a
 *  future mail door writes and read it out as customer contact. Only `'lead'`
 *  is a letter leaving the company; `'opportunity'` was the internal ops alert
 *  (dropped by ADR 0085, its old rows remain).
 *
 *  `accepted_at IS NOT NULL` is the mark of the letter having LEFT: a row still
 *  queued, or parked dead, is a promise rather than a contact. The same column
 *  decides the count and the moment, so the two can never disagree. */
const MAIL_IS_CUSTOMER_FACING = sql`d.aggregate_type = 'lead' AND d.accepted_at IS NOT NULL`

/** THREE LEDGERS MERGED, A FOURTH LEFT OUT ON PURPOSE.
 *
 *  Four tables answer "have we talked to this customer", on four anchors:
 *  `comms.link.object_code` (polymorphic, one thread may hang on several
 *  objects), `sales.meeting.subject_code` (a real key, lead or deal),
 *  `platform.email_delivery` (see `MAIL_IS_CUSTOMER_FACING` above), and
 *  `sales.touch` — the one left out. Touch logs business EVENTS (`created`,
 *  `tier-raised`, `signed`), has no channel and no direction column, and a meeting
 *  already writes a touch row beside itself: counting it would double-count
 *  `sales.meeting`. */
/** Gathered across the WHOLE JOURNEY rather than per object — mail sent to the
 *  lead before it became a deal is still contact on this run.
 *  `apps/web/src/data/touches.ts` records that the lead timeline and the deal
 *  timeline are deliberately NOT merged; that decision is about those two
 *  profile screens, and this row is the one place that gathers across. Do not
 *  "fix" this to match them.
 *
 *  `count(DISTINCT m.id)` because one thread may hang on the lead AND on the
 *  deal of the same run, and the join multiplies that message once per link. */
function FOOTPRINT(codes: readonly string[]): SQL {
  const list = sql.join(
    codes.map((c) => sql`${c}`),
    sql`, `,
  )

  return sql`
    WITH live AS (
      SELECT workstream_code AS ws, code FROM sales.lead
       WHERE workstream_code IN (${list}) AND disabled_at IS NULL
    ),
    obj AS (
      SELECT ws, code FROM live
      UNION ALL
      SELECT workstream_code AS ws, code FROM sales.opportunity WHERE workstream_code IN (SELECT ws FROM live)
      UNION ALL
      SELECT workstream_code AS ws, code FROM sales.contract    WHERE workstream_code IN (SELECT ws FROM live)
    )
    SELECT o.ws AS ws, t.channel AS channel, count(DISTINCT m.id)::int AS n, max(m.at) AS last_at
      FROM obj o
      JOIN comms.link k ON k.object_code = o.code
      JOIN comms.thread t ON t.id = k.thread_id
      JOIN comms.message m ON m.thread_id = t.id
     WHERE NOT COALESCE((SELECT bool_and(d.cancelled) FROM comms.debrief d
                          WHERE d.thread_id = t.id), false)
       AND COALESCE(t.external_id, '') NOT LIKE 'letter:%'
     GROUP BY o.ws, t.channel
    UNION ALL
    SELECT o.ws AS ws, 'meeting' AS channel, count(*)::int AS n, max(mt.at) AS last_at
      FROM sales.meeting mt
      JOIN obj o ON o.code = mt.subject_code
     WHERE mt.cancelled_at IS NULL
     GROUP BY o.ws
    UNION ALL
    SELECT l.ws AS ws, 'mail' AS channel, count(*)::int AS n,
           max(COALESCE(d.delivered_at, d.accepted_at)) AS last_at
      FROM platform.email_delivery d
      JOIN live l ON l.code = d.aggregate_id
     WHERE ${MAIL_IS_CUSTOMER_FACING}
     GROUP BY l.ws
  `
}
