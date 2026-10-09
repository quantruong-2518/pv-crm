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
  lt,
  lte,
  or,
  sql,
  type AnyColumn,
  type SQL,
} from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { Inject, Injectable } from '@nestjs/common'
import { WORKSTREAM_PRIORITY_LADDER, type Actor, type WorkstreamPriorityRung } from '@pv/engines'
import {
  WorkstreamChannel,
  type WorkstreamBookQuery,
  type WorkstreamCloseReason,
  type WorkstreamFootprint,
  type WorkstreamStandKind,
} from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { contains } from '@api/platform/db/like'
import { actor } from '@api/platform/db/platform.schema'
import { account } from '../account/account.schema'
import { configEntry } from '../config/config.schema'
import { contract } from '../contract/contract.schema'
import { dealStoodBy } from '../open-deal'
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
   *  latest signature; else LOST when every deal of a PARKED lead is lost with
   *  nothing signed, or a lead with no deal is `disqualified`; else OPEN — which
   *  also REOPENS a closed run. The statement is `./workstream-sync.ts`. The date is floored at `opened_at` for
   *  `workstream_closed_after_opened`; `CHURNED` is never derived. Only rows
   *  whose pair actually changes are written.
   *
   *  Called by every door that can move the answer: deal create, import, a
   *  state change, sign; lead exit and reopen. No door deletes a contract
   *  today — the day one does, it calls this too. */
  syncClosed(tx: Db, workstreamCodes: readonly string[]): Promise<void> {
    return syncClosed(tx, workstreamCodes)
  }

  async book(who: Actor, q: WorkstreamBookQuery, scoped: boolean): Promise<WorkstreamBookPage> {
    const scope = this.scopeOf(who, scoped)
    const stand = this.standPair(who, scoped)
    const filters = this.filtersOf(q, stand)

    /* Count a SECOND time only while the scope axis is actually cutting: for a
       reader who sees the whole book `hidden` is always 0, and a full count to
       print a zero is paying for a question nobody asked. */
    const [scopedTotal, all] = await Promise.all([
      this.count(and(...filters, scope)),
      scope ? this.count(and(...filters)) : Promise.resolve(null),
    ])

    const rows = await this.page(and(...filters, scope), q, stand)

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
        roleIds: actor.roleIds,
      })
      .from(opportunityOwner)
      .innerJoin(actor, eq(actor.id, opportunityOwner.actorId))
      .where(inArray(opportunityOwner.opportunityCode, [...codes]))
      .orderBy(opportunityOwner.role, actor.name)

    const byDeal = new Map<string, OwnerRow[]>()
    for (const r of rows) {
      const owner = { id: r.id, name: r.name, role: r.role, roleIds: r.roleIds }
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
   *  code has to be the same on two reads. */
  async contractsOf(
    codes: readonly string[],
  ): Promise<Map<string, { code: string; deal: string }[]>> {
    if (codes.length === 0) return new Map()

    const rows = await this.db
      .select({ ws: contract.workstreamCode, code: contract.code, deal: contract.opportunityCode })
      .from(contract)
      .where(inArray(contract.workstreamCode, [...codes]))
      .orderBy(desc(contract.signedAt), desc(contract.code))

    const byWorkstream = new Map<string, { code: string; deal: string }[]>()
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
  ): Promise<WorkstreamRead[]> {
    return this.db
      .select(READ_COLUMNS)
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
      .then((rows) => rows.map(toRead))
  }

  /** Counts under the same joins `page()` uses, so both numbers describe the
   *  same set. `account` is joined without a column selected because the search
   *  box reads `account.name`; without it Postgres refuses the statement. */
  private async count(where: SQL | undefined): Promise<number> {
    const [r] = await this.db
      .select({ n: count() })
      .from(workstream)
      .innerJoin(lead, ANCHOR_ON)
      .leftJoin(account, eq(account.code, workstream.accountCode))
      .where(where)
    return r?.n ?? 0
  }

  /** "My run" is "the lead that opened it stands in my name".
   *
   *  By `owner_id`, the same predicate `LeadRepository.scopeOf` uses, and
   *  deliberately WITHOUT asking `opportunity_owner` as well: a run may have no
   *  deal at all, so a scope axis reading the deal table would answer nothing
   *  for every journey still in the funnel. Whoever holds the lead holds the
   *  run. */
  private scopeOf(who: Actor, scoped: boolean): SQL | undefined {
    return scoped && who.ownOnly ? eq(lead.ownerId, who.id) : undefined
  }

  /** The same predicate, SELECTED instead of filtered on — see `byCode`. */
  private inScopeValue(who: Actor): SQL<boolean> {
    const scope = this.scopeOf(who, true)
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

  /** "May this reader open the object the run stands on" — the same predicate
   *  `OpportunityRepository.scopeOf` puts on the deal book, asked about the
   *  deal behind `stand_code`.
   *
   *  ONE question for both kinds, because the service already cuts both on one
   *  axis: it keeps a signature only while the reader stands on the DEAL that
   *  signature came out of (`rowsOf`), never on the contract row itself — no
   *  table names an owner of a contract. */
  private opensStand(who: Actor): SQL {
    return dealStoodBy(STAND_DEAL, who.id)
  }

  /** THE USER's filters. The scope axis stands outside them — see `book()`.
   *  `leadLive` rides here, not in scope: a run whose lead is switched off is
   *  absent from every count, `hidden` included. */
  private filtersOf(
    q: WorkstreamFilters & Pick<WorkstreamBookQuery, 'overdue'>,
    stand: StandPair,
  ): (SQL | undefined)[] {
    return [
      leadLive,
      q.status === 'open'
        ? isNull(workstream.closedAt)
        : q.status === 'closed'
          ? isNotNull(workstream.closedAt)
          : undefined,
      q.accountCode ? eq(workstream.accountCode, q.accountCode) : undefined,
      /* One box, three columns: a run code pasted out of a chat, half the legal
         name, or the customer as the seller says it. Through `contains()` so a
         `%` the user typed stays a character. */
      q.q
        ? or(
            ilike(workstream.code, contains(q.q)),
            ilike(lead.company, contains(q.q)),
            ilike(account.name, contains(q.q)),
          )
        : undefined,
      q.closeReason ? eq(workstream.closeReason, q.closeReason) : undefined,
      /* Half a pair still narrows: the two are independent in the contract, so
         each answers on its own rather than waiting for the other. */
      q.standKind ? sql`${stand.kind} = ${q.standKind}` : undefined,
      q.standKey ? sql`${stand.key} = ${q.standKey}` : undefined,
      /* `false` does not filter: "not overdue" is not a card, and the contract
         only promises the set the overdue card counts. */
      q.overdue === true ? overdueOpen(stand.due) : undefined,
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
    if (q.sort === 'priority') return [...priorityOrder(stand), sql`${workstream.code} desc`]

    const dir = q.dir === 'asc' ? 'asc' : 'desc'
    const primary = q.sort === 'customer' ? CUSTOMER : OPENED_AT
    return [sql`${primary} ${sql.raw(dir)}`, sql`${workstream.code} ${sql.raw(dir)}`]
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
  async scorecard(who: Actor, scoped: boolean): Promise<WorkstreamScorecardTotals> {
    const closedWith = (...reasons: WorkstreamCloseReason[]) =>
      sql<number>`count(*) FILTER (WHERE ${inArray(workstream.closeReason, reasons)})::int`

    const fence = and(leadLive, this.scopeOf(who, scoped))
    const stand = this.standPair(who, scoped)
    const [[r], stages] = await Promise.all([
      this.db
        .select({
          overdue: sql<number>`count(*) FILTER (WHERE ${overdueOpen(stand.due)})::int`,
          won: closedWith('WON'),
          stopped: closedWith('LOST', 'CHURNED'),
        })
        .from(workstream)
        .innerJoin(lead, ANCHOR_ON)
        .where(fence),
      this.standTotals(and(fence, isNull(workstream.closedAt)), stand),
    ])
    return { overdue: r?.overdue ?? 0, won: r?.won ?? 0, stopped: r?.stopped ?? 0, stages }
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
    const [live, signed, dropped] = await Promise.all([
      this.standTotals(and(...this.filtersOf(q, stand), scope), stand),
      this.standTotals(closed, stand),
      this.reasonTotals(closed),
    ])
    return { stand: live, signed, closeReason: dropped }
  }

  /** Grouped BY ORDINAL, never by repeating the two expressions: a scoped
   *  reader's pair carries an `EXISTS`, and Postgres matches no subquery node
   *  to another — the same text in `GROUP BY` comes back as ungrouped. */
  private standTotals(where: SQL | undefined, stand: StandPair): Promise<StandTotal[]> {
    return this.db
      .select({ kind: stand.kind, key: stand.key, n: count() })
      .from(workstream)
      .innerJoin(lead, ANCHOR_ON)
      .leftJoin(account, eq(account.code, workstream.accountCode))
      .where(where)
      .groupBy(sql`1`, sql`2`)
  }

  private reasonTotals(where: SQL | undefined): Promise<CloseReasonTotal[]> {
    return this.db
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
}

/** What BOTH doors narrow by — the book's query minus paging and sorting, which
 *  change which rows come back and never how many match. Borrowed from the
 *  contract rather than declared a second time. */
export type WorkstreamFilters = Pick<
  WorkstreamBookQuery,
  'status' | 'accountCode' | 'q' | 'standKind' | 'standKey' | 'closeReason'
>

/** The rung as THIS reader sees it — see `standPair`. */
type StandPair = { kind: SQL<WorkstreamStandKind>; key: SQL<string>; due: SQL }

/** What the repository counts for the cards; the service names the rungs. */
export type WorkstreamScorecardTotals = {
  overdue: number
  won: number
  stopped: number
  stages: StandTotal[]
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
  rows: WorkstreamRead[]
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
 *  once here — the same formula migration 0045 used for its backfill. */
const NEXT_CODES = (n: number): SQL =>
  sql`SELECT 'WS-' || lpad(nextval('sales.workstream_code_seq')::text, 4, '0') AS code
      FROM generate_series(1, ${n})`

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

/** The deadline's calendar day: what `overdueBy` counts from, shared by the
 *  priority ladder below and by the overdue card and filter so "late" has one
 *  definition. `due` is the reader's `StandPair.due`, never the bare column.
 *
 *  `AT TIME ZONE 'UTC'` because `daysUntil` truncates in UTC and a bare
 *  `date_trunc` follows the session TimeZone, so the two would split at night. */
const dueDay = (due: SQL): SQL => sql`date_trunc('day', (${due}) AT TIME ZONE 'UTC')`

/** "Open and past its deadline" — the ONE predicate behind the overdue card and
 *  the book's `overdue` filter, so the card opens exactly the rows it counts. */
const overdueOpen = (due: SQL): SQL =>
  sql`(${isNull(workstream.closedAt)} AND ${dueDay(due)} < date_trunc('day', now() AT TIME ZONE 'UTC'))`

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
  overdueBy: { at: dueDay(stand.due), inverted: true },
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

const READ_COLUMNS = {
  row: workstream,
  lead,
  accountName: account.name,
  saleName: SALE_ACTOR.name,
  bdName: BD_ACTOR.name,
  campaignName: configEntry.name,
}

function toRead(r: {
  row: WorkstreamRowDb
  lead: LeadRowDb
  accountName: string | null
  saleName: string | null
  bdName: string | null
  campaignName: string | null
}): WorkstreamRead {
  return {
    row: r.row,
    lead: r.lead,
    accountName: r.accountName,
    saleName: r.saleName,
    bdName: r.bdName,
    campaignName: r.campaignName,
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
 *  is a letter leaving the company; `'opportunity'` is an internal alert to
 *  `PV_OPS_NOTIFICATION_TO`.
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
     GROUP BY o.ws, t.channel
    UNION ALL
    SELECT o.ws AS ws, 'meeting' AS channel, count(*)::int AS n, max(mt.at) AS last_at
      FROM sales.meeting mt
      JOIN obj o ON o.code = mt.subject_code
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
