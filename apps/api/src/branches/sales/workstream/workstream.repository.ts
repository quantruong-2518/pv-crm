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
  or,
  sql,
  type SQL,
} from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { Inject, Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  WorkstreamChannel,
  type OpportunityOwner,
  type WorkstreamBookQuery,
  type WorkstreamFootprint,
} from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { contains } from '@api/platform/db/like'
import { actor } from '@api/platform/db/platform.schema'
import { account } from '../account/account.schema'
import { configEntry } from '../config/config.schema'
import { contract } from '../contract/contract.schema'
import { CAMPAIGN_ON } from '../lead/lead.repository'
import { lead, type LeadRowDb } from '../lead/lead.schema'
import { leadSigned } from '../open-deal'
import {
  opportunity,
  opportunityOwner,
  type OpportunityRowDb,
} from '../opportunity/opportunity.schema'
import { workstream, type WorkstreamRowDb } from './workstream.schema'

/** The only SQL of the workstream module. It decides nothing about permission
 *  — it only ENFORCES the axis the endpoint declared with `@Need`.
 *
 *  Two properties worth knowing before editing, each argued where it is used:
 *  the communication footprint is gathered from three ledgers in ONE statement
 *  for the whole page (`FOOTPRINT`), and every follow-up read takes the page's
 *  codes at once. A book over four ledgers asked row by row is `4n` round
 *  trips to Neon, which is what makes this screen affordable or not. */
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
   *  latest signature; else LOST when the lead is `disqualified` (at
   *  `exited_at`) or `archived` (at `state_since`); else OPEN — which also REOPENS
   *  a closed run. The date is floored at `opened_at` for
   *  `workstream_closed_after_opened`; `CHURNED` is never derived. Only rows
   *  whose pair actually changes are written.
   *
   *  Called by every door that can move the answer: deal create, import, a
   *  state change, sign; lead exit, reopen and archive. No door deletes a contract
   *  today — the day one does, it calls this too. */
  async syncClosed(tx: Db, workstreamCodes: readonly string[]): Promise<void> {
    if (workstreamCodes.length === 0) return
    await tx.execute(SYNC_CLOSED(workstreamCodes))
  }

  async book(who: Actor, q: WorkstreamBookQuery, scoped: boolean): Promise<WorkstreamBookPage> {
    const scope = this.scopeOf(who, scoped)
    const filters = this.filtersOf(q)

    /* Count a SECOND time only while the scope axis is actually cutting: for a
       reader who sees the whole book `hidden` is always 0, and a full count to
       print a zero is paying for a question nobody asked. */
    const [scopedTotal, all] = await Promise.all([
      this.count(and(...filters, scope)),
      scope ? this.count(and(...filters)) : Promise.resolve(null),
    ])

    const rows = await this.page(and(...filters, scope), q)

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
      .where(eq(workstream.code, code))
      .limit(1)

    return found ? { ...toRead(found), inScope: found.inScope } : null
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
   *  ordering as `OpportunityRepository.ownersOf` — one question, one answer. */
  async dealOwnersOf(codes: readonly string[]): Promise<Map<string, OpportunityOwner[]>> {
    if (codes.length === 0) return new Map()

    const rows = await this.db
      .select({
        code: opportunityOwner.opportunityCode,
        id: opportunityOwner.actorId,
        name: actor.name,
        role: opportunityOwner.role,
      })
      .from(opportunityOwner)
      .innerJoin(actor, eq(actor.id, opportunityOwner.actorId))
      .where(inArray(opportunityOwner.opportunityCode, [...codes]))
      .orderBy(opportunityOwner.role, actor.name)

    const byDeal = new Map<string, OpportunityOwner[]>()
    for (const r of rows) {
      const owner = { id: r.id, name: r.name, role: r.role }
      const list = byDeal.get(r.code)
      if (list) list.push(owner)
      else byDeal.set(r.code, [owner])
    }
    return byDeal
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

  private page(where: SQL | undefined, q: WorkstreamBookQuery): Promise<WorkstreamRead[]> {
    return this.db
      .select(READ_COLUMNS)
      .from(workstream)
      .innerJoin(lead, ANCHOR_ON)
      .leftJoin(account, eq(account.code, workstream.accountCode))
      .leftJoin(SALE_ACTOR, eq(SALE_ACTOR.id, lead.ownerId))
      .leftJoin(BD_ACTOR, eq(BD_ACTOR.id, lead.bdOwnerId))
      .leftJoin(configEntry, CAMPAIGN_ON)
      .where(where)
      .orderBy(...this.orderBy(q))
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

  /** THE USER's filters. The scope axis stands outside them — see `book()`. */
  private filtersOf(q: WorkstreamBookQuery): (SQL | undefined)[] {
    return [
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
    ]
  }

  /** Primary column by `sort`, then ALWAYS `code`.
   *
   *  The tie-break is not decoration: without a stable second key Postgres is
   *  free to return two different orders for two reads of the same page, and a
   *  row then appears on page 1 and page 2 — or on neither. */
  private orderBy(q: WorkstreamBookQuery): SQL[] {
    const dir = q.dir === 'asc' ? 'asc' : 'desc'
    const primary = q.sort === 'customer' ? CUSTOMER : workstream.openedAt

    return [sql`${primary} ${sql.raw(dir)}`, sql`${workstream.code} ${sql.raw(dir)}`]
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

/** One UPDATE for `syncClosed`. The `CASE` around `greatest` is load-bearing:
 *  `greatest` skips NULLs, so an open run would otherwise get `opened_at`. */
function SYNC_CLOSED(codes: readonly string[]): SQL {
  const list = sql.join(
    codes.map((c) => sql`${c}`),
    sql`, `,
  )

  return sql`
    UPDATE sales.workstream w
       SET closed_at = v.closed_at, close_reason = v.close_reason
      FROM (
        SELECT w2.code,
               CASE WHEN x.won THEN greatest(x.signed_at, w2.opened_at)
                    WHEN x.lost_at IS NOT NULL THEN greatest(x.lost_at, w2.opened_at)
               END AS closed_at,
               CASE WHEN x.won THEN 'WON'
                    WHEN x.lost_at IS NOT NULL THEN 'LOST'
               END AS close_reason
          FROM sales.workstream w2
          JOIN LATERAL (
            SELECT ${leadSigned(sql`l.code`)} AS won,
                   (SELECT max(k.signed_at) FROM sales.contract k WHERE k.lead_code = l.code) AS signed_at,
                   CASE l.state WHEN 'disqualified' THEN l.exited_at
                                WHEN 'archived' THEN l.state_since
                   END AS lost_at
              FROM sales.lead l
             WHERE l.workstream_code = w2.code
          ) x ON true
         WHERE w2.code IN (${list})
      ) v
     WHERE w.code = v.code
       AND (w.closed_at, w.close_reason) IS DISTINCT FROM (v.closed_at, v.close_reason)
  `
}

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
 *  objects), `sales.meeting.lead_code` (a real key, lead only),
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
    WITH obj AS (
      SELECT workstream_code AS ws, code FROM sales.lead        WHERE workstream_code IN (${list})
      UNION ALL
      SELECT workstream_code AS ws, code FROM sales.opportunity WHERE workstream_code IN (${list})
      UNION ALL
      SELECT workstream_code AS ws, code FROM sales.contract    WHERE workstream_code IN (${list})
    )
    SELECT o.ws AS ws, t.channel AS channel, count(DISTINCT m.id)::int AS n, max(m.at) AS last_at
      FROM obj o
      JOIN comms.link k ON k.object_code = o.code
      JOIN comms.thread t ON t.id = k.thread_id
      JOIN comms.message m ON m.thread_id = t.id
     GROUP BY o.ws, t.channel
    UNION ALL
    SELECT l.workstream_code AS ws, 'meeting' AS channel, count(*)::int AS n, max(mt.at) AS last_at
      FROM sales.meeting mt
      JOIN sales.lead l ON l.code = mt.lead_code
     WHERE l.workstream_code IN (${list})
     GROUP BY l.workstream_code
    UNION ALL
    SELECT l.workstream_code AS ws, 'mail' AS channel, count(*)::int AS n,
           max(COALESCE(d.delivered_at, d.accepted_at)) AS last_at
      FROM platform.email_delivery d
      JOIN sales.lead l ON l.code = d.aggregate_id
     WHERE ${MAIL_IS_CUSTOMER_FACING}
       AND l.workstream_code IN (${list})
     GROUP BY l.workstream_code
  `
}
