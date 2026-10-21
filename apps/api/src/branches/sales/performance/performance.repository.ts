import { sql } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import type { SalesPeriodFigures } from '@pv/contracts'
import { DB, type Db } from '@api/platform/db/db.module'
import { contract } from '../contract/contract.schema'
import { lead } from '../lead/lead.schema'
import { leadLive } from '../lead/lead-scope'
import { toVndSql } from '../money'
import {
  contractTerminated,
  dealLost,
  dealTerminated,
  dealWon,
  leadHasContract,
} from '../open-deal'
import type { PeriodSpan } from './performance-period'
import { realExchanges } from './real-exchange'

type Row = {
  key: string
  leads: number
  first_contacts: number
  opportunities: number
  contracts: number
  signed_count: number
  signed_amount_vnd: number | string
  blank_amount: number
  won_deals: number
  lost_deals: number
  terminated_deals: number
  reached_first_contacts?: number
  reached_opportunities?: number
}

/** The only SQL of the module: every span of one period read in ONE statement.
 *  It reads the three books' tables directly, the ordinary thing inside one
 *  branch and the call `leaderboard.repository.ts` already made: no one of the
 *  three owns a figure that sets leads beside signatures.
 *
 *  The signing side is the first query of `ContractRepository.summary` with a
 *  fence added. The cohort links a deal or contract to its lead the way
 *  `LeadRepository.scorecard` does, but counts LEADS where that one counts
 *  rows — `SalesCohort` says why the two differ. Won, lost and terminated are
 *  KPI `win-rate`'s predicates and its close-moment fence, over the whole room;
 *  signed figures count live contracts only (ADR 0107).
 *
 *  Span edges are Vietnam calendar days, the form `createdWithin` spells
 *  (`platform/db/book-filter.ts`): the tiles sit beside the lead and contract
 *  books, whose date filters cut there. `ContractRepository.trend` does not. */
@Injectable()
export class PerformanceRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** The Vietnam day on the clock the fences below cut on. `::text`, because a
   *  `date` comes back as a JS `Date` in Node's zone: the second clock again. */
  async today(): Promise<string> {
    const r = (await this.db.execute(
      sql`SELECT ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)::text AS today`,
    )) as { rows: { today: string }[] }
    return r.rows[0]!.today
  }

  /** Figures by span key. Every span asked for comes back, empty ones as zeros:
   *  the spans are the driving table and everything else hangs off them.
   *  `reached` off leaves `firsts` out of the SQL and reads zeros: it scans
   *  every live lead, and only the week view prints it. */
  async figures(
    spans: PeriodSpan[],
    opts: { reached: boolean },
  ): Promise<Map<string, SalesPeriodFigures>> {
    const values = sql.join(
      spans.map(
        (s) => sql`(${s.key}::text,
          (${s.from}::date)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh',
          (${s.to}::date)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')`,
      ),
      sql`, `,
    )

    /* EXISTS per lead keeps a step from outgrowing `leads`; a contract's deal is
       NOT NULL, so `contracts` cannot pass `opportunities`. */
    const r = (await this.db.execute(sql`
      WITH span("key", "lo", "hi") AS (VALUES ${values})${opts.reached ? FIRSTS : sql``}
      SELECT s."key", c.*, g.*, d.*${opts.reached ? sql`, r.*` : sql``}
      FROM span s
      LEFT JOIN LATERAL (
        SELECT count(*)::int                                                    AS leads,
               count(*) FILTER (WHERE EXISTS (
                 ${realExchanges(sql`l."code"`)}))::int                         AS first_contacts,
               count(*) FILTER (WHERE EXISTS (
                 SELECT 1 FROM "sales"."opportunity" o
                  WHERE o."lead_code" = l."code"))::int                         AS opportunities,
               count(*) FILTER (WHERE ${leadHasContract(sql`l."code"`)})::int  AS contracts
          FROM "sales"."lead" l
         WHERE l."disabled_at" IS NULL
           AND l."created_at" >= s."lo" AND l."created_at" < s."hi"
      ) c ON true
      LEFT JOIN LATERAL (
        SELECT count(*)::int                                                    AS signed_count,
               COALESCE(SUM(${toVndSql(contract.amount, contract.currency)}), 0)::bigint
                                                                                AS signed_amount_vnd,
               count(*) FILTER (WHERE ${contract.amount} IS NULL)::int          AS blank_amount
          FROM ${contract} JOIN ${lead} ON ${lead.code} = ${contract.leadCode} AND ${leadLive}
         WHERE ${contract.signedAt} >= s."lo" AND ${contract.signedAt} < s."hi"
           AND NOT ${contractTerminated(contract.code)}
      ) g ON true
      LEFT JOIN LATERAL (
        SELECT count(*) FILTER (WHERE ${dealWon(sql`o."code"`)})::int            AS won_deals,
               count(*) FILTER (WHERE ${dealLost(sql`o."code"`, sql`o."state"`)})::int
                                                                                AS lost_deals,
               count(*) FILTER (WHERE ${dealTerminated(sql`o."code"`)})::int     AS terminated_deals
          FROM "sales"."opportunity" o
          JOIN "sales"."lead" dl ON dl."code" = o."lead_code" AND dl."disabled_at" IS NULL
         WHERE o."closed_at" >= s."lo" AND o."closed_at" < s."hi"
      ) d ON true
      ${opts.reached ? REACHED : sql``}
    `)) as { rows: Row[] }

    /* `bigint` is a string from node-postgres and a number from PGlite. */
    return new Map(
      r.rows.map((row) => [
        row.key,
        {
          cohort: {
            leads: row.leads,
            firstContacts: row.first_contacts,
            opportunities: row.opportunities,
            contracts: row.contracts,
          },
          signedCount: row.signed_count,
          signedAmountVnd: Number(row.signed_amount_vnd),
          blankAmount: row.blank_amount,
          wonDeals: row.won_deals,
          lostDeals: row.lost_deals,
          terminatedDeals: row.terminated_deals,
          reached: {
            firstContacts: row.reached_first_contacts ?? 0,
            opportunities: row.reached_opportunities ?? 0,
          },
        },
      ]),
    )
  }
}

/** Each live lead's first real exchange and first deal. MATERIALIZED: one pass
 *  over the leads serves every span instead of one pass per span. */
const FIRSTS = sql`,
  firsts AS MATERIALIZED (
    SELECT (SELECT min(x.at) FROM (${realExchanges(sql`l."code"`)}) x) AS contact_at,
           (SELECT min(o."created_at") FROM "sales"."opportunity" o
             WHERE o."lead_code" = l."code")                             AS deal_at
      FROM "sales"."lead" l
     WHERE l."disabled_at" IS NULL
  )`

const REACHED = sql`
  LEFT JOIN LATERAL (
    SELECT count(*) FILTER (WHERE f."contact_at" >= s."lo" AND f."contact_at" < s."hi")::int
                                                                      AS reached_first_contacts,
           count(*) FILTER (WHERE f."deal_at" >= s."lo" AND f."deal_at" < s."hi")::int
                                                                      AS reached_opportunities
      FROM firsts f
  ) r ON true`
